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
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a mobile guest navigation slide-over with theme, sign in, and submit talk actions', () => {
    const host = fixture.nativeElement as HTMLElement;
    const guestMenuButton = host.querySelector('button[aria-controls="guest-mobile-menu"]');

    expect(guestMenuButton).toBeTruthy();

    guestMenuButton?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    const guestMenu = host.querySelector('#guest-mobile-menu');

    expect(guestMenu).toBeTruthy();
    expect(guestMenu?.textContent).toContain('Theme: Light mode');
    expect(guestMenu?.textContent).toContain('Sign in');
    expect(guestMenu?.textContent).toContain('Submit Talk');
  });
});
