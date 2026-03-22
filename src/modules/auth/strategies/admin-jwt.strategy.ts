// Admin JWT strategy — registered with Passport as 'admin-jwt'.
// This strategy is SEPARATE from the user JWT strategy in api/auth/.
// It uses ADMIN_JWT_SECRET — a different secret entirely.
// A user token signed with JWT_SECRET will fail signature verification here.
// Additionally checks type: "admin" in the payload as defence in depth.
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AdminRole } from '@prisma/client';

export interface AdminJwtPayload {
  sub: string; // adminId
  email: string;
  role: AdminRole;
  type: string; // must be "admin" — rejects user tokens
  iat?: number;
  exp?: number;
}

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('ADMIN_JWT_SECRET');
    if (!secret) throw new Error('ADMIN_JWT_SECRET is not set');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Called after Passport verifies the JWT signature.
   * Re-fetches the admin from DB on every request to catch:
   * - Deactivated admin accounts
   * - Admins whose roles changed since token was issued
   * - Deleted admins
   *
   * Returns an object attached to req.user — read by @CurrentAdmin()
   * and AdminAuthGuard for role enforcement.
   */
  async validate(payload: AdminJwtPayload) {
    // Reject tokens that are not admin tokens — defence in depth
    if (payload.type !== 'admin') {
      throw new UnauthorizedException(
        'Invalid token type. Admin access required.',
      );
    }

    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isVerified: true,
        isActive: true,
      },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin account not found.');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException(
        'Your admin account has been deactivated. Contact a SUPER_ADMIN.',
      );
    }

    if (!admin.isVerified) {
      throw new UnauthorizedException(
        'Admin account not yet verified. Check your invite email.',
      );
    }

    // Returned object becomes req.user — available via @CurrentAdmin()
    return {
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
      type: 'admin',
    };
  }
}
