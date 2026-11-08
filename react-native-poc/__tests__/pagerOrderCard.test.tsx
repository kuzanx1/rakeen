/**
 * «ضغطت جاهز وانقفل التطبيق» -- 2026-11-08. البطاقة تمرّ بالضبط بما تمرّ به
 * الضغطة: قبل الجاهزية ← مشغول ← جاهز ← مستلَم، بالخيارين (بوعد وبلا وعد).
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('../src/infrastructure/supabaseClient', () => ({ supabase: {}, RAKEEN_API_BASE_URL: 'https://rk.test' }));
jest.mock('../src/infrastructure/mmkvStorage', () => ({ getItem: async () => null, setItem: async () => {} }));
jest.mock('../src/application/soundService', () => ({ playTapSound: () => {}, playAlertSound: () => {} }));

import PagerOrderCard from '../src/ui/PagerOrderCard';
import { pagerConfig, normalizePagerSettings } from '../src/application/pagerService';
import type { PagerOrder } from '../src/application/pagerService';

const base: PagerOrder = {
  id: 53930, channel: 'pickup', total: 20, customerName: null, createdAt: new Date(Date.now() - 60_000),
  etaAt: new Date(Date.now() + 14 * 60_000), readyAt: null, delayedAt: null, seenAt: new Date(), ringCount: 0,
};

const texts = (t: renderer.ReactTestRenderer) =>
  t.root.findAll(n => typeof n.type === 'string' && n.props.children != null)
    .map(n => [].concat(n.props.children).filter(c => typeof c === 'string').join('')).join(' | ');

describe.each([true, false])('show_eta=%s', showEta => {
  beforeAll(() => { Object.assign(pagerConfig().settings, normalizePagerSettings({ show_eta: showEta })); });
  it('prep → busy → ready → shows «استلمه», no throw', () => {
    let t!: renderer.ReactTestRenderer;
    act(() => { t = renderer.create(<PagerOrderCard order={base} busy={false} onAction={() => {}} />); });
    expect(texts(t)).toContain('جاهز');
    expect(texts(t).includes('+٥ د')).toBe(showEta);
    act(() => { t.update(<PagerOrderCard order={base} busy onAction={() => {}} />); });
    act(() => { t.update(<PagerOrderCard order={{ ...base, readyAt: new Date() }} busy={false} onAction={() => {}} />); });
    expect(texts(t)).toContain('استلمه');
    expect(texts(t)).toContain('رنّ ثاني');
    // بدون مرور بـ«مشغول» (البثّ وصل قبل ردّ الخادم)
    act(() => { t.update(<PagerOrderCard order={base} busy={false} onAction={() => {}} />); });
    act(() => { t.update(<PagerOrderCard order={{ ...base, readyAt: new Date() }} busy={false} onAction={() => {}} />); });
    expect(texts(t)).toContain('استلمه');
  });
});
