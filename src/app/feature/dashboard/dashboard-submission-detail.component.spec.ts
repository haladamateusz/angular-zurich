import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { OrganizerTalkSubmissionDetail } from '../../core/models/organizer-talk-submission.interface';
import { DashboardSubmissionDetailComponent } from './dashboard-submission-detail.component';

const submission: OrganizerTalkSubmissionDetail = {
  id: 'submission-1',
  created_at: '2026-08-10T12:00:00.000Z',
  status: 'initially_submitted',
  talk_title: 'Signals at scale',
  talk_description: 'How signals help Angular applications scale.',
  slides_url: '',
  speaker_name: 'Ada Lovelace',
  speaker_label: null,
  speaker_picture_path: null,
  speaker_email: 'ada@example.com',
  personal_url: null,
  linkedin_url: null,
  github_url: null,
};

describe('DashboardSubmissionDetailComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DashboardSubmissionDetailComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: vi.fn().mockReturnValue(submission.id),
              },
            },
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            getOrganizerTalkSubmissionById: vi.fn().mockResolvedValue({
              data: submission,
              error: null,
            }),
            getOrganizerTalkSubmissionStatusEvents: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          },
        },
      ],
    });
  });

  it('focuses the rejection message and restores the trigger after cancellation', async () => {
    const fixture = TestBed.createComponent(DashboardSubmissionDetailComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const rejectButton = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Reject',
    );

    rejectButton?.click();
    await fixture.whenStable();

    const messageInput = element.querySelector<HTMLTextAreaElement>('#reviewMessage');

    expect(document.activeElement).toBe(messageInput);
    expect(document.body.style.overflow).toBe('hidden');

    Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Cancel')
      ?.click();
    await fixture.whenStable();

    expect(document.activeElement).toBe(rejectButton);
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps keyboard focus within the rejection dialog', async () => {
    const fixture = TestBed.createComponent(DashboardSubmissionDetailComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Reject')
      ?.click();
    await fixture.whenStable();

    const messageInput = element.querySelector<HTMLTextAreaElement>('#reviewMessage');

    messageInput!.value = 'Please add more detail about the proposed talk.';
    messageInput!.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();

    const sendButton = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Send',
    );

    sendButton?.focus();
    sendButton?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));

    expect(document.activeElement).toBe(messageInput);

    messageInput?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', shiftKey: true }),
    );

    expect(document.activeElement).toBe(sendButton);
  });

  it('moves focus into the active dialog when Tab starts outside it', async () => {
    const fixture = TestBed.createComponent(DashboardSubmissionDetailComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const rejectButton = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Reject',
    );

    rejectButton?.click();
    await fixture.whenStable();

    rejectButton?.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));

    expect(document.activeElement).toBe(element.querySelector('#reviewMessage'));
  });

  it('focuses the remove dialog cancel action and restores its trigger on Escape', async () => {
    const fixture = TestBed.createComponent(DashboardSubmissionDetailComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const removeButton = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Remove submission',
    );

    removeButton?.click();
    await fixture.whenStable();

    const cancelButton = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Cancel',
    );

    expect(document.activeElement).toBe(cancelButton);

    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    await fixture.whenStable();

    expect(document.activeElement).toBe(removeButton);
  });
});
