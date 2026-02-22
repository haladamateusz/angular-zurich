import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpcomingTalksComponent } from './upcoming-talks.component';

describe('UpcomingTalksComponent', () => {
  let component: UpcomingTalksComponent;
  let fixture: ComponentFixture<UpcomingTalksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpcomingTalksComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpcomingTalksComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
