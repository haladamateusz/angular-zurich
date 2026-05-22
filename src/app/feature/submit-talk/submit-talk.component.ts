import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
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
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { TalkSubmissionPayload } from '../../core/models/talk-submission.interface';
import { ThemeService } from '../../core/theme/theme.service';
import { environment } from '../../../environments/environment';

type SubmissionState = 'idle' | 'submitting' | 'error';

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
  speakerName: 120,
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
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './submit-talk.component.html',
  styleUrl: './submit-talk.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubmitTalkComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly supabaseService = inject(SupabaseService);
  private readonly themeService = inject(ThemeService);
  private readonly turnstileContainer = viewChild<ElementRef<HTMLElement>>('turnstileContainer');
  private readonly speakerPictureInput = viewChild<ElementRef<HTMLInputElement>>('speakerPictureInput');

  private widgetId: string | null = null;
  private turnstileThemeAtRender: 'light' | 'dark' | null = null;

  protected readonly maxLengths = MAX_LENGTHS;
  protected readonly maxSpeakerPictureSizeInMegabytes = SPEAKER_PICTURE_MAX_SIZE_BYTES / (1024 * 1024);
  protected readonly turnstileSiteKey = environment.turnstileSiteKey;
  protected readonly submissionState = signal<SubmissionState>('idle');
  protected readonly captchaError = signal('');
  protected readonly errorMessage = signal('');
  protected readonly captchaToken = signal<string | null>(null);
  protected readonly speakerPicturePreviewUrl = signal<string | null>(null);
  protected readonly speakerPictureFileName = signal('');

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
    slidesLink: ['', [Validators.maxLength(MAX_LENGTHS.slidesLink), Validators.pattern(SLIDES_LINK_PATTERN)]],
    speakerName: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(MAX_LENGTHS.speakerName)],
    ],
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
      validators: [optionalImageFileValidator],
    }),
    companyWebsite: ['', [Validators.maxLength(MAX_LENGTHS.companyWebsite)]],
  });

  protected readonly talkDescriptionLength = computed(
    () => this.submitTalkForm.controls.talkDescription.value.length,
  );
  protected readonly speakerBioLength = computed(
    () => this.submitTalkForm.controls.speakerBio.value.length,
  );

  constructor() {
    afterNextRender(async () => {
      if (!isPlatformBrowser(this.platformId) || !this.turnstileSiteKey) {
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
  }

  protected async submitTalk(): Promise<void> {
    if (this.submitTalkForm.controls.companyWebsite.value.trim().length > 0) {
      this.errorMessage.set('');
      this.submitTalkForm.reset();
      this.resetSpeakerPictureInput();
      await this.router.navigate(['/talk-submission', 'submitted']);
      return;
    }

    if (this.submitTalkForm.invalid) {
      this.submitTalkForm.markAllAsTouched();
      return;
    }

    if (!this.turnstileSiteKey || !this.captchaToken()) {
      this.captchaError.set('Please complete verification before submitting.');
      return;
    }

    this.submissionState.set('submitting');
    this.captchaError.set('');
    this.errorMessage.set('');

    const { companyWebsite: _honeypot, ...payload } = this.submitTalkForm.getRawValue();
    void _honeypot;

    const submissionPayload: TalkSubmissionPayload = {
      ...payload,
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

    this.revokeSpeakerPicturePreviewUrl();
    control.setValue(file);
    control.markAsDirty();
    control.markAsTouched();
    control.updateValueAndValidity();
    this.speakerPictureFileName.set(file?.name ?? '');

    if (file && control.valid && isPlatformBrowser(this.platformId)) {
      this.speakerPicturePreviewUrl.set(URL.createObjectURL(file));
    }
  }

  protected removeSpeakerPicture(): void {
    this.resetSpeakerPictureInput();
  }

  protected openSpeakerPicturePicker(): void {
    this.speakerPictureInput()?.nativeElement?.click();
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
    this.speakerPictureFileName.set('');
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
