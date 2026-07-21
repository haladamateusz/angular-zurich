import { ComponentFixture, TestBed } from '@angular/core/testing';
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
    }).compileComponents();

    fixture = TestBed.createComponent(UpcomingTalksComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('talks', TEST_TALKS);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the talk description', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('How signals make state easier to manage.');
  });

  it('renders each sentence in its own paragraph', () => {
    fixture.componentRef.setInput('talks', [
      {
        ...TEST_TALKS[0],
        description: 'First sentence. Second sentence.',
      },
    ]);
    fixture.detectChanges();

    const paragraphs = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.talk-card__description-paragraph',
    );

    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0]?.textContent).toContain('First sentence.');
    expect(paragraphs[1]?.textContent).toContain('Second sentence.');
  });
});
