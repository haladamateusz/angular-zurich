import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-error-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'alert', 'aria-atomic': 'true' },
  template: `
    <svg class="error-notice__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
      <path d="M12 7.5v5m0 3.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
    <div class="error-notice__body">
      @if (title()) {
        <div class="error-notice__title" role="heading" [attr.aria-level]="headingLevel()">
          {{ title() }}
        </div>
      }
      <p class="error-notice__message">{{ message() }}</p>
      @if (actionLabel()) {
        <button
          type="button"
          class="app-button app-button--secondary error-notice__action"
          [disabled]="actionDisabled()"
          (click)="action.emit()"
        >
          {{ actionLabel() }}
        </button>
      }
      <ng-content />
    </div>
  `,
  styleUrl: './error-notice.component.css',
})
export class ErrorNoticeComponent {
  readonly message = input.required<string>();
  readonly title = input('');
  readonly headingLevel = input<1 | 2 | 3>(2);
  readonly actionLabel = input('');
  readonly actionDisabled = input(false);
  readonly action = output<void>();
}
