import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChatHistoryService } from '../data-access/chat-history.service';
import { ChatThread } from '../../../core/models/chat-history.model';

@Component({
  selector: 'app-chat-history',
  imports: [RouterLink, ReactiveFormsModule, NgTemplateOutlet],
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
  protected readonly collapsed = signal(false);
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

  protected openDrawer() {
    this.drawer()?.nativeElement.showModal();
  }
  protected closeDrawer() {
    this.drawer()?.nativeElement.close();
  }
  protected create() {
    this.closeDrawer();
    this.newChat.emit();
  }
  protected edit(thread: ChatThread, remove = false) {
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
