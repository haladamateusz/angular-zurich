import { Component } from '@angular/core';

interface Talk {
  speakerName: string;
  speakerPosition: string;
  speakerImage: string;
  title: string;
}

@Component({
  selector: 'app-upcoming-talks',
  imports: [],
  templateUrl: './upcoming-talks.component.html',
  styleUrl: './upcoming-talks.component.css',
})
export class UpcomingTalksComponent {
  protected readonly talks: Talk[] = [
    {
      speakerName: 'Anna Müller',
      speakerPosition: 'Senior Frontend Engineer at Google',
      speakerImage: 'https://api.dicebear.com/9.x/notionists/svg?seed=anna',
      title: 'Signals in Depth: Reactivity Reimagined',
    },
    {
      speakerName: 'Marco Rossi',
      speakerPosition: 'GDE for Angular, Freelance Consultant',
      speakerImage: 'https://api.dicebear.com/9.x/notionists/svg?seed=marco',
      title: 'Building Scalable Micro-Frontends with Angular',
    },
    {
      speakerName: 'Lena Fischer',
      speakerPosition: 'Staff Engineer at Zühlke',
      speakerImage: 'https://api.dicebear.com/9.x/notionists/svg?seed=lena',
      title: 'From NgModules to Standalone: A Migration Story',
    },
  ];
}
