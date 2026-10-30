jest.mock('../src/infrastructure/supabaseClient', () => ({ supabase: {}, RAKEEN_API_BASE_URL: 'https://rk.test' }));
jest.mock('../src/infrastructure/printerProfileStore', () => ({ getPrinterProfile: async () => null }));
jest.mock('../src/infrastructure/mmkvStorage', () => ({ getItem: async () => null, setItem: async () => {} }));
jest.mock('../src/application/authService', () => ({ getDeviceConfig: async () => ({ businessId: null }) }));

import { brandConfig, qrImageUrl, totalText } from '../src/application/customerDisplayService';

describe('customer display', () => {
  it('passes the name image only when it is https', () => {
    const withImg = JSON.parse(brandConfig({ name: 'مكبوس زربيان', logo: 'https://x.test/ar-cream.png', color: '#5C1408' }));
    expect(withImg.logo).toBe('https://x.test/ar-cream.png');
    expect(withImg.name).toBe('مكبوس زربيان');
    expect(JSON.parse(brandConfig({ name: 'م', logo: 'http://x.test/a.png', color: '#5C1408' })).logo).toBe('');
  });

  it('puts the menu QR only when a menu link is set', () => {
    expect(JSON.parse(brandConfig({ name: 'م', logo: '', color: '#5C1408', menu: 'https://m.test/' })).menuQr).toBe('https://m.test/');
    expect(JSON.parse(brandConfig({ name: 'م', logo: '', color: '#5C1408' })).menuQr).toBe('');
  });

  it('picks a readable ink for the background', () => {
    const dark = JSON.parse(brandConfig({ name: 'م', logo: '', color: '#5C1408' }));
    expect(dark.ink).toBe('#FBEABE');
    expect(dark.soft).toBe('#B8FBEABE');
    expect(JSON.parse(brandConfig({ name: 'م', logo: '', color: '#C7FF4D' })).ink).toBe('#2A0D06');
    expect(JSON.parse(brandConfig({ name: 'م', logo: '', color: 'nope' })).bg).toBe('#5C1408');
  });

  it('formats the amount and clears on nothing to pay', () => {
    expect(totalText(84)).toBe('84.00');
    expect(totalText(12.5)).toBe('12.50');
    expect(totalText(0)).toBe('');
    expect(totalText(null)).toBe('');
  });

  it('builds the QR image from the Rakeen QR endpoint', () => {
    expect(qrImageUrl('https://a.test/x?y=1')).toBe('https://rk.test/api/qr?data=https%3A%2F%2Fa.test%2Fx%3Fy%3D1');
  });
});
