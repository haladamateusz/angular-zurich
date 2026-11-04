import { ChatHistoryService } from './chat-history.service';
import { HistoryPage } from '../../../core/models/chat-history.model';
import { ChatResult } from '../../../core/models/chat-result.model';
import { ChatFeedbackContext } from '../../../core/models/chat-feedback.model';
import { DestroyRef, Service, inject, signal } from '@angular/core';
import { HttpAgent, Message } from '@ag-ui/client';
import { AuthService } from '../../../core/auth/auth.service';
import { ChatSource, chatSourcesEventSchema } from '../../../core/models/chat-source.model';
import { ChatActivity, chatActivitySchema } from '../../../core/models/chat-activity.model';

interface SearchActivity {
  steps: ChatActivity[];
  state: 'running' | 'complete' | 'failed' | 'cancelled';
  error?: string;
  question?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources: ChatSource[];
  result?: ChatResult;
  activity?: SearchActivity;
  interrupted?: 'stopped' | 'failed';
  feedback?: ChatFeedbackContext;
}

@Service()
export class ArchiveChatService {
  private readonly auth = inject(AuthService);
  private readonly history = inject(ChatHistoryService);
  private loadController: AbortController | undefined;
  private runId: string | undefined;
  readonly threadId = signal<string | null>(null);
  readonly revision = signal(0);
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly before = signal<number | null>(null);
  readonly remoteRun = signal<string | null>(null);
  readonly recoveredDraftId = signal<string | undefined>(undefined);
  private owner: string | undefined;

