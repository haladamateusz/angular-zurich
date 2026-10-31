import { ErrorNoticeComponent } from '../../../ui/error-notice/error-notice.component';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EventDraftPreviewComponent } from '../event-draft-preview.component';
import { AuthService } from '../../../core/auth/auth.service';
import { ChatAccessService } from '../../../core/auth/chat-access.service';
import { ArchiveChatService } from '../data-access/archive-chat.service';
import { ChatFeedbackComponent } from '../chat-feedback.component';

@Component({
  imports: [
    ErrorNoticeComponent,
    ReactiveFormsModule,
    RouterLink,
    ChatFeedbackComponent,
    NgOptimizedImage,
    NgTemplateOutlet,
    EventDraftPreviewComponent,
  ],
  providers: [ArchiveChatService],
  selector: 'app-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './chat-page.component.css',
  templateUrl: './chat-page.component.html',
})
export class ChatPageComponent {
  private userId: string | undefined;
  private followTranscript = true;
  private scrollOnSend = false;
  private pendingQuestionAnimation = false;
  private readonly auth = inject(AuthService);
  private readonly sessionUserId = computed(() => this.auth.session()?.user.id);
  private readonly sessionAccessToken = computed(() => this.auth.session()?.access_token);
  private readonly access = inject(ChatAccessService);
  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('questionInput');
  private readonly pronunciationAudio =
    viewChild<ElementRef<HTMLAudioElement>>('pronunciationAudio');
  protected readonly pronunciationState = signal<'idle' | 'loading' | 'playing' | 'error'>('idle');
  private readonly searchError = viewChild<unknown, ElementRef<HTMLElement>>('searchError', {
    read: ElementRef,
  });
  private readonly draftPreview = viewChild<ElementRef<HTMLElement>>('draftPreview');
  protected readonly transcript = viewChild<ElementRef<HTMLElement>>('transcript');
  protected readonly chat = inject(ArchiveChatService);
  protected readonly latestResponseId = computed(() => {
    const message = this.chat.messages().at(-1);
    return message?.role === 'assistant' ? message.id : null;
  });
  private readonly mascotThinkingComplete = signal(false);
  protected readonly respondingMascot = computed(() => {
    const message = this.chat.messages().at(-1);
    if (!this.chat.running() || message?.role !== 'assistant') return null;

    const hasResponse =
      this.chat.writingAnswer() || !!message.text || message.sources.length > 0 || !!message.result;
    const thinking = !this.mascotThinkingComplete() && !hasResponse;
    return {
      messageId: message.id,
      scale: 1.19,
      offsetX: thinking ? '0%' : '-12.5%',
      offsetY: thinking ? '-3%' : '0%',
      src: thinking
        ? '/angular-mascots/Google_Angular_Mascot_2D_Question_Thinking.svg'
        : '/angular-mascots/Google_Angular_Mascot_2D_Coding_Animated.svg',
      stillSrc: thinking
        ? '/angular-mascots/Google_Angular_Mascot_2D_Question.svg'
        : '/angular-mascots/Google_Angular_Mascot_2D_Coding.svg',
    };
  });
  private readonly route = inject(ActivatedRoute);
  protected readonly latestDraft = computed(() =>
    this.chat
      .messages()
      .slice()
      .reverse()
      .map((message) => message.result)
      .find((result) => result?.kind === 'event_draft'),
  );
  protected readonly draftId = computed(() => {
    const result = this.latestDraft();
    return result?.kind === 'event_draft'
      ? result.draftId
      : this.route.snapshot.queryParamMap.get('draft');
  });
  protected readonly draftVersion = computed(() => {
    const result = this.latestDraft();
    return result?.kind === 'event_draft' ? result.version : 0;
  });
  protected readonly question = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(2_000)],
  });
  protected readonly form = new FormGroup({ question: this.question });
  protected readonly state = signal<'loading' | 'ready' | 'setup' | 'forbidden' | 'error'>(
    'loading',
  );
  protected readonly userFirstName = computed(() => {
    const metadata = this.auth.session()?.user.user_metadata;
    const name = [metadata?.['given_name'], metadata?.['first_name'], metadata?.['full_name']].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );

    return name?.trim().split(/\s+/)[0] ?? null;
  });

  protected readonly welcomeQuestion = computed(() => {
    const name = this.userFirstName();
    return `Which talk are you looking for${name ? `, ${name}` : ''}?`;
  });

  constructor() {
    effect((onCleanup) => {
      // Depend on the response identity, so incoming tokens do not restart the loop.
      const responseId = this.chat.running() ? this.latestResponseId() : null;
      this.mascotThinkingComplete.set(false);
      if (!responseId) return;

      const timer = setTimeout(() => this.mascotThinkingComplete.set(true), 5_000);
      onCleanup(() => clearTimeout(timer));
    });
    afterRenderEffect(() => {
      this.chat.messages();
      const transcript = this.transcript()?.nativeElement;
      if (this.scrollOnSend) this.followTranscript = true;
      if (transcript && this.followTranscript)
        transcript.scrollTop =
          this.searchError()?.nativeElement.offsetTop ?? transcript.scrollHeight;
      this.scrollOnSend = false;
      if (transcript) this.animateSentQuestion(transcript);
      else this.pendingQuestionAnimation = false;
      if (!this.chat.running()) this.onDraftPreviewReady();

    });
    inject(DestroyRef).onDestroy(() => {
      const audio = this.pronunciationAudio()?.nativeElement;
      if (audio && !audio.paused) audio.pause();
    });
    effect((onCleanup) => {
      const userId = this.sessionUserId();
      const token = this.sessionAccessToken();
      const userChanged = this.userId !== userId;
      if (userChanged) {
        this.userId = userId;
        this.chat.reset();
        this.followTranscript = true;
      }
      const controller = new AbortController();
      onCleanup(() => controller.abort());
      if (!userId || !token) {
        this.chat.reset();
        this.state.set('forbidden');
        return;
      }
      // Refocusing a tab can re-emit the same session. Only changed credentials
      // recheck access, and token refreshes must keep the current view mounted.
      const background = !userChanged && untracked(this.state) === 'ready';
      untracked(() => void this.checkAccess(controller.signal, background));
    });
    effect(() => {
      if (this.chat.accessRevoked()) {
        this.chat.reset();
        this.state.set('forbidden');
      }
    });
  }

  protected async retryAccess() {
    await this.checkAccess();
  }

  protected async togglePronunciation() {
    const audio = this.pronunciationAudio()?.nativeElement;
    if (!audio || this.pronunciationState() === 'loading') return;
    if (this.pronunciationState() === 'playing') {
      audio.pause();
      this.pronunciationState.set('idle');
      return;
    }

    this.pronunciationState.set('loading');
    audio.currentTime = 0;
    try {
      await audio.play();
    } catch (error: unknown) {
      this.pronunciationState.set(
        error instanceof DOMException && error.name === 'AbortError' ? 'idle' : 'error',
      );
    }
  }

  protected newChat() {
    this.pendingQuestionAnimation = false;
    this.chat.reset();
    this.question.reset();
    this.textarea()?.nativeElement.focus();
  }

  protected useExample(question: string) {
    this.question.setValue(question);
    this.textarea()?.nativeElement.focus();
  }

  protected async submit() {
    if (this.question.invalid || this.chat.running() || !this.question.value.trim()) return;
    const question = this.question.value;
    this.pendingQuestionAnimation = false;
    const input = this.textarea()?.nativeElement;
    if (!input?.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.pendingQuestionAnimation = true;
    }
    this.followTranscript = true;
    this.scrollOnSend = true;
    this.question.reset();
    await this.chat.send(question);
    this.textarea()?.nativeElement.focus();
  }

  protected onTranscriptScroll() {
    if (this.scrollOnSend) return;
    const transcript = this.transcript()?.nativeElement;
    if (transcript)
      this.followTranscript =
        transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 48;
  }

  protected onDraftPreviewReady() {
    const transcript = this.transcript()?.nativeElement;
    const preview = this.draftPreview()?.nativeElement;
    if (
      this.chat.running() ||
      !!this.chat.error() ||
      !this.followTranscript ||
      !transcript ||
      !preview?.querySelector('h2')
    )
      return;
    // Keep the draft heading visible once the asynchronously loaded editor expands.
    transcript.scrollTop +=
      preview.getBoundingClientRect().top - transcript.getBoundingClientRect().top;
    this.followTranscript = false;
    this.pendingQuestionAnimation = false;
  }

  private animateSentQuestion(transcript: HTMLElement) {
    if (!this.pendingQuestionAnimation) return;
    this.pendingQuestionAnimation = false;
    const messages = transcript.querySelectorAll<HTMLElement>('.archive-message-user');
    // Animate the actual bubble once, after it has landed in the scrolled transcript.
    messages.item(messages.length - 1)?.classList.add('archive-question-sent');
  }

  protected onQuestionKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229)
      return;
    event.preventDefault();
    if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) void this.submit();
  }

  private async checkAccess(signal?: AbortSignal, background = false) {
    if (!background) this.state.set('loading');
    try {
      const state = await this.access.check(signal);
      if (!signal?.aborted) this.state.set(state);
    } catch {
      if (!signal?.aborted && !background) this.state.set('error');
    }
  }
}
