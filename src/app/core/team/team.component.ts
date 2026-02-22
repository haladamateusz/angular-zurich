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
      name: 'Mateusz Halada',
      role: 'Organizer & Frontend Engineer',
      image: 'https://api.dicebear.com/9.x/notionists/svg?seed=mateusz',
    },
    {
      name: 'Sophie Berger',
      role: 'Co-Organizer & Developer Advocate',
      image: 'https://api.dicebear.com/9.x/notionists/svg?seed=sophie',
    },
  ];

  protected readonly hallOfFame: TeamMember[] = [
    {
      name: 'Thomas Keller',
      role: 'Founder & Former Organizer',
      image: 'https://api.dicebear.com/9.x/notionists/svg?seed=thomas',
    },
    {
      name: 'Julia Schneider',
      role: 'Former Co-Organizer & GDE',
      image: 'https://api.dicebear.com/9.x/notionists/svg?seed=julia',
    },
  ];
}
