import { makeStateKey } from '@angular/core';
import { StatsCounts } from '../../../core/data-access/supabase/supabase.service';
import { Event } from '../../../core/models/event.interface';
import { Person } from '../../../core/models/person.interface';
import { Sponsor } from '../../../core/models/sponsor.interface';

export const HOME_STATE_KEYS = {
  formerOrganizers: makeStateKey<Person[]>('home.former-organizers'),
  organizers: makeStateKey<Person[]>('home.organizers'),
  pastEvents: makeStateKey<Event[]>('home.past-events'),
  sponsors: makeStateKey<Sponsor[]>('home.sponsors'),
  stats: makeStateKey<StatsCounts>('home.stats'),
  upcomingPublicEvent: makeStateKey<Event>('home.upcoming-public-event'),
};
