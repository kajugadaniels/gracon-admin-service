// Extracts the authenticated admin's data from the JWT payload.
// Usage: @CurrentAdmin() admin: AdminJwtPayload
// The JWT strategy attaches the decoded payload to req.user after
// validating the token — this decorator reads it cleanly.
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

export interface AdminJwtPayload {
  adminId: string;
  email: string;
  role: AdminRole;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminJwtPayload => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = ctx.switchToHttp().getRequest();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return request.user;
  },
);
