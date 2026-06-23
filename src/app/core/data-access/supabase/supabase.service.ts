import { Service, inject } from '@angular/core';
import { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';
import { Event } from '../../models/event.interface';
import { OrganizerTalkSubmission } from '../../models/organizer-talk-submission.interface';
import { Person } from '../../models/person.interface';
import { Sponsor } from '../../models/sponsor.interface';
import { Talk } from '../../models/talk.interface';
import { TalkSubmissionPayload, TalkSubmissionResult } from '../../models/talk-submission.interface';
import { SupabaseClientService } from './supabase-client.service';

export interface StatsCounts {
  speakers: number;
  talks: number;
  events: number;
}

@Service()
export class SupabaseService {
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

  async getLatestEvent(): Promise<PostgrestSingleResponse<Event>> {
    if (this.supabase === null) {
      return this.createEmptySingleResponse<Event>(null);
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
      .order('sort_order', { ascending: true, referencedTable: 'Talks' })
      .order('starts_at', { ascending: false })
      .limit(1)
      .single();
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

  async getOrganizerTalkSubmissions(): Promise<PostgrestResponse<OrganizerTalkSubmission>> {
    if (this.supabase === null) {
      return this.createEmptyListResponse<OrganizerTalkSubmission>([]);
    }

    return this.supabase
      .from('organizer_talk_submissions')
      .select('id, created_at, status, talk_title, speaker_name, speaker_label')
      .order('created_at', { ascending: false });
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
    formData.set('speakerName', payload.speakerName);

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