  setOwner(userId: string | undefined) {
    if (this.owner === userId) return;
    this.owner = userId;
    this.reset();
    this.history.reset();
  }
  private readonly sources = new Map<string, ChatSource[]>();
  private readonly answerIds = new Map<string, string>();
  private readonly interruptedAnswers = new Map<string, 'stopped' | 'failed'>();
  private readonly searches = new Map<string, SearchActivity>();
  private readonly completedAnswers = new Set<string>();
  private questionId = '';
  private contextToken: string | undefined;
  private readonly results = new Map<string, ChatResult>();
  private agent = this.createAgent();
  readonly messages = signal<ChatMessage[]>([]);
  readonly running = signal(false);
  readonly writingAnswer = signal(false);
  readonly error = signal('');
  readonly accessRevoked = signal(false);
  readonly status = signal('');
  readonly lastQuestion = signal('');
  readonly activity = signal<ChatActivity[]>([]);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.agent.abortRun());
  }

  reset() {
    if (this.running()) this.stop();
    this.loadController?.abort();
    this.loadController = undefined;
    this.agent.abortRun();
    this.agent = this.createAgent();
    this.threadId.set(null);
    this.revision.set(0);
    this.before.set(null);
    this.loading.set(false);
    this.loadError.set('');
    this.remoteRun.set(null);
    this.recoveredDraftId.set(undefined);
    this.runId = undefined;
    this.contextToken = undefined;
    this.results.clear();
    this.sources.clear();
    this.answerIds.clear();
    this.searches.clear();
    this.interruptedAnswers.clear();
    this.completedAnswers.clear();
    this.questionId = '';
    this.activity.set([]);
    this.messages.set([]);
    this.lastQuestion.set('');
    this.error.set('');
    this.status.set('');
    this.running.set(false);
    this.writingAnswer.set(false);
    this.accessRevoked.set(false);
  }

  stop() {
    const stoppedThread = this.threadId();
    if (this.history.enabled() && stoppedThread && this.runId) {
      void this.history.stop(this.threadId()!, this.runId).catch((error: unknown) => {
        if (this.threadId() === stoppedThread)
          this.status.set(
            error instanceof Error
              ? error.message
              : 'Stop could not be confirmed. Reload the conversation.',
          );
      });
    }
    if (this.writingAnswer()) this.interruptedAnswers.set(this.questionId, 'stopped');
    const previous = this.agent;
    this.agent = this.createAgent([...previous.messages], previous.threadId);
    previous.abortRun();
    this.running.set(false);
    this.writingAnswer.set(false);
    this.status.set('Response stopped. You can send another question.');
    if (this.searches.get(this.questionId)?.state === 'running') this.finishActivity('cancelled');
    else this.updateMessages(this.agent.messages);
  }

  async send(question: string): Promise<boolean> {
    const text = question.trim();
    if (
      this.running() ||
      this.loading() ||
      this.loadError() ||
      this.remoteRun() ||
      !text ||
      text.length > 2_000
    )
      return false;
    const agent = this.agent;
    this.lastQuestion.set(text);
    this.error.set('');
    this.status.set('Choosing archive tools…');
    this.activity.set([]);
    this.running.set(true);
    this.questionId = crypto.randomUUID();
    this.searches.set(this.questionId, { steps: [], state: 'running' });
    agent.addMessage({ id: this.questionId, role: 'user', content: text });
    this.updateMessages(agent.messages);
    try {
      await agent.runAgent();
      if (agent === this.agent && !this.error() && this.running())
        this.status.set('Answer complete.');
      return true;
    } catch (error) {
      if (agent === this.agent && this.running()) {
        if (!this.error())
          this.error.set(
            error instanceof Error ? error.message : 'Check your connection and try again.',
          );
        this.status.set('');
      }
      return false;
    } finally {
      if (agent === this.agent) {
        this.running.set(false);
        if (this.error() && this.answerIds.has(this.questionId))
          this.interruptedAnswers.set(this.questionId, 'failed');
        this.writingAnswer.set(false);
        if (this.error() || this.searches.get(this.questionId)?.state === 'running')
          this.finishActivity(this.error() ? 'failed' : 'complete');
        else this.updateMessages(agent.messages);
      }
    }
  }

  async open(threadId: string, reload = false) {
    if (!reload && threadId === this.threadId() && !this.loadError()) return;
    this.reset();
    this.threadId.set(threadId);
    this.loading.set(true);
    const controller = new AbortController();
    this.loadController = controller;
    try {
      const page = await this.history.read(threadId, undefined, controller.signal);
      if (controller.signal.aborted) return;
      this.hydrate(page);
    } catch (error) {
      if (!controller.signal.aborted)
        this.loadError.set(
          error instanceof Error ? error.message : 'This conversation could not be opened.',
        );
    } finally {
      if (!controller.signal.aborted) this.loading.set(false);
    }
  }

  async loadEarlier() {
    const before = this.before(),
      threadId = this.threadId();
    if (!before || !threadId || this.loading() || this.running()) return;
    this.loading.set(true);
    try {
      const page = await this.history.read(threadId, before, this.loadController?.signal);
      if (threadId !== this.threadId()) return;
      if (page.thread.revision !== this.revision())
        throw new Error('This conversation changed in another tab. Reload it before continuing.');
      const existing = [...this.agent.messages];
      this.hydrate(page);
      const earlier = [...this.agent.messages];
      const ids = new Set(earlier.map((message) => message.id));
      this.agent = this.createAgent(
        [...earlier, ...existing.filter((message) => !ids.has(message.id))],
        threadId,
      );
      this.updateMessages(this.agent.messages);
    } catch (error) {
      if (threadId === this.threadId())
        this.error.set(
          error instanceof Error ? error.message : 'Earlier messages could not be loaded.',
        );
    } finally {
      if (threadId === this.threadId()) this.loading.set(false);
    }
  }

  private hydrate(page: HistoryPage) {
    this.revision.set(page.thread.revision);
    this.before.set(page.before);
    this.remoteRun.set(page.activeRun);
    this.recoveredDraftId.set(page.draftId);
    const messages: Message[] = [];
    for (const message of page.messages) {
      messages.push({ id: message.id, role: message.role, content: message.text });
      if (message.role !== 'assistant' || !message.reply_to) continue;
      const questionId = message.reply_to;
      this.answerIds.set(questionId, message.id);
      this.sources.set(message.id, message.payload.sources);
      if (message.payload.result) this.results.set(message.id, message.payload.result);
      const complete = message.status === 'complete';
      this.searches.set(questionId, {
        steps: message.payload.activity.map((step) =>
          step.state === 'running' && message.status !== 'running'
            ? { ...step, state: 'cancelled' }
            : step,
        ),
        state: complete
          ? 'complete'
          : message.status === 'running'
            ? 'running'
            : message.status === 'failed'
              ? 'failed'
              : 'cancelled',
        error: message.payload.error,
        question: page.messages.find((item) => item.id === questionId)?.text,
      });
      if (complete) this.completedAnswers.add(questionId);
      else if (message.status !== 'running')
        this.interruptedAnswers.set(
          questionId,
          message.status === 'stopped' ? 'stopped' : 'failed',
        );
    }
    this.agent = this.createAgent(messages, page.thread.id);
    this.updateMessages(messages);
  }

  private updateMessages(messages: readonly Readonly<Message>[]) {
    let questionId = '';
    let question = '';
    const rendered = messages.flatMap<ChatMessage>((message) => {
      if (
        (message.role !== 'user' && message.role !== 'assistant') ||
        typeof message.content !== 'string'
      )
        return [];
      const sources = this.sources.get(message.id) ?? [];
      if (message.role === 'user') {
        questionId = message.id;
        question = message.content;
      }
      return [
        {
          id: message.role === 'assistant' ? `${questionId}-response` : message.id,
          role: message.role,
          text: message.content,
          sources,
          result: this.results.get(message.id),
          activity: message.role === 'assistant' ? this.searches.get(questionId) : undefined,
          interrupted:
            message.role === 'assistant' ? this.interruptedAnswers.get(questionId) : undefined,
          feedback:
            message.role === 'assistant' &&
            message.content.trim() &&
            this.completedAnswers.has(questionId) &&
            this.answerIds.get(questionId) === message.id
              ? {
                  threadId: this.agent.threadId,
                  messageId: message.id,
                  question,
                  answer: message.content,
                  sourceIds: sources.map((source) => source.id),
                  result: this.results.get(message.id),
                }
              : undefined,
        },
      ];
    });
    this.messages.set(
      rendered.flatMap((message, index) => {
        const activity = this.searches.get(message.id);
        if (message.role !== 'user' || !activity || rendered[index + 1]?.role === 'assistant')
          return [message];
        // Paint the response immediately, before any tool or answer events arrive.
        return [
          message,
          {
            id: `${message.id}-response`,
            role: 'assistant' as const,
            text: '',
            sources: this.sources.get(this.answerIds.get(message.id) ?? '') ?? [],
            result: this.results.get(this.answerIds.get(message.id) ?? ''),
            activity,
            interrupted: this.interruptedAnswers.get(message.id),
          },
        ];
      }),
    );
  }

  private createAgent(messages: Message[] = [], threadId: string = crypto.randomUUID()): HttpAgent {
    const agent: HttpAgent = new HttpAgent({
      agentId: 'archive',
      url: '/api/chat/run',
      threadId,
      fetch: async (url, init) => {
        const token = this.auth.session()?.access_token;
        if (!token) throw new Error('Please sign in again.');
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${token}`);
        // Only recent user questions are context. Never resend rendered records,
        // tool output, or an ever-growing transcript to the backend.
        const input = JSON.parse(String(init.body)) as { runId: string };
        this.runId = input.runId;
        let remaining = 6_000;
        const messages = agent.messages
          .filter((message) => message.role === 'user')
          .slice(-6)
          .reverse()
          .filter((message) => {
            if (typeof message.content !== 'string' || message.content.length > remaining)
              return false;
            remaining -= message.content.length;
            return true;
          })
          .reverse()
          .map((message) => ({ role: 'user', content: message.content }));
        const body = JSON.stringify({
          runId: input.runId,
          threadId: agent.threadId,
          contextToken: this.contextToken,
          questionId: this.questionId,
          revision: this.revision(),
          messages: this.history.enabled() ? messages.slice(-1) : messages,
        });
        const response = await fetch(url, { ...init, headers, body });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) this.accessRevoked.set(true);
          const data: unknown = await response.json().catch(() => null);
          throw new Error(
            typeof data === 'object' &&
              data !== null &&
              'error' in data &&
              typeof data.error === 'string'
              ? data.error
              : 'The search couldn’t finish. Please try again.',
          );
        }
        if (!response.headers.get('content-type')?.includes('text/event-stream')) {
          throw new Error('The chat server returned an unexpected response. Please try again.');
        }
        return response;
      },
    });
    for (const message of messages) agent.addMessage(message);
    agent.subscribe({
      onMessagesChanged: ({ messages }) => {
        if (agent === this.agent) this.updateMessages(messages);
      },
      onStateSnapshotEvent: ({ event }) => {
        if (agent !== this.agent || !this.running()) return;
        const snapshot = event.snapshot as { contextToken?: unknown } | null;
        if (
          snapshot &&
          typeof snapshot.contextToken === 'string' &&
          snapshot.contextToken.length <= 16_000
        )
          this.contextToken = snapshot.contextToken;
      },
      onActivitySnapshotEvent: ({ event }) => {
        if (agent !== this.agent || !this.running() || event.activityType !== 'archive_search')
          return;
        const parsed = chatActivitySchema.safeParse(event.content);
        if (!parsed.success) return;
        const activity = parsed.data;
        this.activity.update((items) =>
          items.some((item) => item.id === activity.id)
            ? items.map((item) => (item.id === activity.id ? activity : item))
            : [...items, activity].slice(-12),
        );
        this.searches.set(this.questionId, { steps: this.activity(), state: 'running' });
        this.updateMessages(agent.messages);
        this.status.set(
          activity.state === 'running'
            ? `${activity.label}…`
            : activity.state === 'failed'
              ? 'Archive lookup failed.'
              : 'Preparing the answer from retrieved records…',
        );
      },
      onCustomEvent: ({ event }) => {
        if (agent !== this.agent || !this.running()) return;
        if (event.name === 'history_saved') {
          const value = event.value as { threadId?: unknown; revision?: unknown };
          if (value.threadId === agent.threadId && typeof value.revision === 'number') {
            this.threadId.set(agent.threadId);
            this.revision.set(value.revision);
            void this.history.refresh();
          }
        }
        if (event.name === 'archive_sources') {
          const parsed = chatSourcesEventSchema.safeParse(event.value);
          if (parsed.success) {
            this.sources.set(parsed.data.messageId, parsed.data.sources);
            if (parsed.data.result) this.results.set(parsed.data.messageId, parsed.data.result);
            this.answerIds.set(this.questionId, parsed.data.messageId);
            this.finishActivity('complete');
            this.writingAnswer.set(true);
            this.status.set('Writing the answer…');
          }
        }
      },
      onTextMessageEndEvent: () => {
        if (agent === this.agent) this.writingAnswer.set(false);
      },
      onRunFinishedEvent: () => {
        if (agent !== this.agent || !this.running() || this.error()) return;
        this.completedAnswers.add(this.questionId);
        this.updateMessages(agent.messages);
      },
      onRunErrorEvent: ({ event }) => {
        if (agent === this.agent) {
          this.error.set(event.message);
          this.status.set('');
        }
      },
    });
    return agent;
  }

  private finishActivity(state: SearchActivity['state']) {
    this.activity.update((items) =>
      items.map((item) =>
        item.state === 'running'
          ? { ...item, state: state === 'complete' ? 'cancelled' : state }
          : item,
      ),
    );
    this.searches.set(this.questionId, {
      steps: this.activity(),
      state,
      ...(state === 'failed'
        ? {
            error: this.error() || 'The request could not finish. Please try again.',
            question: this.lastQuestion(),
          }
        : {}),
    });
    this.updateMessages(this.agent.messages);
  }
}
