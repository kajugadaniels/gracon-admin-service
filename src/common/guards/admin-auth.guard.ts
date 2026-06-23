import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@gracon/database';
import { REQUIRE_ROLE_KEY } from '../decorators/require-role.decorator';
import { IS_PUBLIC_KEY } from '../decorators/skip-auth.decorator';

@Injectable()
export class AdminAuthGuard extends AuthGuard('admin-jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if the route is marked @SkipAuth() — if yes, skip JWT validation
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    // Proceed to JWT validation via passport-jwt
    return super.canActivate(context);
  }

  handleRequest(
    err: unknown,
    user: any,
    _info: unknown,
    context: ExecutionContext,
  ) {
    if (err || !user) {
      throw new UnauthorizedException(
        'Admin authentication required. Please log in to the admin panel.',
      );
    }

    // Defence in depth — reject user tokens even with same secret
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (user.type !== 'admin') {
      throw new UnauthorizedException('Invalid token type for admin access.');
    }

    // Role enforcement from @RequireRole() decorator
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const requiredRole = this.reflector.getAllAndOverride<AdminRole>(
      REQUIRE_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    if (!requiredRole) return user;

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
