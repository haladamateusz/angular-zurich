import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BannerComponent } from './core/components/banner/banner.component';
import { NavbarComponent } from './core/components/navbar/navbar.component';
import { HeroComponent } from './core/components/hero/hero.component';
import { UpcomingTalksComponent } from './core/components/upcoming-talks/upcoming-talks.component';
import { TeamComponent } from './core/components/team/team.component';
import { PartnersComponent } from './core/components/partners/partners.component';
import { StatsComponent } from './core/components/stats/stats.component';
import { ThemeShowcaseComponent } from './extra/theme-showcase/theme-showcase.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BannerComponent, NavbarComponent, HeroComponent, StatsComponent, UpcomingTalksComponent, TeamComponent, PartnersComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
}
