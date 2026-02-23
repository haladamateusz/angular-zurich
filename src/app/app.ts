import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BannerComponent } from './core/banner/banner.component';
import { NavbarComponent } from './core/navbar/navbar.component';
import { HeroComponent } from './core/hero/hero.component';
import { UpcomingTalksComponent } from './core/upcoming-talks/upcoming-talks.component';
import { TeamComponent } from './core/team/team.component';
import { PartnersComponent } from './core/partners/partners.component';
import { StatsComponent } from './core/stats/stats.component';
import { ThemeShowcaseComponent } from './extra/theme-showcase/theme-showcase.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BannerComponent, NavbarComponent, HeroComponent, StatsComponent, UpcomingTalksComponent, TeamComponent, PartnersComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
}
