import { Component } from '@angular/core';

interface TeamMember {
  name: string;
  role: string;
  image: string;
}

@Component({
  selector: 'app-team',
  imports: [],
  templateUrl: './team.component.html',
  styleUrl: './team.component.css',
})
export class TeamComponent {
  protected readonly team: TeamMember[] = [
    {
      name: 'Tomas Trajan',
      role: 'Architect, Consultant and Trainer, GDE, AngularExperts.io',
      image: 'https://api.dicebear.com/9.x/notionists/svg?seed=sophie',
    },
    {
      name: 'Mateusz Halada',
      role: 'Senior Frontend Developer @ Involve',
      image: 'https://api.dicebear.com/9.x/notionists/svg?seed=john',
    }
  ];

  protected readonly hallOfFame: TeamMember[] = [
    {
      name: 'Carlos Morales',
      role: 'Founder & Former Organizer',
      image: 'https://api.dicebear.com/9.x/notionists/svg?seed=skrrt',
    },
    {
      name: 'Gion Kunz',
      role: 'Former Organizer',
      image: 'https://api.dicebear.com/9.x/notionists/svg?seed=broski',
    },
  ];
}
