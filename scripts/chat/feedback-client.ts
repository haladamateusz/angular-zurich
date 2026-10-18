import { createClient } from '@supabase/supabase-js';

const readRpcs = new Set([
  'can_current_user_chat',
  'search_chat_talks',
  'find_chat_entities',
  'get_chat_speaker_archive',
  'rank_chat_speakers',
  'query_chat_archive',
]);

// The evaluation client cannot call table mutations or future event-write RPCs.
export function feedbackEvaluationClient(url: string, publicKey: string, accessToken: string) {
  const origin = new URL(url).origin;
  return createClient(origin, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
      fetch: async (input, init) => {
        const target = new URL(String(input));
        const method = init?.method ?? 'GET';
        const rpc = target.pathname.replace('/rest/v1/rpc/', '');
        if (
          target.origin !== origin ||
          !(
            (method === 'GET' && target.pathname === '/auth/v1/user') ||
            (method === 'POST' && target.pathname.startsWith('/rest/v1/rpc/') && readRpcs.has(rpc))
          )
        )
          throw new DOMException(
            'Evaluation attempted a non-read-only archive operation.',
            'AbortError',
          );
        return fetch(input, {
          ...init,
          redirect: 'error',
          signal: AbortSignal.any([
            AbortSignal.timeout(15_000),
            ...(init?.signal ? [init.signal] : []),
          ]),
        });
      },
    },
  });
}
