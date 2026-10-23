import { ErrorNoticeComponent } from '../../ui/error-notice/error-notice.component';
import { Component, inject } from '@angular/core';
import { ToastService, type ToastVariant } from '../../core/toast/toast.service';

@Component({
  selector: 'app-theme-showcase',
  imports: [ErrorNoticeComponent],
  templateUrl: './theme-showcase.component.html',
  styleUrl: './theme-showcase.component.css',
})
export class ThemeShowcaseComponent {
  private readonly toastService = inject(ToastService);

  protected showErrorPreviewFeedback(): void {
    this.toastService.info('This is a preview. No request was sent.');
  }

  protected showToast(variant: ToastVariant): void {
    switch (variant) {
      case 'success':
        this.toastService.success('The event changes are live.', { title: 'Event saved' });
        return;
      case 'info':
        this.toastService.info('Two submissions are waiting for review.', {
          title: 'Review queue',
        });
        return;
      case 'warning':
        this.toastService.warning('The venue capacity has not been confirmed.', {
          title: 'Check venue',
        });
        return;
      case 'error':
        this.toastService.error('We could not publish the event. Please try again.', {
          title: 'Publishing failed',
        });
        return;
    }
  }
}
