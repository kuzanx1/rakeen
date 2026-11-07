import { deviceClockIsBehind, explainNetworkError, WRONG_CLOCK_MESSAGE, APP_BUILT_AT } from '../src/domain/clockSanity';

describe('wrong device clock (SUNMI after power-off)', () => {
  it('a clock reset to an old year is caught', () => {
    expect(deviceClockIsBehind(Date.UTC(2020, 0, 1))).toBe(true);
    expect(explainNetworkError('Network request failed', 'x', Date.UTC(2020, 0, 1))).toBe(WRONG_CLOCK_MESSAGE);
  });
  it('a correct clock keeps the original message', () => {
    expect(deviceClockIsBehind(APP_BUILT_AT + 3600_000)).toBe(false);
    expect(explainNetworkError('Network request failed', 'x', APP_BUILT_AT + 3600_000)).toBe('Network request failed');
    expect(explainNetworkError(undefined, 'fallback', APP_BUILT_AT + 3600_000)).toBe('fallback');
  });
  it('a few hours of timezone skew is not flagged', () => {
    expect(deviceClockIsBehind(APP_BUILT_AT - 10 * 3600_000)).toBe(false);
  });
});
