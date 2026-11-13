import type { ServeStaticModuleOptions } from '@nestjs/serve-static';
import type { AppConfig } from '../config/app-config.service';

/**
 * Serves the built web app (WEB_DIST_DIR) with an SPA fallback, so a single origin and port
 * carries the web app, `/api` and `/socket.io`. Returns no roots when unset (development).
 *
 * - `/api/*` is excluded: unknown API routes must stay JSON 404s, not `index.html`.
 * - `/socket.io` needs no exclusion: Socket.IO handles it on the HTTP server before Express.
 * - Hashed `/assets/*` are cached for a year; everything else, including the `index.html`
 *   fallback, is revalidated on every load so a new deploy is picked up immediately.
 */
export function webStaticOptions(config: AppConfig): ServeStaticModuleOptions[] {
  const rootPath = config.get('WEB_DIST_DIR');
  if (!rootPath) return [];
  return [
    {
      rootPath,
      exclude: ['/api/{*path}'],
      serveStaticOptions: {
        index: false,
        setHeaders: (res: { setHeader(name: string, value: string): void }, path: string) => {
          res.setHeader(
            'Cache-Control',
            /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
          );
        },
      },
    },
  ];
}
