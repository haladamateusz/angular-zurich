import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Event } from '../../interfaces/event.interface';
import { Sponsor } from '../../interfaces/sponsor.interface';
import { NavbarDateFormatPipe } from '../../pipes/navbar-date-format/navbar-date-format.pipe';

@Component({
  selector: 'app-hero',
  imports: [NavbarDateFormatPipe],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroComponent {
  readonly sponsors = input.required<Sponsor[]>();
  readonly event = input<Event | null>(null);

  protected readonly previewTalks = computed(() =>
    (this.event()?.talks ?? []).slice(0, 3).map((talk) => {
      const speaker = talk.speaker_links.find((link) => link.speaker)?.speaker ?? null;
      const firstName = speaker?.first_name?.trim() ?? '';
      const lastName = speaker?.last_name?.trim() ?? '';
      const speakerName = `${firstName} ${lastName}`.trim() || 'Angular Zurich speaker';
      const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.trim() || speakerName.charAt(0).toUpperCase();

      return {
        id: talk.id,
        title: talk.title,
        speakerName,
        speakerImage: speaker?.picture_url ?? null,
        initials,
      };
    }),
  );
}
