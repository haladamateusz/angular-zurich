import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { NavbarComponent } from './navbar.component';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;
  const isAuthenticated = signal(false);
  const userProfile = signal<{ avatarUrl: string | null; displayName: string } | null>(null);

  beforeEach(async () => {
    isAuthenticated.set(false);
    userProfile.set(null);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    await TestBed.configureTestingModule({
      imports: [NavbarComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated,
            userProfile,
            signOut: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a mobile guest navigation dialog with theme, sign in, and submit talk actions', async () => {
    const host = fixture.nativeElement as HTMLElement;
    const guestMenuButton = host.querySelector<HTMLButtonElement>(
      'button[aria-controls="guest-mobile-menu"]',
    );

    expect(guestMenuButton).toBeTruthy();

    guestMenuButton?.click();
    await fixture.whenStable();

    const guestMenu = host.querySelector('#guest-mobile-menu');

    expect(guestMenu).toBeTruthy();
    expect(guestMenu?.getAttribute('role')).toBe('dialog');
    expect(guestMenu?.getAttribute('aria-modal')).toBe('true');
    expect(guestMenu?.textContent).toContain('Switch to dark mode');
    expect(guestMenu?.textContent).toContain('Sign in');
    expect(guestMenu?.textContent).toContain('Submit Talk');
  });

  it('renders signed-in identity and separates log out at the bottom of the mobile menu', async () => {
    isAuthenticated.set(true);
    userProfile.set({
      avatarUrl: null,
      displayName: 'Mateusz Halada',
    });
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const guestMenuButton = host.querySelector<HTMLButtonElement>(
      'button[aria-controls="guest-mobile-menu"]',
    );

    guestMenuButton?.click();
    await fixture.whenStable();

    const guestMenu = host.querySelector('#guest-mobile-menu');
    const mobileFooter = guestMenu?.querySelector('.mt-auto');
    const desktopAvatarFallback = host.querySelector(
      'summary.navbar-profile-trigger .navbar-profile-avatar',
    );

    expect(guestMenu?.textContent).toContain('Mateusz Halada');
    expect(guestMenu?.textContent).toContain('Dashboard');
    expect(mobileFooter?.textContent).toContain('Log out');
    expect(desktopAvatarFallback?.classList).toContain('h-7');
    expect(desktopAvatarFallback?.classList).toContain('w-7');
  });

  it('focuses the close button, closes on Escape, and restores focus to the trigger', async () => {
    const host = fixture.nativeElement as HTMLElement;
    const guestMenuButton = host.querySelector<HTMLButtonElement>(
      'button[aria-controls="guest-mobile-menu"]',
    );

    guestMenuButton?.click();
    await vi.waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Close navigation menu');
    });

    const guestMenu = host.querySelector<HTMLElement>('#guest-mobile-menu');
    guestMenu?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));

    await vi.waitFor(
      () => {
        expect(host.querySelector('#guest-mobile-menu')).toBeNull();
        expect(document.activeElement).toBe(guestMenuButton);
      },
      { timeout: 700 },
    );
  });

  it('traps Tab focus within the mobile navigation dialog', async () => {
    const host = fixture.nativeElement as HTMLElement;
    const guestMenuButton = host.querySelector<HTMLButtonElement>(
      'button[aria-controls="guest-mobile-menu"]',
    );

    guestMenuButton?.click();
    await fixture.whenStable();

    const guestMenu = host.querySelector<HTMLElement>('#guest-mobile-menu');
    const focusableElements = Array.from(
      guestMenu?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    for (const element of focusableElements) {
      vi.spyOn(element, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
    }

    const firstElement = focusableElements.at(0);
    const lastElement = focusableElements.at(-1);
    lastElement?.focus();
    lastElement?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' }),
    );

    expect(document.activeElement).toBe(firstElement);
  });

  it('renders dashboard and submit talk as visible desktop actions for authenticated users', async () => {
    isAuthenticated.set(true);
    userProfile.set({
      avatarUrl: null,
      displayName: 'Mateusz Halada',
    });
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const submitTalkLink = host.querySelector<HTMLAnchorElement>('a[href="/talk-submission"]');

    expect(host.textContent).toContain('Dashboard');
    expect(host.textContent).toContain('Submit Talk');
    expect(submitTalkLink?.classList).toContain('app-button--ghost');
  });

  it('keeps submit talk as the primary desktop action for signed-out users', () => {
    const host = fixture.nativeElement as HTMLElement;
    const submitTalkLink = host.querySelector<HTMLAnchorElement>('a[href="/talk-submission"]');

    expect(submitTalkLink).toBeTruthy();
    expect(submitTalkLink?.classList).not.toContain('app-button--ghost');
  });

  it('renders a compact decorative avatar in the desktop profile trigger', async () => {
    isAuthenticated.set(true);
    userProfile.set({
      avatarUrl: 'https://example.com/avatar.png',
      displayName: 'Mateusz Halada',
    });
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const profileTrigger = host.querySelector('summary.navbar-profile-trigger');
    const avatar = profileTrigger?.querySelector('img.navbar-profile-avatar');

    expect(profileTrigger).toBeTruthy();
    expect(avatar?.getAttribute('width')).toBe('28');
    expect(avatar?.getAttribute('height')).toBe('28');
    expect(avatar?.getAttribute('alt')).toBe('');
  });
});
