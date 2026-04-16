import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'navbarDateFormat',
})
export class NavbarDateFormatPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const formatter = new Intl.DateTimeFormat('de-CH', {
      timeZone: 'Europe/Zurich',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';

    return `${get('day')}.${get('month')}.${get('year')} @ ${get('hour')}:${get('minute')}`;
  }
}
