import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limits per real client IP. Behind a reverse proxy or tunnel every request arrives from
 * the proxy, so without this all users would share one bucket.
 *
 * - `CLIENT_IP_HEADER` (e.g. `cf-connecting-ip`): taken from that header when present.
 * - Otherwise `req.ip`, which honours `TRUST_PROXY` (X-Forwarded-For).
 *
 * Only configure these when clients cannot reach the API directly, or the header can be spoofed.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const header = process.env.CLIENT_IP_HEADER?.toLowerCase();
    const headers = req.headers as Record<string, string | string[] | undefined> | undefined;
    const fromHeader = header ? headers?.[header] : undefined;
    const value = Array.isArray(fromHeader) ? fromHeader[0] : fromHeader;
    if (value?.trim()) return Promise.resolve(value.split(',')[0].trim());
    return Promise.resolve((req.ip as string | undefined) ?? 'unknown');
  }
}
