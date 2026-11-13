import { ClientIpThrottlerGuard } from './client-ip-throttler.guard';

/** Calls the protected tracker without constructing the guard's dependencies. */
const tracker = (req: Record<string, unknown>) =>
  (
    ClientIpThrottlerGuard.prototype as unknown as {
      getTracker(r: Record<string, unknown>): Promise<string>;
    }
  ).getTracker(req);

describe('ClientIpThrottlerGuard.getTracker', () => {
  afterEach(() => delete process.env.CLIENT_IP_HEADER);

  it('uses req.ip when no client IP header is configured', async () => {
    const req = { ip: '10.0.0.1', headers: { 'cf-connecting-ip': '203.0.113.9' } };
    expect(await tracker(req)).toBe('10.0.0.1');
  });

  it('uses the configured header (case-insensitive) when present', async () => {
    process.env.CLIENT_IP_HEADER = 'CF-Connecting-IP';
    const req = { ip: '172.18.0.1', headers: { 'cf-connecting-ip': ' 203.0.113.9 ' } };
    expect(await tracker(req)).toBe('203.0.113.9');
  });

  it('takes the first address of a list and falls back to req.ip without the header', async () => {
    process.env.CLIENT_IP_HEADER = 'x-real-ip';
    expect(
      await tracker({ ip: '1.1.1.1', headers: { 'x-real-ip': '198.51.100.7, 10.0.0.2' } }),
    ).toBe('198.51.100.7');
    expect(await tracker({ ip: '1.1.1.1', headers: {} })).toBe('1.1.1.1');
  });
});
