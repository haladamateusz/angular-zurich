import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { OrganizerTalkSubmission } from '../../core/models/organizer-talk-submission.interface';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent speaker photos', () => {
  const getOrganizerTalkSubmissions = vi.fn();
  const getOrganizerSpeakerPictureUrl = vi.fn();
  const submission: OrganizerTalkSubmission = {
    id: 'organizer-proposal',
    created_at: '2026-10-04T14:39:00Z',
    status: 'initially_submitted',
    talk_title: 'Organizer talk',
    speaker_name: 'Mateusz Halada',
    speaker_label: 'Organizer',
    speaker_picture_path: null,
    organizer_speaker_picture_url: null,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { userProfile: signal(null) } },
        {
          provide: SupabaseService,
          useValue: { getOrganizerTalkSubmissions, getOrganizerSpeakerPictureUrl },
        },
      ],
    });
  });

  it.each([
    {
      publicPhoto: 'https://example.com/organizer.jpg',
      uploadPath: null,
      expected: 'https://example.com/organizer.jpg',
    },
    {
      publicPhoto: null,
      uploadPath: 'submission/photo.jpg',
      expected: 'https://example.com/signed-photo.jpg',
    },
    { publicPhoto: null, uploadPath: null, expected: null },
  ])('renders the correct avatar for %j', async ({ publicPhoto, uploadPath, expected }) => {
    getOrganizerTalkSubmissions.mockResolvedValue({
      data: [
        {
          ...submission,
          organizer_speaker_picture_url: publicPhoto,
          speaker_picture_path: uploadPath,
        },
      ],
      count: 1,
      error: null,
    });
    getOrganizerSpeakerPictureUrl.mockResolvedValue('https://example.com/signed-photo.jpg');
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    const avatar = (fixture.nativeElement as HTMLElement).querySelector(
      '.dashboard-table__author-avatar',
    );
    expect(avatar).not.toBeNull();
    expect(avatar?.querySelector('img')?.getAttribute('src') ?? null).toBe(expected);
    if (!expected) expect(avatar?.textContent?.trim()).toBe('MH');
    if (uploadPath) {
      expect(getOrganizerSpeakerPictureUrl).toHaveBeenCalledExactlyOnceWith(uploadPath);
    } else {
      expect(getOrganizerSpeakerPictureUrl).not.toHaveBeenCalled();
    }
  });
});
