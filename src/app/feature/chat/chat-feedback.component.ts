import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ChatFeedbackContext } from '../../core/models/chat-feedback.model';
import { ChatFeedbackService } from './data-access/chat-feedback.service';

@Component({
  providers: [ChatFeedbackService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-chat-feedback',
  styleUrl: './chat-feedback.component.css',
  template: `
    <div class="feedback-controls" role="group" aria-label="Was this answer useful?">
      <span class="feedback-label">Was this useful?</span>
      <button
        type="button"
        class="app-button feedback-vote"
        [attr.aria-pressed]="feedback.rating() === 'useful'"
        [disabled]="feedback.saving()"
        (click)="feedback.save(context(), 'useful')"
      >
        Useful
      </button>
      <button
        type="button"
        class="app-button feedback-vote"
        [attr.aria-pressed]="feedback.rating() === 'not_quite'"
        [disabled]="feedback.saving()"
        (click)="feedback.save(context(), 'not_quite')"
      >
        Not quite
      </button>
      @if (feedback.rating()) {
        <button
          type="button"
          class="feedback-remove"
          [disabled]="feedback.saving()"
          (click)="feedback.save(context(), null)"
        >
          Remove feedback
        </button>
      }
    </div>
    <p class="feedback-status" role="status">{{ feedback.status() }}</p>
    @if (feedback.error()) {
      <p class="feedback-error" role="alert">{{ feedback.error() }}</p>
    }
  `,
})
export class ChatFeedbackComponent {
  readonly context = input.required<ChatFeedbackContext>();
  protected readonly feedback = inject(ChatFeedbackService);
}
