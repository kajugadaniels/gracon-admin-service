// AdminAuthGuard — validates JWT signature and token type.
// Rejects user tokens even if they somehow have the right signature
// by checking type: "admin" in the payload.
// Also enforces role requirements set by @RequireRole() decorator.
import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@prisma/client';
import { REQUIRE_ROLE_KEY } from '../decorators/require-role.decorator';

@Injectable()
export class AdminAuthGuard extends AuthGuard('admin-jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(
    err: unknown,
    user: any,
    _info: unknown,
    context: ExecutionContext,
  ) {
    // JWT validation failed — missing, expired, or wrong secret
    if (err || !user) {
      throw new UnauthorizedException(
        'Admin authentication required. Please log in to the admin panel.',
      );
    }

    // Extra defence — reject any token where type !== "admin"
    // Prevents user tokens from ever reaching admin endpoints
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (user.type !== 'admin') {
      throw new UnauthorizedException('Invalid token type for admin access.');
    }

    // Check role requirement from @RequireRole() decorator
    const requiredRole = this.reflector.getAllAndOverride<AdminRole>(
      REQUIRE_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No role decorator — any authenticated admin can proceed
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    if (!requiredRole) return user;

    // Role decorator present — enforce it
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (user.role !== requiredRole) {
      throw new ForbiddenException(
        `This action requires ${requiredRole} privileges.`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user;
  }
}
