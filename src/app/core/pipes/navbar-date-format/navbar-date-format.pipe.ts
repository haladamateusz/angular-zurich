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

    const dateParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich',
      month: 'long',
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

    return `${this.formatOrdinal(day)} ${month} ${year} starts at ${timeFormatter.format(date)}`;
  }

  private formatOrdinal(day: number): string {
    const remainder10 = day % 10;
    const remainder100 = day % 100;

    if (remainder10 === 1 && remainder100 !== 11) {
      return `${day}st`;
    }

    if (remainder10 === 2 && remainder100 !== 12) {
      return `${day}nd`;
    }

    if (remainder10 === 3 && remainder100 !== 13) {
      return `${day}rd`;
    }

    return `${day}th`;
  }
}
