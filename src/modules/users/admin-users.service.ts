// AdminUsersService — all admin operations on user accounts.
// Read operations: list (paginated + filtered), detail (full profile).
// Write operations: deactivate/reactivate, revoke sessions, set ID status.
// Sensitive: NID/PID decrypt (SUPER_ADMIN only, every call logged).
// Every write operation is logged to AdminAuditLog — immutable trail.
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AdminRole, AdminAction } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { AuditService } from '../../common/audit/audit.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateIdVerificationDto } from './dto/update-id-verification.dto';
import {
  PaginatedUsers,
  AdminUserDetail,
  AdminUserListItem,
} from './interfaces/admin-user.interface';

// Threshold at which offset pagination noticeably slows down.
// When total rows exceed this, a warning is added to list responses.
const OFFSET_PERFORMANCE_THRESHOLD = 50_000;

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  // ─── List users ──────────────────────────────────────────────────────────

  /**
   * Returns a paginated, filtered list of users.
   * Joins CitizenIdentity for name data — decryption NOT performed here.
   * NID/PID are never exposed in list view, even to SUPER_ADMIN.
   * Individual user detail is the correct place for sensitive data.
   */
  async listUsers(dto: QueryUsersDto): Promise<PaginatedUsers> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    // Build dynamic WHERE clause from filters
    const where: any = {};

    if (dto.isActive !== undefined) where.isActive = dto.isActive;
    if (dto.isVerified !== undefined) where.isVerified = dto.isVerified;
    if (dto.isIdVerified !== undefined) where.isIdVerified = dto.isIdVerified;

    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {};
      if (dto.createdFrom) where.createdAt.gte = new Date(dto.createdFrom);
      if (dto.createdTo) where.createdAt.lte = new Date(dto.createdTo);
    }

    // Search joins CitizenIdentity for name — email searched on User directly
    if (dto.search) {
      const term = dto.search.trim();
      where.OR = [
        { email: { contains: term, mode: 'insensitive' } },
        {
          citizenIdentity: {
            OR: [
              { surName: { contains: term, mode: 'insensitive' } },
              { postNames: { contains: term, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    // Run count and data queries in parallel — never sequentially
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          phoneNumber: true,
          isActive: true,
          isVerified: true,
          isIdVerified: true,
          createdAt: true,
          citizenIdentity: {
            select: {
              surName: true,
              postNames: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const data: AdminUserListItem[] = users.map((u) => ({
      userId: u.id,
      firstName: u.citizenIdentity?.postNames ?? '',
      lastName: u.citizenIdentity?.surName ?? '',
      email: u.email,
      phoneNumber: u.phoneNumber ?? null,
      isActive: u.isActive,
      isVerified: u.isVerified,
      isIdVerified: u.isIdVerified,
      createdAt: u.createdAt,
    }));

    const result: PaginatedUsers = {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };

    // Warn when offset pagination will degrade — gives the team time
    // to migrate to cursor pagination before users notice slowness
    if (total > OFFSET_PERFORMANCE_THRESHOLD) {
      result.performanceWarning =
        `User count (${total.toLocaleString()}) exceeds ${OFFSET_PERFORMANCE_THRESHOLD.toLocaleString()}. ` +
        `Consider migrating to cursor-based pagination.`;
      this.logger.warn(result.performanceWarning);
    }

    return result;
  }

  // ─── User detail ──────────────────────────────────────────────────────────

  /**
   * Returns the full user profile for an admin.
   * NID and PID are masked by default.
   * SUPER_ADMIN can call the separate decrypt endpoint to get full values.
   *
   * Logs USER_DETAIL_VIEWED to AdminAuditLog — every admin view is traced.
   */
  async getUserDetail(
    userId: string,
    adminId: string,
    adminRole: AdminRole,
    ipAddress: string,
  ): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        imageUrl: true,
        isActive: true,
        isVerified: true,
        isIdVerified: true,
        idVerifiedAt: true,
        verificationAttempts: true,
        createdAt: true,
        updatedAt: true,
        citizenIdentity: {
          select: {
            nidEncrypted: true,
            surName: true,
            postNames: true,
            sex: true,
            dateOfBirth: true,
            countryOfBirth: true,
          },
        },
        platformId: {
          select: { pidEncrypted: true },
        },
        idVerifications: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            attemptNumber: true,
            documentMatch: true,
            faceScore: true,
            livenessScore: true,
            compositeScore: true,
            passed: true,
            failReason: true,
            ipAddress: true,
            createdAt: true,
          },
        },
        // Active sessions only — revoked and expired excluded.
        // Fetch 11 to detect truncation without a second query — if 11 come
        // back the user has more than 10 active sessions, which is suspicious
        // and surfaced as sessionsTruncated: true in the response.
        refreshTokens: {
          where: {
            revoked: false,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          take: 11,
          select: {
            id: true,
            tokenType: true,
            ipAddress: true,
            userAgent: true,
            expiresAt: true,
            createdAt: true,
          },
        },
        securityEvents: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            eventType: true,
            ipAddress: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found.`);
    }

    // Fetch last 5 admin actions on this user (separate query — different table)
    const auditHistory = await this.prisma.adminAuditLog.findMany({
      where: { targetUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        action: true,
        adminId: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
        admin: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    // Mask NID and PID — all roles see masked by default
    // SUPER_ADMIN uses the dedicated /decrypt-nid endpoint for full values
    const rawNid = user.citizenIdentity?.nidEncrypted
      ? this.encryption.decrypt(user.citizenIdentity.nidEncrypted)
      : null;
    const rawPid = user.platformId?.pidEncrypted
      ? this.encryption.decrypt(user.platformId.pidEncrypted)
      : null;

    const maskedNid = rawNid ? this.encryption.maskValue(rawNid, 4) : '—';
    const maskedPid = rawPid ? this.encryption.maskValue(rawPid, 4) : '—';

    // Log the view — every admin who views a full profile is recorded
    void this.audit.log({
      adminId,
      action: AdminAction.USER_DETAIL_VIEWED,
      targetUserId: userId,
      ipAddress,
      metadata: { adminRole },
    });

    return {
      userId: user.id,
      firstName: user.citizenIdentity?.postNames ?? '',
      lastName: user.citizenIdentity?.surName ?? '',
      email: user.email,
      phoneNumber: user.phoneNumber ?? null,
      imageUrl: user.imageUrl ?? null,

      nid: maskedNid,
      pid: maskedPid,
      nidDecrypted: false, // always false — detail endpoint never decrypts
      dateOfBirth: user.citizenIdentity?.dateOfBirth ?? null,
      sex: user.citizenIdentity?.sex ?? null,
      countryOfBirth: user.citizenIdentity?.countryOfBirth ?? null,

      isActive: user.isActive,
      isVerified: user.isVerified,
      isIdVerified: user.isIdVerified,
      idVerifiedAt: user.idVerifiedAt ?? null,
      verificationAttempts: user.verificationAttempts,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,

      verifications: user.idVerifications.map((v) => ({
        id: v.id,
        attemptNumber: v.attemptNumber,
        documentMatch: v.documentMatch,
        faceScore: v.faceScore,
        livenessScore: v.livenessScore,
        compositeScore: v.compositeScore,
        passed: v.passed,
        failReason: v.failReason ?? null,
        ipAddress: v.ipAddress ?? null,
        createdAt: v.createdAt,
      })),

      // sessionsTruncated: true means the user has >10 active sessions —
      // a normal user never has more than 1–3. Flag this for the admin UI.
      sessionsTruncated: user.refreshTokens.length > 10,
      sessions: user.refreshTokens.slice(0, 10).map((s) => ({
        id: s.id,
        tokenType: s.tokenType,
        ipAddress: s.ipAddress ?? null,
        userAgent: s.userAgent ?? null,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      })),

      securityEvents: user.securityEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        ipAddress: e.ipAddress ?? null,
        metadata: (e.metadata as Record<string, unknown>) ?? null,
        createdAt: e.createdAt,
      })),

      auditHistory: auditHistory.map((a) => ({
        id: a.id,
        action: a.action,
        adminId: a.adminId,
        adminName: `${a.admin.firstName} ${a.admin.lastName}`,
        metadata: (a.metadata as Record<string, unknown>) ?? null,
        ipAddress: a.ipAddress ?? null,
        createdAt: a.createdAt,
      })),
    };
  }

  // ─── Deactivate / reactivate ──────────────────────────────────────────────

  /**
   * Activates or deactivates a user account.
   * Deactivation immediately revokes ALL active refresh tokens —
   * the user is signed out of every device instantly.
   * Reactivation does not restore sessions — user must log in again.
   */
  async updateUserStatus(
    userId: string,
    dto: UpdateUserStatusDto,
    adminId: string,
    ipAddress: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, email: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found.`);
    }

    if (user.isActive === dto.isActive) {
      throw new BadRequestException(
        `User is already ${dto.isActive ? 'active' : 'deactivated'}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Update account status
      await tx.user.update({
        where: { id: userId },
        data: { isActive: dto.isActive },
      });

      // Deactivating — revoke all sessions immediately
      // The user cannot use any existing tokens
      if (!dto.isActive) {
        await tx.refreshToken.updateMany({
          where: { userId, revoked: false },
          data: { revoked: true },
        });
      }
    });

    const action = dto.isActive
      ? AdminAction.USER_REACTIVATED
      : AdminAction.USER_DEACTIVATED;

    void this.audit.log({
      adminId,
      action,
      targetUserId: userId,
      ipAddress,
      metadata: {
        reason: dto.reason ?? null,
        newStatus: dto.isActive,
        userEmail: user.email,
      },
    });

    const verb = dto.isActive ? 'activated' : 'deactivated';
    this.logger.log(
      `User ${userId} ${verb} by admin ${adminId}. ` +
        `Reason: ${dto.reason ?? 'none provided'}`,
    );

    return {
      success: true,
      message: dto.isActive
        ? 'User account has been activated.'
        : 'User account has been deactivated and all sessions revoked.',
    };
  }

  // ─── Revoke all sessions ──────────────────────────────────────────────────

  /**
   * Revokes all active refresh tokens for a user.
   * Forces the user to re-authenticate on all devices.
   * Use when suspicious activity is detected but account should remain active.
   */
  async revokeUserSessions(
    userId: string,
    adminId: string,
    ipAddress: string,
  ): Promise<{ success: boolean; message: string; revokedCount: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found.`);
    }

    const { count } = await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    void this.audit.log({
      adminId,
      action: AdminAction.SESSIONS_REVOKED,
      targetUserId: userId,
      ipAddress,
      metadata: {
        revokedCount: count,
        userEmail: user.email,
      },
    });

    this.logger.log(
      `${count} session(s) revoked for user ${userId} by admin ${adminId}`,
    );

    return {
      success: true,
      message: `${count} active session(s) revoked. User must log in again.`,
      revokedCount: count,
    };
  }

  // ─── Set ID verification status ───────────────────────────────────────────

  /**
   * Manually overrides the user's ID verification status.
   * This bypasses the AI verification system — use only when a user
   * has been verified through an alternative in-person process.
   * Every call is logged with the reason — mandatory for revocations.
   */
  async updateIdVerification(
    userId: string,
    dto: UpdateIdVerificationDto,
    adminId: string,
    ipAddress: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isIdVerified: true, email: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" not found.`);
    }

    if (user.isIdVerified === dto.isIdVerified) {
      throw new BadRequestException(
        `User ID verification is already set to ${dto.isIdVerified}.`,
      );
    }

    // Revoking verification without a reason is not acceptable
    if (!dto.isIdVerified && !dto.reason) {
      throw new BadRequestException(
        'A reason is required when revoking ID verification status.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isIdVerified: dto.isIdVerified,
        idVerifiedAt: dto.isIdVerified ? new Date() : null,
      },
    });

    void this.audit.log({
      adminId,
      action: AdminAction.ID_STATUS_CHANGED,
      targetUserId: userId,
      ipAddress,
      metadata: {
        newStatus: dto.isIdVerified,
        reason: dto.reason ?? null,
        userEmail: user.email,
        override: 'manual_admin_action',
      },
    });

    this.logger.log(
      `ID verification status set to ${dto.isIdVerified} for user ${userId} ` +
        `by admin ${adminId}. Reason: ${dto.reason ?? 'none'}`,
    );

    return {
      success: true,
      message: dto.isIdVerified
        ? 'User has been manually marked as ID-verified.'
        : 'User ID verification has been revoked.',
    };
  }

  // ─── Decrypt NID (SUPER_ADMIN only) ──────────────────────────────────────

  /**
   * Returns the full decrypted NID for a user.
   * SUPER_ADMIN access only — enforced at controller level by @RequireRole.
   * Every call is logged to AdminAuditLog — no exceptions.
   * Rate limited to 10 calls per hour per admin (enforced at controller).
   */
  async decryptNid(
    userId: string,
    adminId: string,
    ipAddress: string,
  ): Promise<{ nid: string; userId: string }> {
    const identity = await this.prisma.citizenIdentity.findUnique({
      where: { userId },
      select: { nidEncrypted: true },
    });

    if (!identity) {
      throw new NotFoundException(
        `No citizen identity found for user ID "${userId}".`,
      );
    }

    const nid = this.encryption.decrypt(identity.nidEncrypted);

    // Log immediately — before returning the value
    // If the log fails the decrypt is still returned — audit service never throws
    void this.audit.log({
      adminId,
      action: AdminAction.NID_DECRYPTED,
      targetUserId: userId,
      ipAddress,
      metadata: {
        // Never log the actual NID value — log only that it was accessed
        accessedAt: new Date().toISOString(),
      },
    });

    this.logger.warn(
      `NID decrypted for userId: ${userId} by SUPER_ADMIN: ${adminId} ` +
        `from IP: ${ipAddress}`,
    );

    return { nid, userId };
  }
}
