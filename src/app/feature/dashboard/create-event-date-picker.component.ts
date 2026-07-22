import { isPlatformBrowser } from '@angular/common';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

interface CalendarDateElement extends HTMLElement {
  value: string;
  focus(options?: FocusOptions & { target?: 'day' | 'next' | 'previous' }): void;
}

function getLocalDateValue(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseLocalDateValue(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : date;
}

@Component({
  selector: 'app-create-event-date-picker',
  templateUrl: './create-event-date-picker.component.html',
  styleUrl: './create-event-date-picker.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:wheel)': 'onDocumentScrollIntent($event)',
    '(document:touchmove)': 'onDocumentScrollIntent($event)',
    '(window:scroll)': 'close()',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class CreateEventDatePickerComponent implements FormValueControl<string> {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly calendar = viewChild<ElementRef<CalendarDateElement>>('calendar');

  readonly value = model.required<string>();
  readonly controlId = input.required<string>();
  readonly placeholder = input.required<string>();
  readonly minDate = input<string | null>(getLocalDateValue(new Date()));
  readonly maxDate = input<string | null>(null);
  readonly ariaDescribedBy = input<string | null>(null);
  readonly ariaLabelledBy = input<string | null>(null);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly touch = output<void>();

  protected readonly isOpen = signal(false);
  protected readonly isCalendarReady = signal(false);
  protected readonly panelId = computed(() => `${this.controlId()}-dialog`);
  protected readonly displayValue = computed(
    () => this.formatDate(this.value()) ?? this.placeholder(),
  );

  constructor() {
    if (this.isBrowser) {
      void import('cally').then(() => {
        this.isCalendarReady.set(true);
        this.focusCalendar();
      });
    }
  }

  protected toggle(): void {
    if (this.isOpen()) {
      this.close();
      return;
    }

    this.open();
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.open();
        break;
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          this.close();
        }
        break;
    }
  }

  protected selectDate(event: Event): void {
    const nextValue = (event.target as CalendarDateElement).value;

    if (!nextValue) {
      return;
    }

    this.value.set(nextValue);
    this.touch.emit();
    this.close();
    this.focus();
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  protected onDocumentScrollIntent(event: Event): void {
    if (event.target instanceof Node && this.elementRef.nativeElement.contains(event.target)) {
      return;
    }

    this.close();
  }

  protected onFocusOut(event: FocusEvent): void {
    const nextTarget = event.relatedTarget;

    if (!(nextTarget instanceof Node) || !this.elementRef.nativeElement.contains(nextTarget)) {
      this.close();
      this.touch.emit();
    }
  }

  focus(options?: FocusOptions): void {
    this.trigger()?.nativeElement.focus(options);
  }

  reset(): void {
    this.close();
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  private open(): void {
    this.isOpen.set(true);
    this.focusCalendar();
  }

  private focusCalendar(): void {
    if (!this.isBrowser || !this.isOpen()) {
      return;
    }

    window.requestAnimationFrame(() => {
      this.calendar()?.nativeElement.focus({ target: 'day', preventScroll: true });
    });
  }

  private formatDate(value: string): string | null {
    const date = parseLocalDateValue(value);

    if (!date) {
      return null;
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }
}
