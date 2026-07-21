import { PartnerTrackingUrlPipe } from './partner-tracking-url.pipe';

describe('PartnerTrackingUrlPipe', () => {
  const pipe = new PartnerTrackingUrlPipe();

  it('should add UTM tags to partner URLs', () => {
    expect(pipe.transform('https://partner.example.com/path?existing=value')).toBe(
      'https://partner.example.com/path?existing=value&utm_source=angular-zurich&utm_medium=referral&utm_campaign=partners',
    );
  });
});
