// CORS configuration — only the admin frontend (and any extras explicitly
// listed in FRONTEND_URLS) can call this admin service. Wildcards are never
// used: the strict allowlist is composed at boot from environment values.
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Expands one or more environment strings into a strict frontend origin allowlist.
 * Values may be a single origin or a comma-separated list.
 */
function parseAllowedOrigins(...values: Array<string | undefined>): string[] {
  return values
    .flatMap((value) => (value ?? '').split(','))
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Builds the CORS options for the admin service.
 *
 * @param adminFrontendUrl - Primary admin frontend origin (ADMIN_FRONTEND_URL).
 * @param frontendUrls - Optional comma-separated extra origins (FRONTEND_URLS).
 * @returns Nest-compatible CorsOptions backed by a strict origin function.
 */
export function buildCorsConfig(
  adminFrontendUrl: string,
  frontendUrls?: string,
): CorsOptions {
  const allowedOrigins = parseAllowedOrigins(adminFrontendUrl, frontendUrls);

  return {
    origin(origin, callback) {
      // Same-origin or non-browser callers (no Origin header) are always allowed.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new Error(
          `Origin ${origin} is not allowed by admin service CORS policy.`,
        ),
        false,
      );
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Retry-After'],
    credentials: true,
    maxAge: 86_400,
  };
}
