import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HeroComponent } from './hero.component';
import { Event } from '../../../../core/models/event.interface';
import { Sponsor } from '../../../../core/models/sponsor.interface';

const TEST_EVENT: Event = {
  id: 'event-1',
  title: 'Angular Zurich April 2026',
  meetup_url: 'https://www.meetup.com/angularzrh/',
  starts_at: '2099-04-17T18:30:00.000Z',
  venue_id: 'venue-1',
  venue: {
    title: 'Constructor Nexademy',
    street: 'Foerrlibuckstrasse 150',
    city: 'Zurich',
    zip: '8005',
    google_maps_url: 'https://maps.example.com',
  },
  talks: [
    {
      id: 'talk-1',
      title: 'Signals in Practice',
      description: 'How signals make state easier to manage.',
      event_id: 'event-1',
      presentation_time: 30,
      created_by: 'organizer',
      speaker_links: [
        {
          speaker: {
            id: 'speaker-1',
            first_name: 'Ada',
            last_name: 'Lovelace',
            picture_url: null,
            label: 'Engineer',
            company_name: 'Angular Zurich',
          },
        },
      ],
    },
  ],
};

const TEST_SPONSORS: Sponsor[] = [];

describe('HeroComponent', () => {
  let component: HeroComponent;
  let fixture: ComponentFixture<HeroComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeroComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HeroComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sponsors', TEST_SPONSORS);
    fixture.componentRef.setInput('event', TEST_EVENT);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
