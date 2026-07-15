import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const talkSubmissionExistsGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const supabaseService = inject(SupabaseService);
  const submissionId = route.paramMap.get('submissionId');
  const isStatusRoute = route.routeConfig?.path === ':submissionId';
  const isMarkedInvalid = route.queryParamMap.get('invalidSubmissionId') === 'true';

  return (async () => {
    const invalidUrl = router.createUrlTree(['/talk-submission', submissionId ?? 'invalid'], {
      queryParams: { invalidSubmissionId: 'true' },
    });

    if (isStatusRoute && isMarkedInvalid) {
      return true;
    }

    if (!submissionId || !UUID_PATTERN.test(submissionId)) {
      return invalidUrl;
    }

    return (await supabaseService.talkSubmissionExists(submissionId))
      ? true
      : invalidUrl;
  })();
};
