import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'eventDateFormat',
})
export class EventDateFormatPipe implements PipeTransform {
  transform(value: string | null | undefined, mode: 'full' | 'date' | 'time' = 'full'): string {
    if (!value) {
      return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const dateParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich',
      month: 'short',
      year: 'numeric',
    }).formatToParts(date);

    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const day = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Zurich',
        day: 'numeric',
      }).format(date),
    );

    const month = dateParts.find((part) => part.type === 'month')?.value ?? '';
    const year = dateParts.find((part) => part.type === 'year')?.value ?? '';
    const formattedDate = `${day} ${month} ${year}`;
    const formattedTime = timeFormatter.format(date);

    if (mode === 'date') {
      return formattedDate;
    }

    if (mode === 'time') {
      return formattedTime;
    }

    return `${formattedDate} at ${formattedTime}`;
  }
}
