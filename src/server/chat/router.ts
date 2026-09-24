import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { ArchiveContext, openContext, sealContext } from './context';
import { parseChatRequest } from './policy';

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const quotaMessages: Record<string, string> = {
  busy: 'A question is already running. Wait a moment before trying again.',
  duplicate: 'This request has already been processed. Send a new question.',
  minute_limit: 'You’ve reached the limit of five questions per minute. Try again shortly.',
  daily_limit: 'You’ve reached today’s limit of 30 questions. It resets at midnight UTC.',
  budget_limit: 'The community’s chat allowance is used up for today. It resets at midnight UTC.',
};

function serverConfig() {
  const budget = Number(process.env['CHAT_DAILY_BUDGET_CENTS'] ?? 200);
  return {
    url: process.env['SUPABASE_URL'] || environment.supabaseUrl,
    key: process.env['SUPABASE_KEY'] || environment.supabaseKey,
    serviceKey: process.env['SUPABASE_SERVICE_ROLE_KEY'],
    openRouterKey: process.env['OPENROUTER_API_KEY'],
    enabled: process.env['CHAT_ENABLED'] === 'true',
    dailyBudget: Number.isSafeInteger(budget) && budget >= 10 && budget <= 10_000 ? budget : 0,
  };
}

async function authenticate(req: Request, res: Response) {
  const config = serverConfig();
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 8_192) {
    res.status(401).json({ error: 'Sign in with an approved account to use chat.' });
    return null;
  }
  if (!config.url || !config.key) {
    res.status(503).json({ error: 'Chat is not configured yet.' });
    return null;
  }
  const client = createClient(config.url, config.key, {
    auth: authOptions,
    global: {
      headers: { Authorization: authorization },
      fetch: (url, init) =>
        fetch(url, {
          ...init,
          signal: AbortSignal.any([
            AbortSignal.timeout(10_000),
            ...(init?.signal ? [init.signal] : []),
          ]),
        }),
    },
  });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !data.user) {
    res.status(401).json({ error: 'Your session has expired. Sign in again.' });
    return null;
  }
  const approval = await client.rpc('can_current_user_chat');
  if (approval.error) {
    res.status(503).json({ error: 'Chat access could not be checked. Please try again later.' });
    return null;
  }
  if (approval.data !== true) {
    res.status(403).json({ error: 'This account is not approved to use chat.' });
    return null;
  }
  return { client, user: data.user, config };
}

export const chatRouter = express.Router();
chatRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
chatRouter.use(express.json({ limit: '32kb' }));

chatRouter.get('/access', async (req, res) => {
  const auth = await authenticate(req, res);
  if (!auth) return;
  const { config } = auth;
  res.json({
    approved: true,
    available: Boolean(
      config.enabled && config.serviceKey && config.openRouterKey && config.dailyBudget,
    ),
  });
});

