// AdminUsersController — admin operations on user accounts.
// Base path: /api/v1/users
// All endpoints require AdminAuthGuard (applied globally).
// SUPER_ADMIN-only endpoints additionally require @RequireRole(SUPER_ADMIN).
import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AdminUsersService } from './admin-users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateIdVerificationDto } from './dto/update-id-verification.dto';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminRole } from '@prisma/client';
import type { AdminJwtPayload } from '../../common/decorators/current-admin.decorator';

@ApiTags('users')
@ApiBearerAuth('admin-jwt')
@Controller('users')
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  // ── GET /users ─────────────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all users',
    description: `
Returns a paginated list of all registered users on the platform.

**Filtering options:**
- \`search\` — matches against first name, last name, or email (case-insensitive)
- \`isActive\` — filter by account active status
- \`isVerified\` — filter by email verification status
- \`isIdVerified\` — filter by ID verification status
- \`createdFrom\` / \`createdTo\` — filter by registration date range

**Pagination:**
- Default: 20 users per page, page 1
- Maximum: 100 users per page
- Response includes total count, total pages, and hasNext/hasPrev flags

**NID and PID are never returned in the list view** — use GET /users/:id
for individual user detail with masked identity data.

**Performance note:** A warning is added to the response when total users
exceed 50,000 rows — at that scale, cursor-based pagination should be adopted.

**Example scenario:**
The admin searches for "Uwimana" to find all users with that surname.
She filters by \`isIdVerified=false\` to see which Uwimana accounts are
still pending verification. She gets a list of 3 matching users.
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated user list returned successfully.',
    schema: {
      example: {
        data: [
          {
            userId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            firstName: 'Diane',
            lastName: 'Uwimana',
            email: 'uwimana.diane@gmail.com',
            phoneNumber: '+250788901234',
            isActive: true,
            isVerified: true,
            isIdVerified: false,
            createdAt: '2024-10-01T09:15:00.000Z',
          },
          {
            userId: 'd4e5f6a7-b8c9-0123-defa-234567890123',
            firstName: 'Eric',
            lastName: 'Habimana',
            email: 'habimana.eric@gmail.com',
            phoneNumber: '+250789012345',
            isActive: true,
            isVerified: true,
            isIdVerified: true,
            createdAt: '2024-09-15T14:30:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 2847,
          totalPages: 143,
          hasNext: true,
          hasPrev: false,
        },
      },
    },
  })
  async listUsers(@Query() dto: QueryUsersDto) {
    return this.usersService.listUsers(dto);
  }

  // ── GET /users/:id ─────────────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get full user detail',
    description: `
Returns the complete profile of a single user including citizen identity,
verification history, active sessions, security events, and admin audit trail.

