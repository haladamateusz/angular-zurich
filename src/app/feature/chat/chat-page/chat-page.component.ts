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
  private pendingQuestionOrigin: DOMRect | undefined;
  private pendingMascotOrigin: DOMRect | undefined;
  private questionFlight:
    | { origin: DOMRect; message: HTMLElement; overlay: HTMLElement; finish: () => void }
    | undefined;
  private readonly auth = inject(AuthService);
  private readonly access = inject(ChatAccessService);
  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('questionInput');
  private readonly mascotSprite = viewChild<ElementRef<HTMLElement>>('mascotSprite');
  private readonly pronunciationAudio =
    viewChild<ElementRef<HTMLAudioElement>>('pronunciationAudio');
  protected readonly pronunciationState = signal<'idle' | 'loading' | 'playing' | 'error'>('idle');
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
      this.animateMascotToHeader();
      const transcript = this.transcript()?.nativeElement;
      if (this.scrollOnSend) this.followTranscript = true;
      if (transcript && this.followTranscript) transcript.scrollTop = transcript.scrollHeight;
      this.scrollOnSend = false;
      if (transcript) this.animateSentQuestion(transcript);
      else this.clearQuestionFlight();
      if (!this.chat.running()) this.onDraftPreviewReady();
    });
    inject(DestroyRef).onDestroy(() => {
      this.clearQuestionFlight();
      const audio = this.pronunciationAudio()?.nativeElement;
      if (audio && !audio.paused) audio.pause();
    });
    effect((onCleanup) => {
      const session = this.auth.session();
      if (this.userId !== session?.user.id) {
        this.userId = session?.user.id;
        this.chat.reset();
      }
      const controller = new AbortController();
      onCleanup(() => controller.abort());
      if (!session) {
        this.chat.reset();
        this.state.set('forbidden');
        return;
      }
      void this.checkAccess(controller.signal);
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
    this.pendingMascotOrigin = undefined;
    this.clearQuestionFlight();
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
    this.clearQuestionFlight();
    const input = this.textarea()?.nativeElement;
    if (!input?.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.pendingQuestionOrigin = input?.getBoundingClientRect();
      if (!this.chat.messages().length)
        this.pendingMascotOrigin = this.mascotSprite()?.nativeElement.getBoundingClientRect();
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
    if (!this.followTranscript) this.clearQuestionFlight();
  }

  protected onDraftPreviewReady() {
    const transcript = this.transcript()?.nativeElement;
    const preview = this.draftPreview()?.nativeElement;
    if (
      this.chat.running() ||
      !this.followTranscript ||
      !transcript ||
      !preview?.querySelector('h2')
    )
      return;
    // Keep the draft heading visible once the asynchronously loaded editor expands.
    transcript.scrollTop +=
      preview.getBoundingClientRect().top - transcript.getBoundingClientRect().top;
    this.followTranscript = false;
    this.clearQuestionFlight();
  }

  private animateMascotToHeader() {
    const mascot = this.mascotSprite()?.nativeElement;
    const origin = this.pendingMascotOrigin;
    if (!origin) return;
    this.pendingMascotOrigin = undefined;
    if (!mascot || !this.chat.messages().length || this.state() !== 'ready') return;
    const destination = mascot.getBoundingClientRect();
    if (!origin.width || !destination.width) return;
    // Animate the wrapper so pose alignment on the image remains independent.
    mascot.style.setProperty('--mascot-flight-x', `${origin.left - destination.left}px`);
    mascot.style.setProperty('--mascot-flight-y', `${origin.top - destination.top}px`);
    mascot.style.setProperty('--mascot-flight-scale', `${origin.width / destination.width}`);
    mascot.classList.add('archive-chat-mascot-moving');
  }

  private animateSentQuestion(transcript: HTMLElement) {
    const surface = transcript.parentElement;
    if (!surface) return;
    if (this.pendingQuestionOrigin) {
      const origin = this.pendingQuestionOrigin;
      this.pendingQuestionOrigin = undefined;
      const messages = transcript.querySelectorAll<HTMLElement>('.archive-message-user');
      const message = messages.item(messages.length - 1);
      if (!message) return;
      const overlay = message.cloneNode(true) as HTMLElement;
      overlay.classList.add('archive-question-flight');
      overlay.setAttribute('aria-hidden', 'true');
      const finish = () => {
        overlay.removeEventListener('animationend', finish);
        overlay.removeEventListener('animationcancel', finish);
        overlay.remove();
        message.style.removeProperty('opacity');
        this.questionFlight = undefined;
      };
      this.questionFlight = { origin, message, overlay, finish };
      overlay.addEventListener('animationend', finish);
      overlay.addEventListener('animationcancel', finish);
      message.style.opacity = '0';
      surface.append(overlay);
    }
    const flight = this.questionFlight;
    if (!flight) return;
    if (!transcript.contains(flight.message)) {
      this.clearQuestionFlight();
      return;
    }
    // Measure after scrolling; keep the landing point aligned as streamed content grows.
    const destination = flight.message.getBoundingClientRect();
    const bounds = surface.getBoundingClientRect();
    if (!destination.width || !destination.height) {
      this.clearQuestionFlight();
      return;
    }
    const style = flight.overlay.style;
    style.left = `${destination.left - bounds.left - surface.clientLeft}px`;
    style.top = `${destination.top - bounds.top - surface.clientTop}px`;
    style.width = `${destination.width}px`;
    style.setProperty('--flight-x', `${flight.origin.left - destination.left}px`);
    style.setProperty('--flight-y', `${flight.origin.top - destination.top}px`);
    style.setProperty('--flight-scale-x', `${flight.origin.width / destination.width}`);
    style.setProperty('--flight-scale-y', `${flight.origin.height / destination.height}`);
  }

  private clearQuestionFlight() {
    this.pendingQuestionOrigin = undefined;
    this.questionFlight?.finish();
  }

  protected onQuestionKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229)
      return;
    event.preventDefault();
    if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) void this.submit();
  }

  private async checkAccess(signal?: AbortSignal) {
    this.state.set('loading');
    try {
      const state = await this.access.check(signal);
      if (!signal?.aborted) this.state.set(state);
    } catch {
      if (!signal?.aborted) this.state.set('error');
    }
  }
}
