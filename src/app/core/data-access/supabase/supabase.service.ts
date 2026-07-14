import { Service, inject } from '@angular/core';
import { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import {
  AssignableTalk,
  CreateEventPayload,
  CreateEventResult,
  UpdateEventPayload,
  UpdateEventResult,
  VenueOption,
} from '../../models/event-management.interface';
import { DashboardEvent, Event } from '../../models/event.interface';
import {
  OrganizerTalkSubmission,
  OrganizerTalkSubmissionDetail,
  OrganizerTalkSubmissionStatusEvent,
  TalkSubmissionStatus,
  TalkSubmissionReviewAction,
} from '../../models/organizer-talk-submission.interface';
import { Person } from '../../models/person.interface';
import { Sponsor } from '../../models/sponsor.interface';
import { Talk } from '../../models/talk.interface';
import {
  TalkSubmissionPayload,
  TalkSubmissionResult,
  TalkSubmissionStatusSummary,
} from '../../models/talk-submission.interface';
import { SupabaseClientService } from './supabase-client.service';

export interface StatsCounts {
  speakers: number;
  talks: number;
  events: number;
}

interface ReviewTalkSubmissionResult {
  id: string;
  status: string;
  speaker_id: string | null;
  speaker_picture_path: string | null;
  speaker_picture_url: string | null;
}

export type OrganizerTalkSubmissionSortColumn =
  | 'created_at'
  | 'speaker_name'
  | 'status'
  | 'talk_title';

export interface OrganizerTalkSubmissionListOptions {
  page: number;
  pageSize: number;
  sortColumn: OrganizerTalkSubmissionSortColumn;
  sortDirection: 'asc' | 'desc';
  filters?: {
    author?: string;
    status?: TalkSubmissionStatus;
    title?: string;
  };
}

export interface DashboardEventListOptions {
  page: number;
  pageSize: number;
}

@Service()
export class SupabaseService {
  private readonly authService = inject(AuthService);
  private readonly supabaseUrl = environment.supabaseUrl.trim();
  private readonly supabaseKey = environment.supabaseKey.trim();
  private readonly supabase = inject(SupabaseClientService).getClient();

  async getFormerOrganizers(): Promise<PostgrestResponse<Person>> {
    if (this.supabase === null) {
      return this.createEmptyListResponse<Person>([]);
    }

    return this.supabase.from('former_organizers_public').select('*');
  }

  async getOrganizers(): Promise<PostgrestResponse<Person>> {
    if (this.supabase === null) {
      return this.createEmptyListResponse<Person>([]);
    }

    return this.supabase.from('organizers_public').select('*');
  }

  async getUpcomingPublicEvent(): Promise<PostgrestSingleResponse<Event | null>> {
    if (this.supabase === null) {
      return this.createEmptySingleResponse<Event | null>(null);
    }

    return this.supabase
      .from('Events')
      .select(`
        id,
        slug,
        title,
        meetup_url,
        starts_at,
        venue_id,
        venue:Venues(
          title,
          street,
          city,
          zip,
          google_maps_url
        ),
        talks:Talks(
          id,
          title,
          description,
          event_id,
          presentation_time,
          created_by,
          speaker_links:SpeakerOnTalk(
            speaker:People(
              id,
              first_name,
              last_name,
              picture_url,
              label,
              company_name
            )
          )
        )
      `)
      .eq('public', true)
      .gt('starts_at', new Date().toISOString())
      .order('sort_order', { ascending: true, referencedTable: 'Talks' })
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle();
  }

  async getPastEvents(limit = 3): Promise<PostgrestResponse<Event>> {
    if (this.supabase === null) {
      return this.createEmptyListResponse<Event>([]);
    }

    const response = await this.supabase
      .from('Events')
      .select(`
        id,
        slug,
        title,
        feature_graphic,
        meetup_url,
        starts_at,
        venue_id,
        venue:Venues(
          title,
          street,
          city,
          zip,
          google_maps_url
        ),
        talks:Talks(
          id,
          title,
          description,
          slides_url,
          event_id,
          presentation_time,
          created_by,
          speaker_links:SpeakerOnTalk(
            speaker:People(
              id,
              first_name,
              last_name,
              picture_url,
              label,
              company_name
            )
          )
        )
      `)
      .lt('starts_at', new Date().toISOString())
      .order('sort_order', { ascending: true, referencedTable: 'Talks' })
      .order('starts_at', { ascending: false })
      .limit(limit);

    return response as PostgrestResponse<Event>;
  }

  async getEventBySlug(slug: string): Promise<PostgrestSingleResponse<Event>> {
    if (this.supabase === null) {
      return this.createEmptySingleResponse<Event>(null);
    }

    return this.supabase
      .from('Events')
      .select(`
        id,
        slug,
        title,
        feature_graphic,
        meetup_url,
        starts_at,
        venue_id,
        venue:Venues(
          title,
          street,
          city,
          zip,
          google_maps_url
        ),
        talks:Talks(
          id,
          title,
          description,
          slides_url,
          event_id,
          presentation_time,
          created_by,
          speaker_links:SpeakerOnTalk(
            speaker:People(
              id,
              first_name,
              last_name,
              slug,
              picture_url,
              label,
              company_name
            )
          )
        )
      `)
      .eq('slug', slug)
      .order('sort_order', { ascending: true, referencedTable: 'Talks' })
      .single();
  }

  async getEventForEdit(eventId: string): Promise<PostgrestSingleResponse<Event>> {
    if (this.supabase === null) {
      return this.createEmptySingleResponse<Event>(null);
    }

    return this.supabase
      .from('Events')
      .select(`
        id,
        slug,
        title,
        feature_graphic,
        meetup_url,
        starts_at,
        venue_id,
        public,
        venue:Venues(
          title,
          street,
          city,
          zip,
          google_maps_url
        ),
        talks:Talks(
          id,
          title,
          description,
          slides_url,
          event_id,
          presentation_time,
          created_by,
          source_talk_submission_id,
          speaker_links:SpeakerOnTalk(
            speaker:People(
              id,
              first_name,
              last_name,
              picture_url,
              label,
              company_name
            )
          )
        )
      `)
      .eq('id', eventId)
      .order('sort_order', { ascending: true, referencedTable: 'Talks' })
      .single();
  }

  async getDashboardEvents(
    options: DashboardEventListOptions,
  ): Promise<PostgrestResponse<DashboardEvent>> {
    if (this.supabase === null) {
      return this.createEmptyListResponse<DashboardEvent>([]);
    }

    const from = Math.max(0, options.page - 1) * options.pageSize;
    const to = from + options.pageSize - 1;

    return this.supabase
      .from('Events')
      .select('id, slug, title, starts_at', { count: 'exact' })
      .order('starts_at', { ascending: false })
      .range(from, to);
  }

  async getAssignableTalks(): Promise<PostgrestResponse<AssignableTalk>> {
    if (this.supabase === null) {
      return this.createEmptyListResponse<AssignableTalk>([]);
    }

    const response = await this.supabase
      .from('Talks')
      .select(`
        id,
        title,
        source_talk_submission_id,
        speaker_links:SpeakerOnTalk(
          speaker:People(
            first_name,
            last_name
          )
        )
      `)
      .is('event_id', null)
      .not('source_talk_submission_id', 'is', null)
      .order('title', { ascending: true });

    return response as PostgrestResponse<AssignableTalk>;
  }

  async getVenueOptions(): Promise<PostgrestResponse<VenueOption>> {
    if (this.supabase === null) {
      return this.createEmptyListResponse<VenueOption>([]);
    }

    return this.supabase
      .from('Venues')
      .select('id, title, street, city, zip')
      .order('title', { ascending: true });
  }

  async canCurrentUserManageEvents(): Promise<boolean> {
    if (this.supabase === null) {
      return false;
    }

    const { data, error } = await this.supabase.rpc('can_current_user_manage_events');

    return !error && data === true;
  }

  async createEvent(
    payload: CreateEventPayload,
  ): Promise<{ data: CreateEventResult | null; error: Error | null }> {
    const accessToken = this.authService.session()?.access_token;

    if (!this.supabaseUrl || !this.supabaseKey || !accessToken) {
      return {
        data: null,
        error: new Error('create_event_not_configured'),
      };
    }

    const formData = new FormData();

    formData.set('title', payload.title);
    formData.set('startsAt', payload.startsAt);
    formData.set('meetupUrl', payload.meetupUrl);
    formData.set('venueId', payload.venueId);
    formData.set('talkIds', JSON.stringify(payload.talkIds));
    formData.set('public', payload.isPublic ? 'true' : 'false');
    formData.set('featureGraphic', payload.featureGraphic);

    const response = await fetch(`${this.supabaseUrl}/functions/v1/create-event`, {
      method: 'POST',
      headers: {
        apikey: this.supabaseKey,
        authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    let body: CreateEventResult | { error?: string } | null;

    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const errorMessage = body && 'error' in body && body.error
        ? body.error
        : 'create_event_failed';

      return {
        data: null,
        error: new Error(errorMessage),
      };
    }

    return {
      data: body && 'id' in body ? body : null,
      error: null,
    };
  }

  async updateEvent(
    payload: UpdateEventPayload,
  ): Promise<{ data: UpdateEventResult | null; error: Error | null }> {
    const accessToken = this.authService.session()?.access_token;

    if (!this.supabaseUrl || !this.supabaseKey || !accessToken) {
      return {
        data: null,
        error: new Error('update_event_not_configured'),
      };
    }

    const formData = new FormData();

    formData.set('eventId', payload.eventId);
    formData.set('title', payload.title);
    formData.set('startsAt', payload.startsAt);
    formData.set('meetupUrl', payload.meetupUrl);
    formData.set('venueId', payload.venueId);
    formData.set('talkIds', JSON.stringify(payload.talkIds));
    formData.set('public', payload.isPublic ? 'true' : 'false');

    if (payload.featureGraphic) {
      formData.set('featureGraphic', payload.featureGraphic);
    }

    const response = await fetch(`${this.supabaseUrl}/functions/v1/update-event`, {
      method: 'POST',
      headers: {
        apikey: this.supabaseKey,
        authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    let body: UpdateEventResult | { error?: string } | null;

    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const errorMessage = body && 'error' in body && body.error
        ? body.error
        : 'update_event_failed';

      return {
        data: null,
        error: new Error(errorMessage),
      };
    }

    return {
      data: body && 'id' in body ? body : null,
      error: null,
    };
  }

  async getTalks(): Promise<PostgrestResponse<Talk>> {
    if (this.supabase === null) {
      return this.createEmptyListResponse<Talk>([]);
    }

    return this.supabase
      .from('Talks')
      .select(`
        id,
        title,
        description,
        event_id,
        presentation_time,
        created_by,
        event:Events(
          id,
          title,
          starts_at
        ),
        speaker_links:SpeakerOnTalk(
          speaker:People(
            id,
            first_name,
            last_name,
            slug,
            picture_url,
            personal_url,
            github_url,
            twitter_url,
            linkedin_url,
            abstract
          )
        )
      `)
      .order('title', { ascending: true });
  }

  async getSponsors(): Promise<PostgrestResponse<Sponsor>> {
    if (this.supabase === null) {
      return this.createEmptyListResponse<Sponsor>([]);
    }

    return this.supabase
      .from('Sponsors')
      .select('id, title, logo_url, website_url, created_by')
      .order('title', { ascending: true });
  }

  async getOrganizerTalkSubmissions(
    options: OrganizerTalkSubmissionListOptions,
  ): Promise<PostgrestResponse<OrganizerTalkSubmission>> {
    if (this.supabase === null) {
      return this.createEmptyListResponse<OrganizerTalkSubmission>([]);
    }

    const from = Math.max(0, options.page - 1) * options.pageSize;
    const to = from + options.pageSize - 1;

    let query = this.supabase
      .from('organizer_talk_submissions')
      .select(
        'id, created_at, status, talk_title, speaker_name, speaker_label, speaker_picture_path',
        { count: 'exact' },
      );

    const titleFilter = options.filters?.title?.trim();
    const authorFilter = options.filters?.author?.trim();

    if (titleFilter) {
      query = query.ilike('talk_title', `%${titleFilter}%`);
    }

    if (authorFilter) {
      query = query.ilike('speaker_name', `%${authorFilter}%`);
    }

    if (options.filters?.status) {
      query = query.eq('status', options.filters.status);
    }

    return query
      .order(options.sortColumn, { ascending: options.sortDirection === 'asc' })
      .range(from, to);
  }

  async getOrganizerTalkSubmissionById(
    submissionId: string,
  ): Promise<PostgrestSingleResponse<OrganizerTalkSubmissionDetail>> {
    if (this.supabase === null) {
      return this.createEmptySingleResponse<OrganizerTalkSubmissionDetail>(null);
    }

    return this.supabase
      .from('organizer_talk_submissions')
      .select(
        'id, created_at, status, talk_title, talk_description, slides_url, speaker_name, speaker_label, speaker_picture_path, personal_url, linkedin_url, github_url',
      )
      .eq('id', submissionId)
      .single();
  }

  async getOrganizerTalkSubmissionStatusEvents(
    submissionId: string,
  ): Promise<PostgrestResponse<OrganizerTalkSubmissionStatusEvent>> {
    if (this.supabase === null) {
      return this.createEmptyListResponse<OrganizerTalkSubmissionStatusEvent>([]);
    }

    return this.supabase
      .from('organizer_talk_submission_status_events')
      .select(
        'id, submission_id, created_at, from_status, to_status, action, actor_kind, actor_first_name, actor_last_name, message',
      )
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: true });
  }

  async reviewTalkSubmission(
    submissionId: string,
    action: TalkSubmissionReviewAction,
    message: string | null,
  ): Promise<{ data: ReviewTalkSubmissionResult[] | null; error: Error | null }> {
    const accessToken = this.authService.session()?.access_token;

    if (!this.supabaseUrl || !this.supabaseKey || !accessToken) {
      return {
        data: null,
        error: new Error('review_talk_submission_not_configured'),
      };
    }

    const response = await fetch(`${this.supabaseUrl}/functions/v1/review-talk-submission`, {
      method: 'POST',
      headers: {
        apikey: this.supabaseKey,
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        submissionId,
        action,
        message,
      }),
    });

    let body: ReviewTalkSubmissionResult | { error?: string } | null;

    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const errorMessage = body && 'error' in body && body.error
        ? body.error
        : 'review_talk_submission_failed';

      return {
        data: null,
        error: new Error(errorMessage),
      };
    }

    return {
      data: body && 'status' in body ? [body] : null,
      error: null,
    };
  }

  async getTalkSubmissionStatusForDevice(
    submissionId: string,
    editToken: string,
  ): Promise<PostgrestSingleResponse<TalkSubmissionStatusSummary | null>> {
    if (this.supabase === null) {
      return this.createEmptySingleResponse<TalkSubmissionStatusSummary | null>(null);
    }

    return this.supabase
      .rpc('get_talk_submission_status_for_device', {
        p_submission_id: submissionId,
        p_edit_token: editToken,
      })
      .maybeSingle();
  }

  async getOrganizerSpeakerPictureUrl(path: string): Promise<string | null> {
    if (this.supabase === null || !path.trim()) {
      return null;
    }

    const { data, error } = await this.supabase.storage
      .from('talk-submission-assets')
      .createSignedUrl(path, 60 * 60);

    if (error || !data?.signedUrl) {
      return null;
    }

    return data.signedUrl;
  }

  async submitTalk(
    payload: TalkSubmissionPayload,
  ): Promise<{ data: TalkSubmissionResult | null; error: Error | null }> {
    if (this.supabase === null) {
      return {
        data: null,
        error: new Error('supabase_not_configured'),
      };
    }

    const formData = new FormData();

    formData.set('talkTitle', payload.talkTitle);
    formData.set('talkDescription', payload.talkDescription);
    formData.set('speakerFirstName', payload.speakerFirstName);
    formData.set('speakerLastName', payload.speakerLastName);

    if (payload.speakerLabel?.trim()) {
      formData.set('speakerLabel', payload.speakerLabel.trim());
    }

    formData.set('emailAddress', payload.emailAddress);
    formData.set('speakerBio', payload.speakerBio);

    if (payload.slidesLink?.trim()) {
      formData.set('slidesLink', payload.slidesLink.trim());
    }

    if (payload.personalUrl?.trim()) {
      formData.set('personalUrl', payload.personalUrl.trim());
    }

    if (payload.twitterUrl?.trim()) {
      formData.set('twitterUrl', payload.twitterUrl.trim());
    }

    if (payload.linkedinUrl?.trim()) {
      formData.set('linkedinUrl', payload.linkedinUrl.trim());
    }

    if (payload.githubUrl?.trim()) {
      formData.set('githubUrl', payload.githubUrl.trim());
    }

    if (payload.captchaToken?.trim()) {
      formData.set('captchaToken', payload.captchaToken.trim());
    }

    if (payload.speakerPicture) {
      formData.set('speakerPicture', payload.speakerPicture);
    }

    const response = await fetch(`${this.supabaseUrl}/functions/v1/submit-talk`, {
      method: 'POST',
      headers: {
        apikey: this.supabaseKey,
      },
      body: formData,
    });

    let body: TalkSubmissionResult | { error?: string } | null;

    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const errorMessage = body && 'error' in body && body.error
        ? body.error
        : 'submit_talk_failed';

      return {
        data: null,
        error: new Error(errorMessage),
      };
    }

    return {
      data: body && 'status' in body ? body : null,
      error: null,
    };
  }

  async getStatsCounts(): Promise<StatsCounts> {
    if (this.supabase === null) {
      return {
        speakers: 0,
        talks: 0,
        events: 0,
      };
    }

    const [speakerResponse, talksResponse, eventsResponse] = await Promise.all([
      this.supabase.from('SpeakerOnTalk').select('speaker_id'),
      this.supabase.from('Talks').select('*', { count: 'exact', head: true }),
      this.supabase.from('Events').select('*', { count: 'exact', head: true }),
    ]);

    if (speakerResponse.error) {
      throw speakerResponse.error;
    }

    if (talksResponse.error) {
      throw talksResponse.error;
    }

    if (eventsResponse.error) {
      throw eventsResponse.error;
    }

    return {
      speakers: new Set(speakerResponse.data.map(({ speaker_id }) => speaker_id)).size,
      talks: talksResponse.count ?? 0,
      events: eventsResponse.count ?? 0,
    };
  }

  private createEmptyListResponse<T>(data: T[]): PostgrestResponse<T> {
    return {
      data,
      error: null,
      count: data.length,
      status: 200,
      statusText: 'OK',
    } as PostgrestResponse<T>;
  }

  private createEmptySingleResponse<T>(data: T | null): PostgrestSingleResponse<T> {
    return {
      data,
      error: null,
      count: data === null ? 0 : 1,
      status: 200,
      statusText: 'OK',
    } as PostgrestSingleResponse<T>;
  }
}