**NID and PID handling:**
- \`ADMIN\` role — sees masked values only (e.g. \`••••••••••••6790\`)
- \`SUPER_ADMIN\` role — still sees masked values here. Call
  \`GET /users/:id/decrypt-nid\` separately to get the full decrypted NID.
  Every decrypt call is logged to \`AdminAuditLog\`.

**What is returned:**
- Personal info: name, email, phone, profile image URL
- Citizen data: date of birth, sex, country of birth
- Account status: all boolean flags and timestamps
- Last 5 ID verification attempts with full score breakdown
- Active sessions (revoked and expired excluded)
- Last 10 security events for this user
- Last 5 admin actions taken on this user

**This endpoint is logged** — every admin who views a user's detail page
is recorded in \`AdminAuditLog\` with action \`USER_DETAIL_VIEWED\`.

**Example scenario:**
Ishimwe Patrick is investigating a suspicious account. He opens the detail
page for user Kalisa Jean-Pierre. The endpoint records that Ishimwe viewed
this profile, and returns Jean-Pierre's full profile including his 3 failed
verification attempts, the IPs they came from, and his 2 active sessions.
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the user.',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  })
  @ApiResponse({
    status: 200,
    description: 'Full user detail returned.',
    schema: {
      example: {
        userId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        firstName: 'Jean-Pierre',
        lastName: 'Kalisa',
        email: 'kalisa.jp@gmail.com',
        phoneNumber: '+250788345678',
        imageUrl: 'https://bucket.s3.amazonaws.com/profiles/c3d4e5f6.jpg',
        nid: '••••••••••••6790',
        pid: '••••••••••1',
        nidDecrypted: false,
        dateOfBirth: '1992-04-15T00:00:00.000Z',
        sex: 'M',
        countryOfBirth: 'Rwanda',
        isActive: true,
        isVerified: true,
        isIdVerified: false,
        idVerifiedAt: null,
        verificationAttempts: 3,
        createdAt: '2024-10-01T09:15:00.000Z',
        updatedAt: '2024-11-18T11:42:00.000Z',
        verifications: [
          {
            id: 'v1-uuid',
            attemptNumber: 3,
            documentMatch: true,
            faceScore: 62.4,
            livenessScore: 55.1,
            compositeScore: 62.8,
            passed: false,
            failReason: 'Composite score below threshold (62.8 < 80.0)',
            ipAddress: '197.243.11.45',
            createdAt: '2024-11-18T11:42:00.000Z',
          },
        ],
        sessions: [
          {
            id: 's1-uuid',
            tokenType: 'limited',
            ipAddress: '197.243.11.45',
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
            expiresAt: '2024-11-19T11:42:00.000Z',
            createdAt: '2024-11-18T11:42:00.000Z',
          },
        ],
        securityEvents: [
          {
            id: 'se1-uuid',
            eventType: 'VERIFICATION_FAILED',
            ipAddress: '197.243.11.45',
            metadata: {
              compositeScore: 62.8,
              failReason: 'below_threshold',
              attemptNumber: 3,
            },
            createdAt: '2024-11-18T11:42:00.000Z',
          },
        ],
        auditHistory: [
          {
            id: 'al1-uuid',
            action: 'USER_DETAIL_VIEWED',
            adminId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            adminName: 'Ishimwe Patrick',
            metadata: { adminRole: 'ADMIN' },
            ipAddress: '41.186.255.12',
            createdAt: '2024-11-19T08:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
    schema: {
      example: {
        statusCode: 404,
        error: 'Not Found',
        message:
          'User with ID "c3d4e5f6-a7b8-9012-cdef-123456789012" not found.',
      },
    },
  })
  async getUserDetail(
    @Param('id', ParseUUIDPipe) userId: string,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request,
  ) {
    return this.usersService.getUserDetail(
      userId,
      admin.adminId,
      admin.role,
      this.extractIp(req),
    );
  }

  // ── PATCH /users/:id/status ────────────────────────────────────────────────

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate or deactivate a user account',
    description: `
Sets a user's account active status.

**Deactivating a user:**
- Sets \`isActive = false\`
- Immediately revokes **all** active refresh tokens for that user
- The user is signed out of all devices instantly
- The user cannot log in while deactivated
- A reason is strongly recommended and recorded in \`AdminAuditLog\`

**Reactivating a user:**
- Sets \`isActive = true\`
- Does NOT restore sessions — user must log in again
- Any previous refresh tokens remain revoked

**Idempotency:** Calling with the same status the user already has returns
a 400 error — this prevents accidental double-deactivation log entries.

**Example scenario:**
Uwimana Diane's account shows 8 failed logins from IP 197.243.55.100 in
10 minutes. Ishimwe Patrick deactivates her account with reason "Brute
force attack detected from IP 197.243.55.100". All her sessions are
immediately terminated.
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the user to update.',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  })
  @ApiResponse({
    status: 200,
    description: 'User status updated. Sessions revoked if deactivated.',
    schema: {
      examples: {
        deactivated: {
          summary: 'Account deactivated',
          value: {
            success: true,
            message:
              'User account has been deactivated and all sessions revoked.',
          },
        },
        activated: {
          summary: 'Account reactivated',
          value: {
            success: true,
            message: 'User account has been activated.',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'User already has the requested status.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async updateUserStatus(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request,
  ) {
    return this.usersService.updateUserStatus(
      userId,
      dto,
      admin.adminId,
      this.extractIp(req),
    );
  }

  // ── POST /users/:id/revoke-sessions ───────────────────────────────────────

  @Post(':id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke all active sessions for a user',
    description: `
Forces a user out of all active devices by revoking all unexpired,
unrevoked refresh tokens. The user must log in again on every device.

**Difference from deactivation:**
This endpoint revokes sessions but keeps the account active — the user
can log in again immediately. Use this when you detect suspicious activity
but do not have enough confidence to deactivate the account.

**Use case:** A user reports their phone was stolen. The admin revokes all
sessions to prevent the thief from using the existing session. The user
then logs in fresh from a trusted device.

