import { DOCUMENT, NgClass } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
  private readonly guestMenuAnimationDurationMs = 360;
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly document = inject(DOCUMENT);
  private readonly avatarLoadFailed = signal(false);
  protected readonly guestMenuRendered = signal(false);
  protected readonly guestMenuOpen = signal(false);
  private readonly navMenus = viewChildren<ElementRef<HTMLDetailsElement>>('navMenu');
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
    return this.dark() ? 'Theme: Dark mode' : 'Theme: Light mode';
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
    clearTimeout(this.guestMenuCloseTimeoutId);
    this.guestMenuOpen.set(false);
    this.guestMenuCloseTimeoutId = setTimeout(() => {
      this.guestMenuRendered.set(false);
    }, this.guestMenuAnimationDurationMs);
  }

  protected toggleGuestMenu(): void {
    if (this.guestMenuRendered()) {
      this.closeGuestMenu();
      return;
    }

    clearTimeout(this.guestMenuCloseTimeoutId);
    this.guestMenuRendered.set(true);
    setTimeout(() => {
      this.guestMenuOpen.set(true);
    });
  }

  protected toggleDarkMode(): void {
    this.themeService.toggle();
  }
}
