// Marks a route as publicly accessible — bypasses AdminAuthGuard.
// Apply to login, validate-invite, and set-password endpoints only.
// Every other endpoint in the admin service requires authentication
// automatically because AdminAuthGuard is registered globally.
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const SkipAuth = () => SetMetadata(IS_PUBLIC_KEY, true);