**Logged to \`AdminAuditLog\`** with \`action: SESSIONS_REVOKED\` and the
count of tokens that were revoked.

**Example scenario:**
Kalisa Jean-Pierre calls support saying his laptop was stolen. Ishimwe
Patrick calls this endpoint. All 3 of Jean-Pierre's active sessions are
immediately revoked. Jean-Pierre can log in fresh from his phone.
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the user whose sessions should be revoked.',
    example: 'd4e5f6a7-b8c9-0123-defa-234567890123',
  })
  @ApiResponse({
    status: 200,
    description: 'All active sessions revoked.',
    schema: {
      example: {
        success: true,
        message: '3 active session(s) revoked. User must log in again.',
        revokedCount: 3,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async revokeUserSessions(
    @Param('id', ParseUUIDPipe) userId: string,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request,
  ) {
    return this.usersService.revokeUserSessions(
      userId,
      admin.adminId,
      this.extractIp(req),
    );
  }

  // ── PATCH /users/:id/id-verification ──────────────────────────────────────

  @Patch(':id/id-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually set ID verification status',
    description: `
Overrides the AI verification result for a user — either granting or
revoking their ID-verified status.

**When to use:**
- Granting: A user was verified in-person at a physical office and the
  admin needs to mark them as verified manually
- Revoking: New information indicates the verification was fraudulent or
  the submitted documents were not the user's own

**Revoking requires a reason** — calling with \`isIdVerified: false\` and
no \`reason\` returns a 400 error. This is a compliance requirement.

**What changes on grant:**
- \`isIdVerified = true\`
- \`idVerifiedAt = now()\`

**What changes on revoke:**
- \`isIdVerified = false\`
- \`idVerifiedAt = null\`
- Does NOT revoke sessions — use /revoke-sessions separately if needed

**Every call is logged** with \`action: ID_STATUS_CHANGED\`, the reason,
and the admin who performed the action.

**Example scenario:**
Niyonkuru Jean visits the Kigali office with his original ID. After
physical document inspection, Ishimwe Patrick grants him verified status
with reason "In-person document verification at Kigali HQ, 2024-11-20".
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the user.',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  })
  @ApiResponse({
    status: 200,
    description: 'ID verification status updated.',
    schema: {
      examples: {
        granted: {
          summary: 'Verification granted',
          value: {
            success: true,
            message: 'User has been manually marked as ID-verified.',
          },
        },
        revoked: {
          summary: 'Verification revoked',
          value: {
            success: true,
            message: 'User ID verification has been revoked.',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Status already matches requested value, or reason missing for revocation.',
  })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async updateIdVerification(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateIdVerificationDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request,
  ) {
    return this.usersService.updateIdVerification(
      userId,
      dto,
      admin.adminId,
      this.extractIp(req),
    );
  }

  // ── GET /users/:id/decrypt-nid ─────────────────────────────────────────────

  @Get(':id/decrypt-nid')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  @RequireRole(AdminRole.SUPER_ADMIN)
  @Throttle({ strict: { limit: 10, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Decrypt and return the full NID — SUPER_ADMIN only',
    description: `
**SUPER_ADMIN only.** Returns the full decrypted National ID Number for
a user. Every single call to this endpoint is logged to \`AdminAuditLog\`
with action \`NID_DECRYPTED\`, the SUPER_ADMIN's identity, and the
timestamp — no exceptions.

**Rate limited:** 10 calls per hour per SUPER_ADMIN.

**Why this is a separate endpoint:**
The detail endpoint (\`GET /users/:id\`) always returns masked NID values
for all roles. Decryption is deliberately separated so that:
1. It can be individually rate-limited
2. Every access is logged and traceable
3. Regular ADMINs can view profiles without ever seeing raw NIDs
4. The attack surface for bulk data extraction is minimised

**The NID value is never logged** — only the fact that it was accessed,
by whom, when, and from which IP.

**Example scenario:**
A court order requires the SUPER_ADMIN to provide the full NID of user
Kalisa Jean-Pierre. She calls this endpoint, retrieves the NID, and the
access is permanently recorded: "NID of user c3d4e5f6 decrypted by
SUPER_ADMIN a1b2c3d4 from IP 41.186.255.12 at 2024-11-20T14:30:00Z".
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the user whose NID should be decrypted.',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  })
  @ApiResponse({
    status: 200,
    description: 'Decrypted NID returned. Access logged to AdminAuditLog.',
    schema: {
      example: {
        nid: '1 1993 8 0042537 0 04',
        userId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
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
  @ApiResponse({
    status: 404,
    description: 'No citizen identity found for this user.',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — maximum 10 NID decrypts per hour.',
  })
  async decryptNid(
    @Param('id', ParseUUIDPipe) userId: string,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request,
  ) {
    return this.usersService.decryptNid(
      userId,
      admin.adminId,
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
