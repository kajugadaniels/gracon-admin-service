// AdminAuthController — all authentication endpoints for the admin service.
// Base path: /api/v1/auth
//
// Public endpoints (no JWT required):
//   POST /auth/login            — authenticate and receive tokens
//   POST /auth/refresh          — rotate access + refresh tokens
//   GET  /auth/invite/validate  — check invite link before showing form
//   POST /auth/invite/set-password — activate account via invite link
//
// Protected endpoints (AdminAuthGuard required):
//   POST /auth/logout           — revoke refresh token
//   POST /auth/admins           — create new ADMIN (SUPER_ADMIN only)
//   POST /auth/admins/:id/resend-invite — resend invite (SUPER_ADMIN only)
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ValidateInviteDto } from './dto/validate-invite.dto';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminRole } from '@prisma/client';
import type { AdminJwtPayload } from '../../common/decorators/current-admin.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('auth')
@Controller('auth')
export class AdminAuthController {
  constructor(private readonly authService: AdminAuthService) {}

  // ── POST /auth/login ──────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Admin login',
    description: `
Authenticates an admin user and returns a short-lived access token (8 hours)
and a refresh token (24 hours).

**Three gates must pass in order:**
1. Email and password must match a record in the \`admins\` table
2. Account must be verified — the admin must have accepted their invite
   and set a password
3. Account must be active — not deactivated by a SUPER_ADMIN

**Rate limit:** 5 attempts per minute per IP address.

**Note:** Admin tokens are signed with \`ADMIN_JWT_SECRET\` — a completely
separate secret from the user JWT. User tokens are cryptographically
rejected on all admin endpoints.

**Example scenario:**
Ishimwe Patrick was added as an admin by the SUPER_ADMIN. He received his
invite email, set his password, and now logs in for the first time.
    `,
  })
  @ApiBody({ type: AdminLoginDto })
  @ApiResponse({
    status: 200,
    description:
      'Login successful. Returns access token, refresh token, and admin profile.',
    schema: {
      example: {
        success: true,
        message: 'Login successful.',
        data: {
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMWIyYzNkNC...',
          refreshToken:
            'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3a94a8fe5ccb19ba61c4c0873',
          admin: {
            adminId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            firstName: 'Ishimwe',
            lastName: 'Patrick',
            email: 'ishimwe.patrick@idverify.rw',
            phoneNumber: '+250788123456',
            role: 'ADMIN',
            createdAt: '2024-11-15T08:30:00.000Z',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid email or password.',
    schema: {
      example: {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password.',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description:
      'Account not yet verified (invite not accepted) or account deactivated.',
    schema: {
      example: {
        statusCode: 403,
        error: 'Forbidden',
        message:
          'Your admin account has not been activated. ' +
          'Please check your email for the invitation link.',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description:
      'Too many login attempts from this IP. Wait 1 minute before retrying.',
  })
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.authService.login(
      dto,
      this.extractIp(req),
      req.headers['user-agent'] ?? 'unknown',
    );
  }

  // ── POST /auth/refresh ────────────────────────────────────────────────────

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Refresh admin tokens',
    description: `
Issues a new access token (8h) and a new refresh token (24h) using a
valid, unexpired, and unrevoked refresh token.

**Token rotation:** Every call to this endpoint revokes the submitted
refresh token and issues a brand new pair. The old refresh token is
immediately invalid — it cannot be reused.

**Reuse detection:** If a previously revoked refresh token is submitted,
the service treats this as a potential token theft and immediately revokes
ALL active refresh tokens for that admin. The admin must log in again.

**When to call this:** The admin frontend should call this automatically
when it receives a 401 response on any protected endpoint, indicating
the access token has expired.

**Example scenario:**
Uwimana Diane has been working in the admin panel for 8 hours. Her access
token has expired. The frontend transparently calls this endpoint with
her refresh token and gets a new pair — she stays logged in without
interruption.
    `,
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'New token pair issued. Old refresh token is now invalid.',
    schema: {
      example: {
        accessToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMWIyYzNkNC...',
        refreshToken:
          'c2f7a1b3d4e5f6789012345678901234c2f7a1b3d4e5f678901234567890abcd',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      'Token invalid, expired, or previously revoked. ' +
      'If revoked — all sessions have been wiped.',
  })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refreshTokens(
      dto,
      this.extractIp(req),
      req.headers['user-agent'] ?? 'unknown',
    );
  }

  // ── POST /auth/logout ─────────────────────────────────────────────────────

  @Post('logout')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin-jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin logout',
    description: `
Revokes the provided refresh token, ending the admin's current session.

The access token (8h JWT) expires naturally — it cannot be individually
revoked. The frontend must discard it from memory on logout.

**Example scenario:**
Ishimwe Patrick finishes his admin session and clicks "Sign out". The
frontend calls this endpoint with his refresh token, then clears both
tokens from memory. If someone finds his access token in the next few
hours, it will still be technically valid until it expires — but his
refresh token is gone, so no new tokens can be issued.
    `,
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Refresh token revoked. Session ended.',
    schema: {
      example: {
        success: true,
        message: 'Logged out successfully.',
      },
    },
  })
  async logout(
    @Body() dto: RefreshTokenDto,
    @CurrentAdmin() admin: AdminJwtPayload,
  ) {
    return this.authService.logout(dto.refreshToken, admin.adminId);
  }

  // ── POST /auth/admins ─────────────────────────────────────────────────────

  @Post('admins')
  @UseGuards(AdminAuthGuard)
  @RequireRole(AdminRole.SUPER_ADMIN)
  @ApiBearerAuth('admin-jwt')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new ADMIN account',
    description: `
**SUPER_ADMIN only.** Creates a new \`ADMIN\` account and sends an invite
email to the provided address.

**What happens:**
1. A new Admin record is created with \`isVerified=false\` and no password
2. A 48-hour invite token is generated and stored (hashed) in the database
3. An invite email is sent to the provided email address with a
   \`/set-password\` link
4. The new admin clicks the link, sets their password, and their account
   is activated
5. The action is recorded in \`AdminAuditLog\`

**The SUPER_ADMIN never sets the new admin's password** — the admin
chooses their own via the invite link. This ensures the SUPER_ADMIN
never has access to the admin's credentials.

**Example scenario:**
The SUPER_ADMIN wants to add Niyonkuru Jean as a new admin. She fills in
his name, email, and phone number. Jean receives an invite email, clicks
the link, sets his password, and can now log in to the admin panel.
    `,
  })
  @ApiBody({ type: CreateAdminDto })
  @ApiResponse({
    status: 201,
    description:
      'Admin account created. Invite email sent to the provided address.',
    schema: {
      example: {
        success: true,
        message:
          'Admin account created. An invite email has been sent to niyonkuru.jean@idverify.rw.',
        data: {
          adminId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          firstName: 'Jean',
          lastName: 'Niyonkuru',
          email: 'niyonkuru.jean@idverify.rw',
          phoneNumber: '+250789456123',
          role: 'ADMIN',
          createdAt: '2024-11-20T10:15:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'An admin account with this email already exists.',
    schema: {
      example: {
        statusCode: 409,
        error: 'Conflict',
        message:
          'An admin account with email "niyonkuru.jean@idverify.rw" already exists.',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Caller is not a SUPER_ADMIN.',
    schema: {
      example: {
        statusCode: 403,
        error: 'Forbidden',
        message: 'This action requires SUPER_ADMIN privileges.',
      },
    },
  })
  async createAdmin(
    @Body() dto: CreateAdminDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request,
  ) {
    const createdByName =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      `${(req.user as any)?.firstName ?? ''} ${(req.user as any)?.lastName ?? ''}`.trim() ||
      admin.email;

    return this.authService.createAdmin(
      dto,
      admin.adminId,
      createdByName,
      this.extractIp(req),
    );
  }

  // ── GET /auth/invite/validate ─────────────────────────────────────────────

  @Get('invite/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate an admin invite token',
    description: `
Pre-flight check called by the admin frontend when the \`/set-password\`
page loads. Returns whether the invite link is still valid before showing
the password form.

**Why this exists:** Without this check, an admin could land on the
set-password page with an expired or already-used link and not know
until they submit the form. This endpoint gives the frontend the
information to show a clear message immediately on load.

**Responses:**
- \`valid: true\` — link is valid, admin name is returned for personalisation
- \`valid: false\` — includes a human-readable reason (expired, used, invalid)

**Example scenario:**
Niyonkuru Jean clicks his invite link 50 hours after it was sent. The
48-hour window has passed. The /set-password page calls this endpoint,
receives \`valid: false\` with the message "This invite link has expired",
and shows him a message to contact the SUPER_ADMIN for a new invite.
    `,
  })
  @ApiQuery({
    name: 'adminId',
    required: true,
    description: 'Admin UUID from the invite link.',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Raw invite token from the invite link.',
    example: 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
  })
  @ApiResponse({
    status: 200,
    description: 'Validation result. Check the `valid` field.',
    schema: {
      examples: {
        valid: {
          summary: 'Link is valid',
          value: {
            valid: true,
            message: 'Invite link is valid.',
            adminName: 'Jean Niyonkuru',
          },
        },
        expired: {
          summary: 'Link has expired',
          value: {
            valid: false,
            message:
              'This invite link has expired (48-hour limit). Ask a SUPER_ADMIN to resend your invite.',
          },
        },
        used: {
          summary: 'Link already used',
          value: {
            valid: false,
            message:
              'This invite link has already been used. Ask a SUPER_ADMIN to resend your invite.',
          },
        },
      },
    },
  })
  async validateInvite(@Query() dto: ValidateInviteDto) {
    return this.authService.validateInviteToken(dto.adminId, dto.token);
  }

  // ── POST /auth/invite/set-password ────────────────────────────────────────

  @Post('invite/set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set password and activate admin account',
    description: `
The final step of the admin invite flow. Called when the new admin
submits the set-password form after clicking their invite link.

**What happens atomically (single transaction):**
1. Invite token is validated (not expired, not used)
2. Password is bcrypt-hashed with 12 rounds
3. Admin record is updated: \`passwordHash\` set, \`isVerified = true\`
4. Invite token is marked \`used = true\` — cannot be replayed

After this call the admin can log in via \`POST /auth/login\`.

**Password requirements:**
- Minimum 8 characters
- At least one uppercase letter (A–Z)
- At least one lowercase letter (a–z)
- At least one digit (0–9)
- At least one special character (\`@$!%*?&^#\`)

**Example scenario:**
Niyonkuru Jean clicks his invite link and lands on /set-password. He
enters "Kigali2024!Secure". The page calls this endpoint — his password
is hashed and stored, his account is marked as verified, and the invite
token is burned. He is redirected to /login with a success message.
    `,
  })
  @ApiBody({ type: SetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password set. Account is now active. Admin can log in.',
    schema: {
      example: {
        success: true,
        message:
          'Password set successfully. Your admin account is now active. You can log in.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid, expired, or already-used invite token.',
    schema: {
      example: {
        statusCode: 400,
        error: 'Bad Request',
        message:
          'This invite link has expired (48-hour limit). ' +
          'Ask a SUPER_ADMIN to resend your invite.',
      },
    },
  })
  async setPassword(@Body() dto: SetPasswordDto, @Req() req: Request) {
    return this.authService.setPassword(dto, this.extractIp(req));
  }

  // ── POST /auth/admins/:id/resend-invite ───────────────────────────────────

  @Post('admins/:id/resend-invite')
  @UseGuards(AdminAuthGuard)
  @RequireRole(AdminRole.SUPER_ADMIN)
  @ApiBearerAuth('admin-jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend invite to an unverified admin',
    description: `
**SUPER_ADMIN only.** Resends the invite email to an admin who has not
yet accepted their invitation.

**What happens:**
1. Any existing unused invite tokens for this admin are invalidated
2. A new 48-hour invite token is generated and stored
3. A fresh invite email is sent to the admin's registered email
4. The action is logged in \`AdminAuditLog\`

**When to use:** The admin's original invite expired, they cannot find
the email, or they request a fresh link.

**Cannot resend to verified admins** — if an admin has already accepted
their invite and set a password, this endpoint returns a 400 error.

**Example scenario:**
Niyonkuru Jean's 48-hour invite expired before he could set his password.
The SUPER_ADMIN calls this endpoint with Jean's adminId. Jean receives a
new invite email with a fresh 48-hour link.
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the unverified admin to resend invite to.',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @ApiResponse({
    status: 200,
    description: 'Invite email resent successfully.',
    schema: {
      example: {
        success: true,
        message: 'Invite email resent to niyonkuru.jean@idverify.rw.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Admin is already verified — no resend needed.',
    schema: {
      example: {
        statusCode: 400,
        error: 'Bad Request',
        message:
          'This admin account is already verified. ' +
          'An invite cannot be resent to an active account.',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Admin with the given ID not found.',
  })
  async resendInvite(
    @Param('id') targetAdminId: string,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request,
  ) {
    const requestingName =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      `${(req.user as any)?.firstName ?? ''} ${(req.user as any)?.lastName ?? ''}`.trim() ||
      admin.email;

    return this.authService.resendInvite(
      targetAdminId,
      admin.adminId,
      requestingName,
      this.extractIp(req),
    );
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private extractIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown'
    );
  }
}
