import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UpcomingTalksComponent } from './upcoming-talks.component';
import { Event } from '../../../../core/models/event.interface';

const TEST_TALKS: Event['talks'] = [
  {
    id: 'talk-1',
    title: 'Signals in Practice',
    description: 'How signals make state easier to manage.',
    slides_url: null,
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
          company_name: 'Angular Zürich',
        },
      },
    ],
  },
];

describe('UpcomingTalksComponent', () => {
  let component: UpcomingTalksComponent;
  let fixture: ComponentFixture<UpcomingTalksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpcomingTalksComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(UpcomingTalksComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('talks', TEST_TALKS);
    fixture.componentRef.setInput('eventSlug', 'september-meetup');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the talk description', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('How signals make state easier to manage.');
  });

  it('renders each sentence in its own paragraph', async () => {
    fixture.componentRef.setInput('talks', [
      {
        ...TEST_TALKS[0],
        description: 'First sentence. Second sentence.',
      },
    ]);
    await fixture.whenStable();

    const paragraphs = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.talk-card__description-paragraph',
    );

    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0]?.textContent).toContain('First sentence.');
    expect(paragraphs[1]?.textContent).toContain('Second sentence.');
  });

  it('links each talk to its event and renders speaker initials without a photo', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const talkLink = compiled.querySelector<HTMLAnchorElement>('.talk-card__link');
    const avatarFallback = compiled.querySelector<HTMLElement>('.talk-card__avatar--fallback');

    expect(talkLink?.getAttribute('href')).toBe('/events/september-meetup');
    expect(avatarFallback?.textContent?.trim()).toBe('AL');
  });
});
