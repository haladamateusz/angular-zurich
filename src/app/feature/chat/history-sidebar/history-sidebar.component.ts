import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChatHistoryService } from '../data-access/chat-history.service';
import { ChatThread } from '../../../core/models/chat-history.model';

type HistoryRow =
  | { kind: 'heading'; id: string; label: string }
  | { kind: 'thread'; id: string; thread: ChatThread };

@Component({
  selector: 'app-chat-history',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    NgTemplateOutlet,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    CdkVirtualScrollViewport,
  ],
  templateUrl: './history-sidebar.component.html',
  styleUrl: './history-sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistorySidebarComponent {
  readonly activeId = input<string | null>(null);
  readonly newChat = output<void>();
  readonly renamed = output<ChatThread>();
  readonly deleted = output<string>();
  protected readonly history = inject(ChatHistoryService);
  private readonly document = inject(DOCUMENT);
  protected readonly drawerOpen = signal(false);
  protected readonly rowHeight = 48;
  protected readonly menu = signal<string | null>(null);
  protected readonly editing = signal<ChatThread | null>(null);
  protected readonly deleting = signal<ChatThread | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal('');
  protected readonly title = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(100)],
  });
  private readonly drawer = viewChild<ElementRef<HTMLDialogElement>>('drawer');
  private readonly editor = viewChild<ElementRef<HTMLDialogElement>>('editor');
  private readonly viewports = viewChildren(CdkVirtualScrollViewport);
  protected readonly groups = computed(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(
      new Date(),
    );
    const todayDay = Date.parse(`${today}T12:00:00Z`);
    const groups = ['Today', 'Yesterday', 'Previous 7 days', 'Older'].map((label) => ({
      label,
      items: [] as ChatThread[],
    }));
    for (const item of this.history.items()) {
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(
        new Date(item.last_message_at),
      );
      const days = Math.round((todayDay - Date.parse(`${date}T12:00:00Z`)) / 86400000);
      groups[days <= 0 ? 0 : days === 1 ? 1 : days < 7 ? 2 : 3].items.push(item);
    }
    return groups.filter((group) => group.items.length);
  });
  protected readonly rows = computed(() => {
    const rows: HistoryRow[] = [];
    for (const group of this.groups()) {
      rows.push({ kind: 'heading', id: group.label, label: group.label });
      for (const thread of group.items) {
        rows.push({ kind: 'thread', id: thread.id, thread });
      }
    }
    return rows;
  });

  constructor() {
    afterRenderEffect((onCleanup) => {
      const viewports = this.viewports();
      const observer = new ResizeObserver(() => {
        for (const viewport of viewports) viewport.checkViewportSize();
      });
      for (const viewport of viewports) observer.observe(viewport.elementRef.nativeElement);
      onCleanup(() => observer.disconnect());
    });
  }

  protected trackRow(_index: number, row: HistoryRow): string {
    return row.id;
  }

  protected toggleActions(event: MouseEvent, popup: HTMLElement) {
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) return;
    if (popup.matches(':popover-open')) {
      popup.hidePopover();
      return;
    }
    popup.showPopover({ source: trigger });
    const anchor = trigger.getBoundingClientRect();
    const bounds = popup.getBoundingClientRect();
    const view = this.document.defaultView;
    if (!view) return;
    const gutter = 8;
    const below = anchor.bottom + 5;
    const top =
      below + bounds.height <= view.innerHeight - gutter
        ? below
        : Math.max(gutter, anchor.top - bounds.height - 5);
    popup.style.top = `${top}px`;
    popup.style.left = `${Math.max(gutter, Math.min(anchor.right - bounds.width, view.innerWidth - bounds.width - gutter))}px`;
    popup.querySelector<HTMLButtonElement>('button')?.focus();
  }

  protected onMenuToggle(event: Event, id: string) {
    const popup = event.currentTarget;
    if (popup instanceof HTMLElement && popup.matches(':popover-open')) this.menu.set(id);
    else if (this.menu() === id) this.menu.set(null);
  }

  protected closeActions() {
    for (const popup of this.document.querySelectorAll<HTMLElement>(
      '.history-actions:popover-open',
    )) {
      popup.hidePopover();
    }
  }

  protected openDrawer() {
    this.drawerOpen.set(true);
    this.drawer()?.nativeElement.showModal();
  }
  protected closeDrawer() {
    this.closeActions();
    this.drawer()?.nativeElement.close();
  }
  protected create() {
    this.closeDrawer();
    this.newChat.emit();
  }
  protected edit(thread: ChatThread, remove = false) {
    this.closeActions();
    this.menu.set(null);
    this.actionError.set('');
    this.editing.set(remove ? null : thread);
    this.deleting.set(remove ? thread : null);
    this.title.setValue(thread.title);
    this.editor()?.nativeElement.showModal();
  }
  protected closeEditor() {
    if (!this.busy()) this.editor()?.nativeElement.close();
  }
  protected async save() {
    if (this.busy()) return;
    const remove = this.deleting(),
      edit = this.editing();
    if (!remove && (!edit || this.title.invalid || !this.title.value.trim())) return;
    this.busy.set(true);
    this.actionError.set('');
    try {
      if (remove) {
        await this.history.remove(remove.id);
        this.closeDrawer();
        this.deleted.emit(remove.id);
      } else if (edit) this.renamed.emit(await this.history.rename(edit, this.title.value.trim()));
      this.editor()?.nativeElement.close();
    } catch (error) {
      this.actionError.set(
        error instanceof Error ? error.message : 'The change could not be saved.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
