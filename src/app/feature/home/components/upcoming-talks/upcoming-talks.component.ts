import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Event } from '../../../../core/models/event.interface';
import { splitTextIntoParagraphs } from '../../../../core/utils/split-text-into-paragraphs';

@Component({
  selector: 'app-upcoming-talks',
  imports: [RouterLink],
  templateUrl: './upcoming-talks.component.html',
  styleUrl: './upcoming-talks.component.css',
})
export class UpcomingTalksComponent {
  readonly talks = input.required<Event['talks']>();
  readonly eventSlug = input.required<string>();

  protected readonly talkCards = computed(() =>
    this.talks().map((talk) => {
      const primarySpeaker = talk.speaker_links[0]?.speaker ?? null;
      const firstName = primarySpeaker?.first_name?.trim() ?? '';
      const lastName = primarySpeaker?.last_name?.trim() ?? '';
      const speakerName = [firstName, lastName]
        .filter((value): value is string => Boolean(value))
        .join(' ');
      const resolvedSpeakerName = speakerName || 'TBA';
      const speakerInitials =
        `${firstName.charAt(0)}${lastName.charAt(0)}`.trim() ||
        resolvedSpeakerName.charAt(0).toUpperCase();

      return {
        id: talk.id,
        title: talk.title,
        descriptionParagraphs: splitTextIntoParagraphs(talk.description),
        speakerName: resolvedSpeakerName,
        speakerInitials,
        speakerPosition: primarySpeaker?.label ?? primarySpeaker?.company_name ?? '',
        speakerImage: primarySpeaker?.picture_url ?? '',
      };
    }),
  );
}
