import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type ToastVariant = 'error' | 'info' | 'success' | 'warning';

export interface ToastOptions {
  duration?: number;
  dismissible?: boolean;
  title?: string;
  variant?: ToastVariant;
}

export interface Toast {
  dismissible: boolean;
  dismissing: boolean;
  duration: number;
  id: number;
  message: string;
  title?: string;
  variant: ToastVariant;
}

const DEFAULT_TOAST_DURATION = 5_000;
const TOAST_EXIT_ANIMATION_DURATION = 180;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly toastList = signal<readonly Toast[]>([]);
  private readonly timeouts = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 0;

  readonly toasts = this.toastList.asReadonly();

  show(message: string, options: ToastOptions = {}): number {
    const id = this.nextId + 1;
    this.nextId = id;

    const toast: Toast = {
      dismissible: options.dismissible ?? true,
      dismissing: false,
      duration: Math.max(0, options.duration ?? DEFAULT_TOAST_DURATION),
      id,
      message,
      title: options.title,
      variant: options.variant ?? 'info',
    };

    this.toastList.update((toasts) => [...toasts, toast]);
    this.scheduleDismissal(toast);

    return id;
  }

  success(message: string, options: Omit<ToastOptions, 'variant'> = {}): number {
    return this.show(message, { ...options, variant: 'success' });
  }

  error(message: string, options: Omit<ToastOptions, 'variant'> = {}): number {
    return this.show(message, { ...options, variant: 'error' });
  }

  warning(message: string, options: Omit<ToastOptions, 'variant'> = {}): number {
    return this.show(message, { ...options, variant: 'warning' });
  }

  info(message: string, options: Omit<ToastOptions, 'variant'> = {}): number {
    return this.show(message, { ...options, variant: 'info' });
  }

  dismiss(id: number): void {
    const toast = this.toastList().find((item) => item.id === id);

    if (!toast || toast.dismissing) {
      return;
    }

    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }

    this.toastList.update((toasts) =>
      toasts.map((item) => (item.id === id ? { ...item, dismissing: true } : item)),
    );

    if (!isPlatformBrowser(this.platformId)) {
      this.remove(id);
      return;
    }

    const exitTimeout = setTimeout(() => this.remove(id), TOAST_EXIT_ANIMATION_DURATION);
    this.timeouts.set(id, exitTimeout);
  }

  clear(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }

    this.timeouts.clear();
    this.toastList.set([]);
  }

  private scheduleDismissal(toast: Toast): void {
    if (toast.duration === 0 || !isPlatformBrowser(this.platformId)) {
      return;
    }

    const timeout = setTimeout(() => this.dismiss(toast.id), toast.duration);
    this.timeouts.set(toast.id, timeout);
  }

  private remove(id: number): void {
    this.timeouts.delete(id);
    this.toastList.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }
}
