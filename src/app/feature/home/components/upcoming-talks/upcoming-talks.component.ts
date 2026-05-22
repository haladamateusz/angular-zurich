import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Event } from '../../../../core/models/event.interface';
import { splitTextIntoParagraphs } from '../../../../core/utils/split-text-into-paragraphs';

@Component({
  selector: 'app-upcoming-talks',
  imports: [],
  templateUrl: './upcoming-talks.component.html',
  styleUrl: './upcoming-talks.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpcomingTalksComponent {
  readonly talks = input.required<Event['talks']>();

  protected readonly talkCards = computed(() =>
    this.talks().map((talk) => {
      const primarySpeaker = talk.speaker_links[0]?.speaker ?? null;
      const speakerName = [primarySpeaker?.first_name, primarySpeaker?.last_name]
        .filter((value): value is string => Boolean(value))
        .join(' ');

      return {
        id: talk.id,
        title: talk.title,
        descriptionParagraphs: splitTextIntoParagraphs(talk.description),
        speakerName: speakerName || 'TBA',
        speakerPosition: primarySpeaker?.label ?? primarySpeaker?.company_name ?? '',
        speakerImage: primarySpeaker?.picture_url ?? '',
      };
    }),
  );
}
