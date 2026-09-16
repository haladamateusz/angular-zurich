import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { talkSubmissionExistsGuard } from './talk-submission-exists.guard';

describe('talkSubmissionExistsGuard', () => {
  const id = '12345678-1234-4234-8234-123456789abc';
  const exists = vi.fn();

  beforeEach(() => {
    exists.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: { talkSubmissionExists: exists } },
      ],
    });
  });

  function run(submissionId: string | null, path = ':submissionId', invalid = false) {
    const route = new ActivatedRouteSnapshot();
    Object.defineProperties(route, {
      paramMap: { value: convertToParamMap(submissionId ? { submissionId } : {}) },
      queryParamMap: { value: convertToParamMap(invalid ? { invalidSubmissionId: 'true' } : {}) },
      routeConfig: { value: { path } },
    });
    return TestBed.runInInjectionContext(() =>
      talkSubmissionExistsGuard(route, {} as RouterStateSnapshot),
    );
  }

  it.each([null, 'not-a-uuid', '../dashboard'])(
    'rejects invalid IDs without a database request: %s',
    async (value) => {
      const result = await run(value);
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).queryParams['invalidSubmissionId']).toBe('true');
      expect(exists).not.toHaveBeenCalled();
    },
  );

  it('allows an existing submission', async () => {
    expect(await run(id)).toBe(true);
    expect(exists).toHaveBeenCalledWith(id);
  });

  it('redirects missing submissions to their invalid status page', async () => {
    exists.mockResolvedValue(false);
    const result = await run(id);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      `/talk-submission/${id}?invalidSubmissionId=true`,
    );
  });

  it('allows the invalid status page without creating a redirect loop', async () => {
    expect(await run(id, ':submissionId', true)).toBe(true);
    expect(exists).not.toHaveBeenCalled();
  });

  it('does not let the invalid marker bypass an edit-route existence check', async () => {
    exists.mockResolvedValue(false);
    expect(await run(id, ':submissionId/edit', true)).toBeInstanceOf(UrlTree);
    expect(exists).toHaveBeenCalledWith(id);
  });
});
