import { Injectable } from '@angular/core';
import { createClient, PostgrestResponse, PostgrestSingleResponse, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';
import { Event } from '../../interfaces/event.interface';
import { Person } from '../../interfaces/person.interface';
import { Sponsor } from '../../interfaces/sponsor.interface';
import { Talk } from '../../interfaces/talk.interface';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseKey)

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
}
