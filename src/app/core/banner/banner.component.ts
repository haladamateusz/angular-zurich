import { Component, input } from '@angular/core';

@Component({
  selector: 'app-banner',
  imports: [],
  templateUrl: './banner.component.html',
  styleUrl: './banner.component.css',
})
export class BannerComponent {
  eventDetails = input(
    {
      venue: {
        companyName: 'Constructor Nexademy',
        street: 'Foerrlibuckstrasse 150',
        postalCode: '8005',
        city: 'Zürich',
      }
    }
  )
}
