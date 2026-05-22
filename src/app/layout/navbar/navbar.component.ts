import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  private readonly avatarLoadFailed = signal(false);

  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly userProfile = this.authService.userProfile;
  protected readonly dark = this.themeService.dark;

  constructor() {
    effect(() => {
      this.userProfile();
      this.avatarLoadFailed.set(false);
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
