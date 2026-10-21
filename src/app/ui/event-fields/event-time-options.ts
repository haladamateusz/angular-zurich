import { CreateEventSelectOption } from './create-event-select.component';

export const EVENT_TIME_OPTIONS = Array.from({ length: 25 }, (_, index) => {
  const totalMinutes = 8 * 60 + index * 30;
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  return { value: time, label: time };
}) satisfies readonly CreateEventSelectOption[];
