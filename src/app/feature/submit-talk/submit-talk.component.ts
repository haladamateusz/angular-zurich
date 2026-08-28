import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { TalkSubmissionDeviceAuthService } from '../../core/data-access/talk-submission-device-auth.service';
import {
  TalkSubmissionEditable,
  TalkSubmissionPayload,
} from '../../core/models/talk-submission.interface';
import { ThemeService } from '../../core/theme/theme.service';
import { ViewportRevealDirective } from '../../ui/viewport-reveal/viewport-reveal.directive';
import { environment } from '../../../environments/environment';

type SubmissionState = 'idle' | 'loading' | 'submitting' | 'error';

type TurnstileApi = NonNullable<Window['turnstile']>;

const TURNSTILE_SCRIPT_ID = 'cloudflare-turnstile-script';
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const SLIDES_LINK_PATTERN = /^https?:\/\/.+/i;
const SPEAKER_PICTURE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const SPEAKER_PICTURE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const MAX_LENGTHS = {
  talkTitle: 160,
  talkDescription: 6000,
  slidesLink: 500,
  speakerFirstName: 60,
  speakerLastName: 59,
  speakerLabel: 160,
  emailAddress: 320,
  speakerBio: 4000,
  personalUrl: 500,
  twitterUrl: 500,
  linkedinUrl: 500,
  githubUrl: 500,
  companyWebsite: 200,
} as const;

function optionalImageFileValidator(control: AbstractControl<File | null>): ValidationErrors | null {
  const file = control.value;

  if (!file) {
    return null;
  }

  if (!SPEAKER_PICTURE_ALLOWED_TYPES.includes(file.type as (typeof SPEAKER_PICTURE_ALLOWED_TYPES)[number])) {
    return { invalidFileType: true };
  }

  if (file.size > SPEAKER_PICTURE_MAX_SIZE_BYTES) {
    return { fileTooLarge: true };
  }

  return null;
}

let turnstileScriptPromise: Promise<TurnstileApi | null> | null = null;