chatRouter.post('/run', async (req, res) => {
  const auth = await authenticate(req, res);
  if (!auth) return;
  const { config, user, client } = auth;
  if (!config.enabled || !config.serviceKey || !config.openRouterKey || !config.dailyBudget) {
    res.status(503).json({ error: 'Chat is being set up. Please come back soon.' });
    return;
  }
  let input: ReturnType<typeof parseChatRequest>;
  let context: ArchiveContext;
  try {
    input = parseChatRequest(req.body as unknown);
    context = openContext(input.contextToken, user.id, input.threadId, config.serviceKey);
  } catch {
    res.status(400).json({
      error:
        'Send a text question of up to 2,000 characters. Start a new chat if the conversation is too long.',
    });
    return;
  }
  // This client is used only for quota RPCs, never supplied to model tools.
  const ledger = createClient(config.url, config.serviceKey, {
    auth: authOptions,
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }) },
  });
  const reservation = await ledger.rpc('reserve_chat_run', {
    p_user_id: user.id,
    p_run_id: input.runId,
    p_daily_budget_cents: config.dailyBudget,
  });
  if (reservation.error || reservation.data !== 'ok') {
    const code = typeof reservation.data === 'string' ? reservation.data : '';
    res
      .status(code === 'forbidden' ? 403 : reservation.error ? 503 : 429)
      .setHeader('Retry-After', '60');
    res.json({
      error: quotaMessages[code] ?? 'Chat is unavailable for this account. Please try again later.',
    });
    return;
  }

  if (res.destroyed) {
    await ledger.rpc('finish_chat_run', { p_user_id: user.id, p_run_id: input.runId });
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  const disconnected = () => controller.abort();
  res.on('close', disconnected);
  res.status(200).set({ 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const emit = (event: Record<string, unknown>) => {
    if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  emit({ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId });
  const heartbeat = setInterval(() => {
    if (!res.destroyed) res.write(': searching published archive\n\n');
  }, 10_000);
  const started = performance.now();
  const steps: { tool: string; state: string; durationMs?: number }[] = [];
  try {
    const { runArchiveAgent } = await import('./agent');
    const answer = await runArchiveAgent(
      input,
      client,
      config.openRouterKey,
      controller.signal,
      (activity) => {
        if (activity.state === 'running') {
          emit({ type: 'TOOL_CALL_START', toolCallId: activity.id, toolCallName: activity.tool });
          emit({ type: 'TOOL_CALL_ARGS', toolCallId: activity.id, delta: activity.detail });
          emit({ type: 'TOOL_CALL_END', toolCallId: activity.id });
        } else {
          emit({
            type: 'TOOL_CALL_RESULT',
            messageId: crypto.randomUUID(),
            toolCallId: activity.id,
            content: JSON.stringify({ state: activity.state, detail: activity.detail }),
            role: 'tool',
          });
          steps.push({
            tool: activity.tool,
            state: activity.state,
            durationMs: activity.durationMs,
          });
        }
        emit({
          type: 'ACTIVITY_SNAPSHOT',
          messageId: activity.id,
          activityType: 'archive_search',
          content: activity,
          replace: true,
        });
      },
      context,
    );
    // Approval is checked again before disclosing the final result.
    const approval = await client.rpc('can_current_user_chat').abortSignal(controller.signal);
    if (approval.error || approval.data !== true) throw new Error('access_revoked');
    const messageId = crypto.randomUUID();
    emit({
      type: 'CUSTOM',
      name: 'archive_sources',
      value: {
        messageId,
        sources: answer.sources,
        summary: answer.summary,
        nextQuestion: answer.nextQuestion,
        result: answer.result,
      },
    });
    emit({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });
    emit({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: answer.text });
    emit({ type: 'TEXT_MESSAGE_END', messageId });
    emit({
      type: 'STATE_SNAPSHOT',
      snapshot: {
        contextToken: sealContext(answer.context, user.id, input.threadId, config.serviceKey),
      },
    });
    console.info(
      JSON.stringify({
        event: 'archive_run',
        runId: input.runId,
        state: 'complete',
        providerCalls: answer.providerCalls,
        usage: answer.usage,
        durationMs: Math.round(performance.now() - started),
        steps,
      }),
    );
    emit({ type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId });
  } catch (error) {
    const category =
      error instanceof Error &&
      [
        'access_revoked',
        'model_unavailable',
        'archive_unavailable',
        'incomplete_search',
        'model_budget_exceeded',
      ].includes(error.message)
        ? error.message
        : controller.signal.aborted
          ? 'cancelled'
          : 'run_failed';
    console.warn(
      JSON.stringify({
        event: 'archive_run',
        runId: input.runId,
        state: 'failed',
        category,
        durationMs: Math.round(performance.now() - started),
        steps,
      }),
    );
    emit({
      type: 'RUN_ERROR',
      code: 'CHAT_UNAVAILABLE',
      message:
        'The search couldn’t finish. Please try again. If this continues, contact an organizer.',
    });
  } finally {
    controller.abort();
    clearTimeout(timeout);
    clearInterval(heartbeat);
    res.off('close', disconnected);
    // On a failed release the two-minute lease expires; the reservation stays.
    try {
      await ledger.rpc('finish_chat_run', { p_user_id: user.id, p_run_id: input.runId });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }
});

chatRouter.post('/mcp', async (req, res) => {
  const auth = await authenticate(req, res);
  if (!auth) return;
  const { handleArchiveMcp } = await import('./mcp');
  await handleArchiveMcp(req, res, auth.client);
});

chatRouter.use((_req, res) => {
  res.status(404).json({ error: 'Unknown chat endpoint.' });
});
chatRouter.use((error: unknown, _req: Request, res: Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (!res.headersSent)
    res
      .status(error instanceof SyntaxError ? 400 : 503)
      .json({ error: 'The chat request could not be processed.' });
});
