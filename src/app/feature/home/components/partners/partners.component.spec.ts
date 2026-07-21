import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PartnersComponent } from './partners.component';
import { Sponsor } from '../../../../core/models/sponsor.interface';

const TEST_PARTNERS: Sponsor[] = [
  {
    id: 'partner-1',
    title: 'Zurich Type Systems',
    logo_url: 'https://example.com/logo.svg',
    website_url: 'https://partner.example.com/path?existing=value',
    created_by: 'organizer-1',
  },
];

describe('PartnersComponent', () => {
  let component: PartnersComponent;
  let fixture: ComponentFixture<PartnersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PartnersComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PartnersComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('partners', TEST_PARTNERS);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should add UTM tags to partner links', () => {
    const element = fixture.nativeElement as HTMLElement;
    const link = element.querySelector<HTMLAnchorElement>('.partner-card');

    expect(link?.href).toBe(
      'https://partner.example.com/path?existing=value&utm_source=angular-zurich&utm_medium=referral&utm_campaign=partners',
    );
  });
});
