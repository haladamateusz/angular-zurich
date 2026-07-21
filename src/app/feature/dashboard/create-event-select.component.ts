import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

export interface CreateEventSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-create-event-select',
  templateUrl: './create-event-select.component.html',
  styleUrl: './create-event-select.component.css',
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:wheel)': 'onDocumentScrollIntent($event)',
    '(document:touchmove)': 'onDocumentScrollIntent($event)',
    '(window:scroll)': 'close()',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class CreateEventSelectComponent implements FormValueControl<string> {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  readonly value = model.required<string>();
  readonly options = input.required<readonly CreateEventSelectOption[]>();
  readonly controlId = input.required<string>();
  readonly placeholder = input.required<string>();
  readonly ariaDescribedBy = input<string | null>(null);
  readonly ariaLabelledBy = input<string | null>(null);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly icon = input<'chevron' | 'clock'>('chevron');
  readonly touched = input(false);
  readonly touch = output<void>();

  protected readonly isOpen = signal(false);
  protected readonly activeIndex = signal(-1);
  protected readonly selectedOption = computed(() =>
    this.options().find((option) => option.value === this.value()),
  );
  protected readonly listboxId = computed(() => `${this.controlId()}-listbox`);
  protected readonly activeOptionId = computed(() => {
    const activeIndex = this.activeIndex();
    return this.isOpen() && activeIndex >= 0
      ? `${this.controlId()}-option-${activeIndex}`
      : null;
  });

  protected toggle(): void {
    if (this.disabled()) {
      return;
    }

    if (this.isOpen()) {
      this.close();
      return;
    }

    this.open();
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (this.isOpen()) {
          this.moveActiveOption(1);
        } else {
          this.open();
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.isOpen()) {
          this.moveActiveOption(-1);
        } else {
          this.open('last');
        }
        break;
      case 'Home':
        if (this.isOpen()) {
          event.preventDefault();
          this.setActiveBoundary('first');
        }
        break;
      case 'End':
        if (this.isOpen()) {
          event.preventDefault();
          this.setActiveBoundary('last');
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (this.isOpen()) {
          this.selectActiveOption();
        } else {
          this.open();
        }
        break;
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          this.close();
        }
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  protected setActiveIndex(index: number): void {
    if (!this.options()[index]?.disabled) {
      this.activeIndex.set(index);
    }
  }

  protected selectOption(option: CreateEventSelectOption): void {
    if (option.disabled) {
      return;
    }

    this.value.set(option.value);
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
    this.activeIndex.set(-1);
  }

  private open(initialOption: 'selected-or-first' | 'last' = 'selected-or-first'): void {
    this.isOpen.set(true);
    const selectedIndex = this.options().findIndex(
      (option) => option.value === this.value() && !option.disabled,
    );
    const fallbackIndex =
      initialOption === 'last'
        ? this.findEnabledIndex(this.options().length - 1, -1)
        : this.findEnabledIndex(0, 1);

    this.activeIndex.set(selectedIndex >= 0 ? selectedIndex : fallbackIndex);
  }

  private moveActiveOption(direction: 1 | -1): void {
    const options = this.options();

    if (options.length === 0) {
      return;
    }

    const currentIndex = this.activeIndex();
    const startIndex = currentIndex < 0 ? (direction === 1 ? 0 : options.length - 1) : currentIndex;

    for (let offset = 1; offset <= options.length; offset += 1) {
      const index = (startIndex + direction * offset + options.length) % options.length;

      if (!options[index]?.disabled) {
        this.activeIndex.set(index);
        return;
      }
    }
  }

  private setActiveBoundary(boundary: 'first' | 'last'): void {
    const startIndex = boundary === 'first' ? 0 : this.options().length - 1;
    const direction = boundary === 'first' ? 1 : -1;
    this.activeIndex.set(this.findEnabledIndex(startIndex, direction));
  }

  private findEnabledIndex(startIndex: number, direction: 1 | -1): number {
    for (
      let index = startIndex;
      index >= 0 && index < this.options().length;
      index += direction
    ) {
      if (!this.options()[index]?.disabled) {
        return index;
      }
    }

    return -1;
  }

  private selectActiveOption(): void {
    const option = this.options()[this.activeIndex()];

    if (option) {
      this.selectOption(option);
    }
  }
}
