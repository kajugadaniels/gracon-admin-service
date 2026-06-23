// Declares which admin role a route requires.
// Used together with AdminGuard — guard reads this metadata
// to enforce role-based access control.
//
// Usage:
//   @RequireRole(AdminRole.SUPER_ADMIN)  — SUPER_ADMIN only
//   No decorator                         — any authenticated admin
import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '@gracon/database';

export const REQUIRE_ROLE_KEY = 'requireRole';

export const RequireRole = (role: AdminRole) =>
  SetMetadata(REQUIRE_ROLE_KEY, role);
