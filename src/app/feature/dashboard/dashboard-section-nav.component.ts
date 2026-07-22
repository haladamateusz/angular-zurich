import {
  afterEveryRender,
  afterNextRender,
  Component,
  ElementRef,
  OnDestroy,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-dashboard-section-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './dashboard-section-nav.component.html',
  styleUrl: './dashboard-section-nav.component.css',
})
export class DashboardSectionNavComponent implements OnDestroy {
  private readonly navigation = viewChild.required<ElementRef<HTMLElement>>('navigation');
  private resizeObserver?: ResizeObserver;
  private transitionActivationTimer?: ReturnType<typeof setTimeout>;
  private isTransitionActivationQueued = false;

  constructor() {
    afterEveryRender(() => this.positionActiveIndicator());
    afterNextRender(() => this.observeNavigationSize());
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    clearTimeout(this.transitionActivationTimer);
  }

  private observeNavigationSize(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => this.positionActiveIndicator());
    this.resizeObserver.observe(this.navigation().nativeElement);
  }

  private positionActiveIndicator(): void {
    const navigation = this.navigation().nativeElement;
    const activeItem = navigation.querySelector<HTMLElement>(
      '.dashboard-section-nav__item--active',
    );

    if (!activeItem) {
      return;
    }

    const navigationBounds = navigation.getBoundingClientRect();
    const activeItemBounds = activeItem.getBoundingClientRect();

    navigation.style.setProperty(
      '--dashboard-section-nav-indicator-start',
      `${activeItemBounds.left - navigationBounds.left}px`,
    );
    navigation.style.setProperty(
      '--dashboard-section-nav-indicator-width',
      `${activeItemBounds.width}px`,
    );
    navigation.classList.add('dashboard-section-nav--indicator-ready');

    if (
      this.isTransitionActivationQueued ||
      navigation.classList.contains('dashboard-section-nav--indicator-animated')
    ) {
      return;
    }

    this.isTransitionActivationQueued = true;
    this.transitionActivationTimer = setTimeout(() => {
      navigation.classList.add('dashboard-section-nav--indicator-animated');
    });
  }
}