@Component({
  selector: 'app-submit-talk',
  imports: [ReactiveFormsModule, RouterLink, ViewportRevealDirective],
  templateUrl: './submit-talk.component.html',
  styleUrl: './submit-talk.component.css'
})
export class SubmitTalkComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly supabaseService = inject(SupabaseService);
  private readonly talkSubmissionDeviceAuthService = inject(TalkSubmissionDeviceAuthService);
  private readonly themeService = inject(ThemeService);
  private readonly turnstileContainer = viewChild<ElementRef<HTMLElement>>('turnstileContainer');
  private readonly speakerPictureInput = viewChild<ElementRef<HTMLInputElement>>('speakerPictureInput');

  private widgetId: string | null = null;
  private turnstileThemeAtRender: 'light' | 'dark' | null = null;

  protected readonly editSubmissionId = signal(this.route.snapshot.paramMap.get('submissionId'));
  protected readonly isEditMode = computed(() => this.editSubmissionId() !== null);
  protected readonly maxLengths = MAX_LENGTHS;
  protected readonly maxSpeakerPictureSizeInMegabytes = SPEAKER_PICTURE_MAX_SIZE_BYTES / (1024 * 1024);
  protected readonly turnstileSiteKey = environment.turnstileSiteKey;
  protected readonly submissionState = signal<SubmissionState>('idle');
  protected readonly captchaError = signal('');
  protected readonly errorMessage = signal('');
  protected readonly captchaToken = signal<string | null>(null);
  protected readonly isEditSubmissionInvalid = signal(false);
  protected readonly isEditSubmissionLoaded = signal(false);
  protected readonly existingSpeakerPicturePath = signal<string | null>(null);
  protected readonly existingSpeakerPictureUrl = signal<string | null>(null);
  protected readonly speakerPicturePreviewUrl = signal<string | null>(null);

  protected readonly submitTalkForm = this.formBuilder.group({
    talkTitle: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(MAX_LENGTHS.talkTitle)]],
    talkDescription: [
      '',
      [
        Validators.required,
        Validators.minLength(40),
        Validators.maxLength(MAX_LENGTHS.talkDescription),
      ],
    ],
    slidesLink: [
      '',
      [Validators.required, Validators.maxLength(MAX_LENGTHS.slidesLink), Validators.pattern(SLIDES_LINK_PATTERN)],
    ],
    speakerFirstName: [
      '',
      [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(MAX_LENGTHS.speakerFirstName),
      ],
    ],
    speakerLastName: [
      '',
      [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(MAX_LENGTHS.speakerLastName),
      ],
    ],
    speakerLabel: ['', [Validators.maxLength(MAX_LENGTHS.speakerLabel)]],
    emailAddress: [
      '',
      [Validators.required, Validators.email, Validators.maxLength(MAX_LENGTHS.emailAddress)],
    ],
    speakerBio: [
      '',
      [Validators.required, Validators.minLength(20), Validators.maxLength(MAX_LENGTHS.speakerBio)],
    ],
    personalUrl: ['', [Validators.maxLength(MAX_LENGTHS.personalUrl), Validators.pattern(SLIDES_LINK_PATTERN)]],
    twitterUrl: ['', [Validators.maxLength(MAX_LENGTHS.twitterUrl), Validators.pattern(SLIDES_LINK_PATTERN)]],
    linkedinUrl: ['', [Validators.maxLength(MAX_LENGTHS.linkedinUrl), Validators.pattern(SLIDES_LINK_PATTERN)]],
    githubUrl: ['', [Validators.maxLength(MAX_LENGTHS.githubUrl), Validators.pattern(SLIDES_LINK_PATTERN)]],
    speakerPicture: new FormControl<File | null>(null, {
      validators: this.isEditMode()
        ? [optionalImageFileValidator]
        : [Validators.required, optionalImageFileValidator],
    }),
    companyWebsite: ['', [Validators.maxLength(MAX_LENGTHS.companyWebsite)]],
  });

  private readonly formStatus = toSignal(this.submitTalkForm.statusChanges, {
    initialValue: this.submitTalkForm.status,
  });
  private readonly talkDescriptionValue = toSignal(
    this.submitTalkForm.controls.talkDescription.valueChanges,
    { initialValue: this.submitTalkForm.controls.talkDescription.value },
  );
  private readonly speakerBioValue = toSignal(
    this.submitTalkForm.controls.speakerBio.valueChanges,
    { initialValue: this.submitTalkForm.controls.speakerBio.value },
  );

  protected readonly talkDescriptionLength = computed(() => this.talkDescriptionValue().length);
  protected readonly speakerBioLength = computed(() => this.speakerBioValue().length);
  protected readonly isSubmitDisabled = computed(
    () => {
      this.formStatus();

      return this.submissionState() === 'loading' ||
      this.submissionState() === 'submitting' ||
      this.submitTalkForm.invalid ||
      (this.isEditMode() && (!this.isEditSubmissionLoaded() || this.isEditSubmissionInvalid()));
    },
  );
  protected readonly isBlockingEditError = computed(
    () => this.isEditMode() && this.isEditSubmissionInvalid() && this.submissionState() === 'error',
  );

  constructor() {
    afterNextRender(async () => {
      if (!isPlatformBrowser(this.platformId) || !this.turnstileSiteKey || this.isEditMode()) {
        return;
      }

      const turnstile = await this.loadTurnstile();

      if (!turnstile) {
        this.captchaError.set('We could not load verification. Please refresh the page and try again.');
        return;
      }

      this.renderTurnstile(turnstile);
    });

    effect(() => {
      const theme = this.themeService.turnstileTheme();

      if (
        !isPlatformBrowser(this.platformId) ||
        !this.widgetId ||
        !window.turnstile ||
        this.turnstileThemeAtRender === theme
      ) {
        return;
      }

      this.renderTurnstile(window.turnstile);
    });

    this.destroyRef.onDestroy(() => {
      if (isPlatformBrowser(this.platformId) && this.widgetId && window.turnstile) {
        window.turnstile.remove(this.widgetId);
      }

      this.revokeSpeakerPicturePreviewUrl();
    });

    if (this.isEditMode()) {
      void this.loadEditableSubmission();
    }
  }

  protected async submitTalk(): Promise<void> {
    if (this.submitTalkForm.controls.companyWebsite.value.trim().length > 0) {
      this.errorMessage.set('');
      this.submitTalkForm.reset();
      this.resetSpeakerPictureInput();
      await this.router.navigate(this.isEditMode()
        ? ['/talk-submission', this.editSubmissionId() ?? 'submitted']
        : ['/talk-submission', 'submitted']);
      return;
    }

    if (this.submitTalkForm.invalid) {
      this.submitTalkForm.markAllAsTouched();
      return;
    }

    if (this.isEditMode()) {
      await this.updateTalkSubmission();
      return;
    }

    if (!this.turnstileSiteKey || !this.captchaToken()) {
      this.captchaError.set('Please complete verification before submitting.');
      return;
    }

    this.submissionState.set('submitting');
    this.captchaError.set('');
    this.errorMessage.set('');

    const submissionPayload: TalkSubmissionPayload = {
      ...this.createSubmissionPayload(),
      captchaToken: this.captchaToken() ?? undefined,
    };
    const { data, error } = await this.supabaseService.submitTalk(submissionPayload);

    if (error || !data) {
      this.submissionState.set('error');
      this.errorMessage.set(
        'We could not submit your talk right now. Please try again in a moment or contact us directly.',
      );
      this.resetTurnstile();
      return;
    }

    if (data.id && data.editToken) {
      this.talkSubmissionDeviceAuthService.storeEditToken(data.id, data.editToken);
    }

    this.submitTalkForm.reset();
    this.resetSpeakerPictureInput();
    await this.router.navigate(['/talk-submission', data.id ?? 'submitted']);
  }

  protected fieldHasError(controlName: keyof typeof this.submitTalkForm.controls): boolean {
    const control = this.submitTalkForm.controls[controlName];

    return control.invalid && (control.dirty || control.touched);
  }

  protected onSpeakerPictureSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const control = this.submitTalkForm.controls.speakerPicture;

    if (!file) {
      return;
    }

    control.markAsDirty();
    control.markAsTouched();

    if (!SPEAKER_PICTURE_ALLOWED_TYPES.includes(file.type as (typeof SPEAKER_PICTURE_ALLOWED_TYPES)[number])) {
      input.value = '';
      control.setErrors({ invalidFileType: true });
      return;
    }

    if (file.size > SPEAKER_PICTURE_MAX_SIZE_BYTES) {
      input.value = '';
      control.setErrors({ fileTooLarge: true });
      return;
    }

    this.revokeSpeakerPicturePreviewUrl();
    control.setValue(file);
    control.updateValueAndValidity();

    if (file && control.valid && isPlatformBrowser(this.platformId)) {
      this.speakerPicturePreviewUrl.set(URL.createObjectURL(file));
    }
  }

  protected removeSpeakerPicture(): void {
    this.resetSpeakerPictureInput();
  }

  protected openSpeakerPicturePicker(): void {
    const input = this.speakerPictureInput()?.nativeElement;

    if (!input) {
      return;
    }

    input.value = '';
    input.click();
  }

  private async loadEditableSubmission(): Promise<void> {
    const submissionId = this.editSubmissionId();
    const editToken = this.talkSubmissionDeviceAuthService.getEditToken(submissionId);

    if (!submissionId || !editToken) {
      this.isEditSubmissionInvalid.set(true);
      this.isEditSubmissionLoaded.set(false);
      this.submissionState.set('error');
      this.errorMessage.set('We could not verify this device for editing.');
      return;
    }

    this.submissionState.set('loading');
    this.errorMessage.set('');

    const { data, error } = await this.supabaseService.getEditableTalkSubmissionForDevice(
      submissionId,
      editToken,
    );

    if (error || !data || !data.can_edit) {
      this.isEditSubmissionInvalid.set(true);
      this.isEditSubmissionLoaded.set(false);
      this.submissionState.set('error');
      this.errorMessage.set('This submission cannot be edited from this device.');
      return;
    }

    this.populateForm(data);
    this.existingSpeakerPictureUrl.set(
      data.speaker_picture_path
        ? await this.supabaseService.getEditableTalkSubmissionSpeakerPictureUrl(submissionId, editToken)
        : null,
    );
    this.isEditSubmissionInvalid.set(false);
    this.isEditSubmissionLoaded.set(true);
    this.submissionState.set('idle');
  }

  private populateForm(submission: TalkSubmissionEditable): void {
    this.submitTalkForm.patchValue({
      talkTitle: submission.talk_title,
      talkDescription: submission.talk_description,
      slidesLink: submission.slides_url,
      speakerFirstName: submission.speaker_first_name,
      speakerLastName: submission.speaker_last_name,
      speakerLabel: submission.speaker_label ?? '',
      emailAddress: submission.speaker_email,
      speakerBio: submission.speaker_bio,
      personalUrl: submission.personal_url ?? '',
      twitterUrl: submission.twitter_url ?? '',
      linkedinUrl: submission.linkedin_url ?? '',
      githubUrl: submission.github_url ?? '',
      speakerPicture: null,
      companyWebsite: '',
    });
    this.existingSpeakerPicturePath.set(submission.speaker_picture_path);
    this.existingSpeakerPictureUrl.set(null);
    if (submission.speaker_picture_path) {
      this.submitTalkForm.controls.speakerPicture.removeValidators(Validators.required);
    } else {
      this.submitTalkForm.controls.speakerPicture.addValidators(Validators.required);
    }
    this.submitTalkForm.controls.speakerPicture.updateValueAndValidity();
    this.submitTalkForm.markAsPristine();
    this.submitTalkForm.markAsUntouched();
  }

  private async updateTalkSubmission(): Promise<void> {
    const submissionId = this.editSubmissionId();
    const editToken = this.talkSubmissionDeviceAuthService.getEditToken(submissionId);

    if (!submissionId || !editToken) {
      this.isEditSubmissionInvalid.set(true);
      this.submissionState.set('error');
      this.errorMessage.set('We could not verify this device for editing.');
      return;
    }

    if (this.isEditSubmissionInvalid() || !this.isEditSubmissionLoaded()) {
      return;
    }

    this.submissionState.set('submitting');
    this.errorMessage.set('');

    const { data, error } = await this.supabaseService.updateTalkSubmission({
      ...this.createSubmissionPayload(),
      editToken,
      submissionId,
    });

    if (error || !data) {
      this.submissionState.set('error');
      this.errorMessage.set(
        'We could not save your changes right now. Please try again in a moment or contact us directly.',
      );
      return;
    }

    await this.router.navigate(['/talk-submission', submissionId]);
  }

  private createSubmissionPayload(): TalkSubmissionPayload {
    const { companyWebsite: _honeypot, ...payload } = this.submitTalkForm.getRawValue();
    void _honeypot;

    return payload;
  }

  private async loadTurnstile(): Promise<TurnstileApi | null> {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    if (window.turnstile) {
      return window.turnstile;
    }

    if (!turnstileScriptPromise) {
      turnstileScriptPromise = new Promise<TurnstileApi | null>((resolve) => {
        const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;

        const handleResolve = (): void => {
          resolve(window.turnstile ?? null);
        };

        if (existingScript) {
          existingScript.addEventListener('load', handleResolve, { once: true });
          existingScript.addEventListener('error', () => resolve(null), { once: true });

          if (window.turnstile) {
            resolve(window.turnstile);
          }

          return;
        }

        const script = document.createElement('script');

        script.id = TURNSTILE_SCRIPT_ID;
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.addEventListener('load', handleResolve, { once: true });
        script.addEventListener('error', () => resolve(null), { once: true });
        document.head.appendChild(script);
      });
    }

    return turnstileScriptPromise;
  }

  private renderTurnstile(turnstile: TurnstileApi): void {
    const container = this.turnstileContainer()?.nativeElement;

    if (!container) {
      return;
    }

    if (this.widgetId) {
      turnstile.remove(this.widgetId);
      this.widgetId = null;
      this.captchaToken.set(null);
    }

    const theme = this.themeService.turnstileTheme();

    this.widgetId = turnstile.render(container, {
      sitekey: this.turnstileSiteKey,
      theme,
      action: 'submit_talk',
      callback: (token) => {
        this.captchaToken.set(token);
        this.captchaError.set('');
      },
      'expired-callback': () => {
        this.captchaToken.set(null);
        this.captchaError.set('Verification expired. Please complete it again.');
      },
      'error-callback': () => {
        this.captchaToken.set(null);
        this.captchaError.set('Verification failed to load. Please try again.');
      },
    });

    this.turnstileThemeAtRender = theme;
  }

  private resetTurnstile(): void {
    if (!this.widgetId || !isPlatformBrowser(this.platformId) || !window.turnstile) {
      this.captchaToken.set(null);
      return;
    }

    window.turnstile.reset(this.widgetId);
    this.captchaToken.set(null);
  }

  private resetSpeakerPictureInput(): void {
    this.revokeSpeakerPicturePreviewUrl();
    this.submitTalkForm.controls.speakerPicture.setValue(null);
    this.submitTalkForm.controls.speakerPicture.markAsPristine();
    this.submitTalkForm.controls.speakerPicture.markAsUntouched();
    const input = this.speakerPictureInput()?.nativeElement;

    if (input) {
      input.value = '';
    }
  }

  private revokeSpeakerPicturePreviewUrl(): void {
    const previewUrl = this.speakerPicturePreviewUrl();

    if (previewUrl && isPlatformBrowser(this.platformId)) {
      URL.revokeObjectURL(previewUrl);
    }

    this.speakerPicturePreviewUrl.set(null);
  }
}
