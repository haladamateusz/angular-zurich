import { Injectable } from '@angular/core';
import {
  createClient,
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient,
} from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';
import { Event } from '../../models/event.interface';
import { Person } from '../../models/person.interface';
import { Sponsor } from '../../models/sponsor.interface';
import { Talk } from '../../models/talk.interface';
import { TalkSubmissionPayload, TalkSubmissionResult } from '../../models/talk-submission.interface';

export interface StatsCounts {
  speakers: number;
  talks: number;
  events: number;
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly supabaseUrl = environment.supabaseUrl.trim();
  private readonly supabaseKey = environment.supabaseKey.trim();
  private readonly supabase: SupabaseClient = createClient(
    this.supabaseUrl,
    this.supabaseKey,
  );

  async getFormerOrganizers(): Promise<PostgrestResponse<Person>> {
    return this.supabase.from('former_organizers_public').select('*');
  }

  async getOrganizers(): Promise<PostgrestResponse<Person>> {
    return this.supabase.from('organizers_public').select('*');
  }

  async getLatestEvent(): Promise<PostgrestSingleResponse<Event>> {
    return this.supabase
      .from('Events')
      .select(`
        id,
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

  async getTalks(): Promise<PostgrestResponse<Talk>> {
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
    return this.supabase
      .from('Sponsors')
      .select('id, title, logo_url, website_url, created_by')
      .order('title', { ascending: true });
  }

  async submitTalk(
    payload: TalkSubmissionPayload,
  ): Promise<{ data: TalkSubmissionResult | null; error: Error | null }> {
    const formData = new FormData();

    formData.set('talkTitle', payload.talkTitle);
    formData.set('talkDescription', payload.talkDescription);
    formData.set('speakerName', payload.speakerName);
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
}
