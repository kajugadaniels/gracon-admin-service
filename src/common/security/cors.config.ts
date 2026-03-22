// CORS configuration — only the admin frontend can call this service.
// Uses ADMIN_FRONTEND_URL from .env — never a wildcard.
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function buildCorsConfig(adminFrontendUrl: string): CorsOptions {
  return {
    origin: adminFrontendUrl,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Retry-After'],
    credentials: true,
    maxAge: 86_400,
  };
}
