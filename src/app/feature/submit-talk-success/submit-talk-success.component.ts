import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-submit-talk-success',
  imports: [RouterLink],
  templateUrl: './submit-talk-success.component.html',
  styleUrl: './submit-talk-success.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubmitTalkSuccessComponent {
  private readonly route = inject(ActivatedRoute);

  private readonly paramMap = toSignal(this.route.paramMap);

  protected readonly submissionId = computed(
    () => this.paramMap()?.get('submissionId') ?? null,
  );
  protected readonly hasSubmissionId = computed(
    () => this.submissionId() !== null && this.submissionId() !== 'submitted',
  );
}
