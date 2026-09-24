import { ChatResult } from '../../../core/models/chat-result.model';
import { DestroyRef, Service, inject, signal } from '@angular/core';
import { HttpAgent, Message } from '@ag-ui/client';
import { AuthService } from '../../../core/auth/auth.service';
import { ChatSource, chatSourcesEventSchema } from '../../../core/models/chat-source.model';
import { ChatActivity, chatActivitySchema } from '../../../core/models/chat-activity.model';

interface SearchActivity {
  steps: ChatActivity[];
  state: 'running' | 'complete' | 'failed' | 'cancelled';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources: ChatSource[];
  nextQuestion: string;
  result?: ChatResult;
  activity?: SearchActivity;
}

@Service()
export class ArchiveChatService {
  private readonly auth = inject(AuthService);
  private readonly sources = new Map<string, ChatSource[]>();
  private readonly summaries = new Map<string, string>();
  private readonly nextQuestions = new Map<string, string>();
  private readonly searches = new Map<string, SearchActivity>();
  private questionId = '';
  private contextToken: string | undefined;
  private readonly results = new Map<string, ChatResult>();
  private agent = this.createAgent();
  readonly messages = signal<ChatMessage[]>([]);
  readonly running = signal(false);
  readonly error = signal('');
  readonly accessRevoked = signal(false);
  readonly status = signal('');
  readonly lastQuestion = signal('');
  readonly activity = signal<ChatActivity[]>([]);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.agent.abortRun());
  }

  reset() {
    this.agent.abortRun();
    this.agent = this.createAgent();
    this.contextToken = undefined;
    this.results.clear();
    this.sources.clear();
    this.summaries.clear();
    this.nextQuestions.clear();
    this.searches.clear();
    this.questionId = '';
    this.activity.set([]);
    this.messages.set([]);
    this.lastQuestion.set('');
    this.error.set('');
    this.status.set('');
    this.running.set(false);
    this.accessRevoked.set(false);
  }

  stop() {
    const previous = this.agent;
    this.agent = this.createAgent([...previous.messages], previous.threadId);
    previous.abortRun();
    this.running.set(false);
    this.status.set('Search stopped. You can send another question.');
    this.finishActivity('cancelled');
  }

  async send(question: string): Promise<boolean> {
    const text = question.trim();
    if (this.running() || !text || text.length > 2_000) return false;
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
        this.status.set('Search complete.');
      return true;
    } catch (error) {
      if (agent === this.agent && this.running()) {
        this.error.set(
          error instanceof Error ? error.message : 'Check your connection and try again.',
        );
        this.status.set('');
      }
      return false;
    } finally {
      if (agent === this.agent) {
        this.running.set(false);
        this.finishActivity(this.error() ? 'failed' : 'complete');
      }
    }
  }

  private updateMessages(messages: readonly Readonly<Message>[]) {
    let questionId = '';
    const rendered = messages.flatMap<ChatMessage>((message) => {
      if (
        (message.role !== 'user' && message.role !== 'assistant') ||
        typeof message.content !== 'string' ||
        (message.role === 'assistant' && !message.content)
      )
        return [];
      const sources = this.sources.get(message.id) ?? [];
      if (message.role === 'user') questionId = message.id;
      return [
        {
          id: message.role === 'assistant' ? `${questionId}-response` : message.id,
          role: message.role,
          text:
            this.summaries.get(message.id) ||
            (sources.length ? 'From the published Angular Zürich archive:' : message.content),
          sources,
          result: this.results.get(message.id),
          nextQuestion: this.nextQuestions.get(message.id) ?? '',
          activity: message.role === 'assistant' ? this.searches.get(questionId) : undefined,
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
            sources: [],
            nextQuestion: '',
            activity,
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
          messages,
        });
        const response = await fetch(url, { ...init, headers, body });
        if (!response.ok) {
          const data: unknown = await response.json();
          if (response.status === 401 || response.status === 403) this.accessRevoked.set(true);
          throw new Error(
            typeof data === 'object' &&
              data !== null &&
              'error' in data &&
              typeof data.error === 'string'
              ? data.error
              : 'The search couldn’t finish. Please try again.',
          );
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
        if (event.name === 'archive_sources') {
          const parsed = chatSourcesEventSchema.safeParse(event.value);
          if (parsed.success) {
            this.sources.set(parsed.data.messageId, parsed.data.sources);
            if (parsed.data.result) this.results.set(parsed.data.messageId, parsed.data.result);
            this.summaries.set(parsed.data.messageId, parsed.data.summary ?? '');
            this.nextQuestions.set(parsed.data.messageId, parsed.data.nextQuestion ?? '');
          }
        }
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
    this.searches.set(this.questionId, { steps: this.activity(), state });
    this.updateMessages(this.agent.messages);
  }
}
