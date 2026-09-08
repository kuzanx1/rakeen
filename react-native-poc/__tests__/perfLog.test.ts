import {
  clearPerfLog,
  measure,
  readErrors,
  readPerf,
  recordDuration,
  recordError,
} from '../src/infrastructure/perfLog';

/**
 * أداةُ القياس تُختبر كما يُختبر ما تقيسه: سجلٌّ يكذب أسوأُ من لا سجلّ،
 * وسجلٌّ ينمو بلا حدٍّ عطلٌ في ذاته -- وهو يعمل ساعاتٍ متّصلة.
 */
describe('perfLog', () => {
  beforeEach(() => clearPerfLog());

  it('ignores anything faster than one dropped frame', () => {
    recordDuration('fast', 40);
    expect(readPerf()).toHaveLength(0);
  });

  it('records what actually took time', () => {
    recordDuration('payment', 900);
    const [entry] = readPerf();
    expect(entry.label).toBe('payment');
    expect(entry.ms).toBe(900);
  });

  it('newest first, so the last freeze is the first line read', () => {
    recordDuration('first', 200);
    recordDuration('second', 300);
    expect(readPerf().map(e => e.label)).toEqual(['second', 'first']);
  });

  it('never grows without bound over a long shift', () => {
    for (let i = 0; i < 500; i++) recordDuration('tick', 200);
    expect(readPerf().length).toBeLessThanOrEqual(60);
    for (let i = 0; i < 500; i++) recordError(new Error('x'), 'loop');
    expect(readErrors().length).toBeLessThanOrEqual(40);
  });

  it('measure returns the value and times it', async () => {
    const out = await measure('work', async () => {
      await new Promise<void>(r => setTimeout(() => r(), 150));
      return 42;
    });
    expect(out).toBe(42);
    expect(readPerf()[0].label).toBe('work');
  });

  it('measure records a throw and re-throws it rather than swallowing it', async () => {
    await expect(
      measure('boom', async () => {
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');
    expect(readErrors()[0].where).toBe('boom');
    expect(readErrors()[0].message).toContain('nope');
  });
});
