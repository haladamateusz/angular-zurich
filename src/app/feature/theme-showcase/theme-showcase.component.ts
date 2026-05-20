import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-theme-showcase',
  imports: [],
  templateUrl: './theme-showcase.component.html',
  styleUrl: './theme-showcase.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeShowcaseComponent {}
