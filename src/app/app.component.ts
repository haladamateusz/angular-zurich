import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FooterComponent } from './layout/footer/footer.component';
import { NavbarComponent } from './layout/navbar/navbar.component';
import { ToastOutletComponent } from './ui/toast-outlet/toast-outlet.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavbarComponent, FooterComponent, ToastOutletComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class App {}
