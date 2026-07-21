import { DOCUMENT, NgClass } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { fromEvent } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'app-navbar',
  imports: [NgClass, RouterLink],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent {
  private readonly guestMenuAnimationDurationMs = 360;
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly document = inject(DOCUMENT);
  private readonly avatarLoadFailed = signal(false);
  protected readonly guestMenuRendered = signal(false);
  protected readonly guestMenuOpen = signal(false);
  private readonly guestMenuButton = viewChild<ElementRef<HTMLButtonElement>>('guestMenuButton');
  private readonly guestMenuCloseButton =
    viewChild<ElementRef<HTMLButtonElement>>('guestMenuCloseButton');
  private readonly guestMenuPanel = viewChild<ElementRef<HTMLElement>>('guestMenuPanel');
  private readonly navMenus = viewChildren<ElementRef<HTMLDetailsElement>>('navMenu');
  private guestMenuOpenTimeoutId: ReturnType<typeof setTimeout> | undefined;
  private guestMenuCloseTimeoutId: ReturnType<typeof setTimeout> | undefined;

  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly userProfile = this.authService.userProfile;
  protected readonly dark = this.themeService.dark;

  constructor() {
    effect(() => {
      this.userProfile();
      this.avatarLoadFailed.set(false);
    });

    effect(() => {
      this.document.body.style.overflow = this.guestMenuRendered() ? 'hidden' : '';
    });

    fromEvent<MouseEvent>(this.document, 'click')
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        const target = event.target;

        if (!(target instanceof Node)) {
          return;
        }

        for (const menuRef of this.navMenus()) {
          const details = menuRef.nativeElement;

          if (!details.open || details.contains(target)) {
            continue;
          }

          details.open = false;
        }
      });
  }

  protected get shouldShowAvatarImage(): boolean {
    return !!this.userProfile()?.avatarUrl && !this.avatarLoadFailed();
  }

  protected get mobileThemeLabel(): string {
    return this.dark() ? 'Switch to light mode' : 'Switch to dark mode';
  }

  protected handleAvatarLoadError(): void {
    this.avatarLoadFailed.set(true);
  }

  protected async signOut(): Promise<void> {
    await this.authService.signOut();
  }

  protected async signOutAndCloseGuestMenu(): Promise<void> {
    await this.signOut();
    this.closeGuestMenu();
  }

  protected closeMenu(event: Event): void {
    const details = (event.currentTarget as HTMLElement | null)?.closest('details');
    if (details instanceof HTMLDetailsElement) {
      details.open = false;
    }
  }

  protected closeGuestMenu(): void {
    clearTimeout(this.guestMenuOpenTimeoutId);
    clearTimeout(this.guestMenuCloseTimeoutId);
    this.guestMenuOpen.set(false);
    this.guestMenuCloseTimeoutId = setTimeout(() => {
      this.guestMenuRendered.set(false);
      this.guestMenuButton()?.nativeElement.focus();
    }, this.guestMenuAnimationDurationMs);
  }

  protected handleGuestMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeGuestMenu();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const panel = this.guestMenuPanel()?.nativeElement;
    if (!panel) {
      return;
    }

    const focusableElements = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0);

    const firstElement = focusableElements.at(0);
    const lastElement = focusableElements.at(-1);
    if (!firstElement || !lastElement) {
      event.preventDefault();
      return;
    }

    const activeElement = this.document.activeElement;
    if (event.shiftKey && (activeElement === firstElement || !panel.contains(activeElement))) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  protected toggleGuestMenu(): void {
    if (this.guestMenuRendered()) {
      this.closeGuestMenu();
      return;
    }

    clearTimeout(this.guestMenuCloseTimeoutId);
    this.guestMenuRendered.set(true);
    this.guestMenuOpenTimeoutId = setTimeout(() => {
      this.guestMenuOpen.set(true);
      this.guestMenuCloseButton()?.nativeElement.focus();
    }, 0);
  }

  protected toggleDarkMode(): void {
    this.themeService.toggle();
  }
}
