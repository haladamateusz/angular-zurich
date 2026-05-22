import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fromEvent } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly document = inject(DOCUMENT);
  private readonly avatarLoadFailed = signal(false);
  private readonly userMenu = viewChild<ElementRef<HTMLDetailsElement>>('userMenu');

  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly userProfile = this.authService.userProfile;
  protected readonly dark = this.themeService.dark;

  constructor() {
    effect(() => {
      this.userProfile();
      this.avatarLoadFailed.set(false);
    });

    fromEvent<MouseEvent>(this.document, 'click')
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        const details = this.userMenu()?.nativeElement;
        const target = event.target;

        if (
          !(details instanceof HTMLDetailsElement) ||
          !details.open ||
          !(target instanceof Node) ||
          details.contains(target)
        ) {
          return;
        }

        details.open = false;
      });
  }

  protected get shouldShowAvatarImage(): boolean {
    return !!this.userProfile()?.avatarUrl && !this.avatarLoadFailed();
  }

  protected handleAvatarLoadError(): void {
    this.avatarLoadFailed.set(true);
  }

  protected async signOut(): Promise<void> {
    await this.authService.signOut();
  }

  protected closeMenu(event: Event): void {
    const details = (event.currentTarget as HTMLElement | null)?.closest('details');
    if (details instanceof HTMLDetailsElement) {
      details.open = false;
    }
  }

  protected toggleDarkMode(): void {
    this.themeService.toggle();
  }
}
