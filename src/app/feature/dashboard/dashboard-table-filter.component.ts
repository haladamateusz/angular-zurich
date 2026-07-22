import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  CreateEventSelectComponent,
  CreateEventSelectOption,
} from './create-event-select.component';
import { CreateEventDatePickerComponent } from './create-event-date-picker.component';

export type DashboardTableFilterType = 'date-range' | 'select' | 'text';
export type DashboardTableFilterAlignment = 'end' | 'start';

export interface DashboardTableDateRange {
  startDate: string;
  endDate: string;
}

@Component({
  selector: 'app-dashboard-table-filter',
  imports: [CreateEventDatePickerComponent, CreateEventSelectComponent],
  templateUrl: './dashboard-table-filter.component.html',
  styleUrl: './dashboard-table-filter.component.css',
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '[class.dashboard-table-filter--end-aligned]': 'alignment() === "end"',
  },
})
export class DashboardTableFilterComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  readonly controlId = input.required<string>();
  readonly label = input.required<string>();
  readonly type = input.required<DashboardTableFilterType>();
  readonly alignment = input<DashboardTableFilterAlignment>('start');
  readonly value = input('');
  readonly startDate = input('');
  readonly endDate = input('');
  readonly options = input<readonly CreateEventSelectOption[]>([]);
  readonly active = input(false);
  readonly valueChange = output<string>();
  readonly dateRangeChange = output<DashboardTableDateRange>();
  readonly clear = output<void>();

  protected readonly isOpen = signal(false);
  protected readonly popoverId = computed(() => `${this.controlId()}-popover`);

  protected toggle(): void {
    this.isOpen.update((isOpen) => !isOpen);
  }

  protected updateValue(event: Event): void {
    const target = event.target;

    if (target instanceof HTMLInputElement) {
      this.valueChange.emit(target.value);
    }
  }

  protected updateStartDate(startDate: string): void {
    this.dateRangeChange.emit({ startDate, endDate: this.endDate() });
  }

  protected updateEndDate(endDate: string): void {
    this.dateRangeChange.emit({ startDate: this.startDate(), endDate });
  }

  protected clearFilter(): void {
    this.clear.emit();
    this.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    this.close();
    this.trigger().nativeElement.focus();
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.isOpen() || this.elementRef.nativeElement.contains(event.target as Node)) {
      return;
    }

    this.close();
  }

  private close(): void {
    this.isOpen.set(false);
  }
}
