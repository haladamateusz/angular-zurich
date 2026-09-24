import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ChatAccessService } from '../../../core/auth/chat-access.service';
import { ArchiveChatService } from '../data-access/archive-chat.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  providers: [ArchiveChatService],
  selector: 'app-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './chat-page.component.css',
  templateUrl: './chat-page.component.html',
})
export class ChatPageComponent {
  private userId: string | undefined;
  private followTranscript = true;
  private readonly auth = inject(AuthService);
  private readonly access = inject(ChatAccessService);
  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('questionInput');
  protected readonly transcript = viewChild<ElementRef<HTMLElement>>('transcript');
  protected readonly chat = inject(ArchiveChatService);
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

  constructor() {
    afterRenderEffect(() => {
      this.chat.messages();
      const transcript = this.transcript()?.nativeElement;
      if (transcript && this.followTranscript) transcript.scrollTop = transcript.scrollHeight;
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

  protected newChat() {
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
    this.followTranscript = true;
    this.question.reset();
    await this.chat.send(question);
    this.textarea()?.nativeElement.focus();
  }

  protected onTranscriptScroll() {
    const transcript = this.transcript()?.nativeElement;
    if (transcript)
      this.followTranscript =
        transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 48;
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
