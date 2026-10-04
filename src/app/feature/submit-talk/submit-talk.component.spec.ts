import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { TalkSubmissionDeviceAuthService } from '../../core/data-access/talk-submission-device-auth.service';
import { ThemeService } from '../../core/theme/theme.service';
import { environment } from '../../../environments/environment';
import { SubmitTalkComponent } from './submit-talk.component';

const organizers = [
  { slug: 'mateusz-halada', first_name: 'Mateusz', last_name: 'Halada' },
  { slug: 'tomas-trajan', first_name: 'Tomas', last_name: 'Trajan' },
];

const editableSubmission = {
  id: 'proposal',
  can_edit: true,
  status: 'initially_submitted',
  talk_title: 'Signals in Angular',
  talk_description: 'A practical guide to building applications using Angular signals.',
  slides_url: 'https://example.com/slides',
  speaker_first_name: 'Mateusz',
  speaker_last_name: 'Halada',
  speaker_email: 'speaker@example.com',
  speaker_bio: 'An experienced Angular developer and organizer.',
  organizer_speaker_id: 'person-id',
  organizer_speaker_picture_url: 'https://example.com/photo.jpg',
  speaker_picture_path: null,
};

describe('SubmitTalkComponent organizer proposals', () => {
  const authenticated = signal(true);
  const initialized = signal(true);
  const getOrganizers = vi.fn();
  const submitTalk = vi.fn();
  const updateTalkSubmission = vi.fn();
  const storeEditToken = vi.fn();
  const render = vi.fn().mockReturnValue('captcha-widget');
  const remove = vi.fn();
  const originalSiteKey = environment.turnstileSiteKey;

  beforeEach(() => {
    vi.clearAllMocks();
    authenticated.set(true);
    initialized.set(true);
    environment.turnstileSiteKey = 'test-site-key';
    window.turnstile = { render, remove, reset: vi.fn() };
    getOrganizers.mockResolvedValue({ data: organizers, error: null });
    submitTalk.mockResolvedValue({ data: { id: 'proposal', editToken: 'token' }, error: null });
    updateTalkSubmission.mockResolvedValue({
      data: { id: 'proposal', status: 'adjusted' },
      error: null,
    });
    TestBed.configureTestingModule({
      imports: [SubmitTalkComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
        {
          provide: AuthService,
          useValue: { isAuthenticated: authenticated, isInitialized: initialized },
        },
        { provide: ThemeService, useValue: { turnstileTheme: signal('light') } },
        {
          provide: SupabaseService,
          useValue: {
            getOrganizers,
            submitTalk,
            updateTalkSubmission,
            getEditableTalkSubmissionForDevice: vi
              .fn()
              .mockResolvedValue({ data: editableSubmission, error: null }),
          },
        },
        {
          provide: TalkSubmissionDeviceAuthService,
          useValue: { storeEditToken, getEditToken: () => 'token' },
        },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    environment.turnstileSiteKey = originalSiteKey;
    delete window.turnstile;
  });

  async function setup() {
    const fixture = TestBed.createComponent(SubmitTalkComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const form = fixture.componentInstance['submitTalkForm'];
    const toggle = async () => {
      element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
      await fixture.whenStable();
    };
    return { fixture, element, form, toggle };
  }

  it('hides the checkbox until authentication has initialized and for anonymous users', async () => {
    initialized.set(false);
    const { fixture, element } = await setup();
    expect(element.querySelector('input[type="checkbox"]')).toBeNull();
    initialized.set(true);
    await fixture.whenStable();
    expect(element.querySelector('input[type="checkbox"]')).not.toBeNull();
    authenticated.set(false);
    await fixture.whenStable();
    expect(element.querySelector('input[type="checkbox"]')).toBeNull();
    expect(getOrganizers).not.toHaveBeenCalled();
  });

  it('requires selection and preserves speaker values and photo when switching modes', async () => {
    const { fixture, element, form, toggle } = await setup();
    const photo = new File(['photo'], 'portrait.png', { type: 'image/png' });
    form.patchValue({ speakerFirstName: 'Guest', speakerPicture: photo });
    await toggle();
    expect(element.querySelector('#speakerFirstName')).toBeNull();
    expect(form.controls.speakerFirstName.disabled).toBe(true);
    expect(form.controls.speakerPicture.disabled).toBe(true);
    expect(form.controls.organizerSpeakerSlug.hasError('required')).toBe(true);
    expect(element.querySelectorAll('#organizerSpeakerSlug option')).toHaveLength(3);
    expect(remove).toHaveBeenCalled();
    await toggle();
    expect(form.controls.speakerFirstName.value).toBe('Guest');
    expect(form.controls.speakerPicture.value).toBe(photo);
    expect(form.controls.speakerPicture.enabled).toBe(true);
    expect(form.controls.organizerSpeakerSlug.disabled).toBe(true);
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(2);
    await fixture.whenStable();
  });

  it.each(organizers)(
    'submits only talk details and $first_name’s slug without CAPTCHA',
    async (organizer) => {
      const { fixture, form, toggle } = await setup();
      await toggle();
      form.patchValue({
        talkTitle: editableSubmission.talk_title,
        talkDescription: editableSubmission.talk_description,
        slidesLink: editableSubmission.slides_url,
        organizerSpeakerSlug: organizer.slug,
      });
      await fixture.componentInstance['submitTalk']();
      expect(submitTalk).toHaveBeenCalledExactlyOnceWith({
        talkTitle: editableSubmission.talk_title,
        talkDescription: editableSubmission.talk_description,
        slidesLink: editableSubmission.slides_url,
        organizerSpeakerSlug: organizer.slug,
      });
      expect(storeEditToken).toHaveBeenCalledWith('proposal', 'token');
    },
  );

  it('restores standard validation when organizer access is lost', async () => {
    const { fixture, form, toggle, element } = await setup();
    await toggle();
    authenticated.set(false);
    await fixture.whenStable();
    expect(element.querySelector('#organizerSpeakerSlug')).toBeNull();
    expect(form.controls.speakerPicture.hasError('required')).toBe(true);
    await fixture.componentInstance['submitTalk']();
    expect(submitTalk).not.toHaveBeenCalled();
  });

  it('shows loading and retry feedback and blocks submission on an empty list', async () => {
    let finish!: (value: unknown) => void;
    getOrganizers.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { fixture, element, toggle } = await setup();
    await toggle();
    expect(element.textContent).toContain('Loading organizer profiles');
    finish({ data: null, error: new Error('offline') });
    await Promise.resolve();
    await fixture.whenStable();
    expect(element.textContent).toContain('We could not load organizer profiles');
    getOrganizers.mockResolvedValueOnce({ data: [], error: null });
    Array.from(element.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Try again'))!
      .click();
    await fixture.whenStable();
    expect(element.textContent).toContain('No organizer profiles');
    expect(fixture.componentInstance['isSubmitDisabled']()).toBe(true);
  });

  it('keeps the organizer fixed when editing and permits talk-only changes', async () => {
    vi.spyOn(TestBed.inject(ActivatedRoute).snapshot.paramMap, 'get').mockReturnValue('proposal');
    const { fixture, element, form } = await setup();
    expect(element.querySelector('input[type="checkbox"]')).toBeNull();
    expect(element.querySelector('#speakerFirstName')).toBeNull();
    expect(element.textContent).toContain('Mateusz Halada');
    expect(form.valid).toBe(true);
    form.controls.talkTitle.setValue('Updated Angular signals');
    await fixture.componentInstance['submitTalk']();
    expect(updateTalkSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ talkTitle: 'Updated Angular signals' }),
    );
  });

  it('reports expired authorization without discarding talk details', async () => {
    submitTalk.mockResolvedValueOnce({
      data: null,
      error: new Error('organizer_authorization_required'),
    });
    const { fixture, form, toggle } = await setup();
    await toggle();
    form.patchValue({
      talkTitle: editableSubmission.talk_title,
      talkDescription: editableSubmission.talk_description,
      slidesLink: editableSubmission.slides_url,
      organizerSpeakerSlug: organizers[0].slug,
    });
    await fixture.componentInstance['submitTalk']();
    expect(fixture.componentInstance['errorMessage']()).toContain('sign in again');
    expect(form.controls.talkTitle.value).toBe(editableSubmission.talk_title);
  });
});
