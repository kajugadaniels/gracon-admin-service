// AdminAuthService — handles all admin authentication flows:
//   - Login with email + password (checks 3 gates)
//   - JWT access + refresh token issuance
//   - Token rotation on refresh
//   - Logout (revoke refresh token)
//   - Create admin account (SUPER_ADMIN only)
//   - Validate invite token (pre-flight check before set-password form)
//   - Set password (activate admin account via invite link)
//   - Resend invite (SUPER_ADMIN only)
import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppMailerService } from '../../common/mailer/mailer.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AdminRole, AdminAction } from '@prisma/client';
import {
  AdminAuthTokens,
  AdminLoginResult,
  SafeAdminProfile,
} from './interfaces/admin-auth.interface';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  // bcrypt rounds — same as auth service
  private readonly BCRYPT_ROUNDS = 12;

  // Access token: 8 hours — shorter than typical because admin actions
  // are high-impact and session hygiene is critical
  private readonly ACCESS_TOKEN_EXPIRY: string;

  // Refresh token: 24 hours — admin panel is not used 24/7
  private readonly REFRESH_TOKEN_EXPIRY: string;
  // private readonly REFRESH_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
  private readonly REFRESH_TOKEN_EXPIRY_MS: number;

  // Invite token: 48 hours — gives admin time to check email
  private readonly INVITE_TOKEN_EXPIRY_MS = 48 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
    private readonly mailer: AppMailerService,
    private readonly config: ConfigService,
  ) {
    this.ACCESS_TOKEN_EXPIRY = config.get('ADMIN_JWT_ACCESS_EXPIRY', '8h');
    this.REFRESH_TOKEN_EXPIRY = config.get('ADMIN_JWT_REFRESH_EXPIRY', '24h');
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  /**
   * Authenticates an admin and issues access + refresh tokens.
   *
   * Three sequential gates:
   *   Gate 1 — credentials valid (email + password match)
   *   Gate 2 — account is verified (invite accepted, password set)
   *   Gate 3 — account is active (not deactivated by SUPER_ADMIN)
   *
   * All credential failures return the same message — prevents
   * enumeration of which gate failed.
   */
  async login(
    dto: AdminLoginDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<AdminLoginResult> {
    const admin = await this.prisma.admin.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        passwordHash: true,
        role: true,
        isVerified: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Constant-time dummy hash — prevents timing attacks that would
    // reveal whether an email is registered
    const DUMMY_HASH =
      '$2b$12$invalidhashfortimingprotectiononly000000000000000000000';

    const passwordValid = await bcrypt.compare(
      dto.password,
      admin?.passwordHash ?? DUMMY_HASH,
    );

    // Gate 1: credentials
    if (!admin || !passwordValid || !admin.passwordHash) {
      this.logger.warn(
        `Failed admin login attempt for email: ${dto.email} from IP: ${ipAddress}`,
      );
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Gate 2: account verified (invite accepted)
    if (!admin.isVerified) {
      throw new ForbiddenException(
        'Your admin account has not been activated. ' +
          'Please check your email for the invitation link.',
      );
    }

    // Gate 3: account active
    if (!admin.isActive) {
      throw new ForbiddenException(
        'Your admin account has been deactivated. ' +
          'Contact a SUPER_ADMIN for assistance.',
      );
    }

    const tokens = await this.issueTokens(
      admin.id,
      admin.email,
      admin.role,
      ipAddress,
      userAgent,
    );

    this.logger.log(
      `Admin login successful: ${admin.firstName} ${admin.lastName} ` +
        `(${admin.email}) role=${admin.role} from IP: ${ipAddress}`,
    );

    return {
      success: true,
      message: 'Login successful.',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        admin: this.buildSafeProfile(admin),
      },
    };
  }

  // ─── Token refresh ────────────────────────────────────────────────────────

  /**
   * Issues a new access + refresh token pair using a valid refresh token.
   * Implements rotation — old token is revoked, new pair issued.
   * Reuse of a revoked token triggers full session wipe (possible theft).
   */
  async refreshTokens(
    dto: RefreshTokenDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<AdminAuthTokens> {
    const tokenHash = this.encryption.hash(dto.refreshToken);
    const storedToken = await this.prisma.adminRefreshToken.findUnique({
      where: { tokenHash },
      include: {
        admin: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            isVerified: true,
          },
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (storedToken.revoked) {
      // Revoked token reuse — possible token theft, wipe all sessions
      await this.revokeAllAdminTokens(storedToken.adminId);
      this.logger.warn(
        `Revoked admin refresh token reuse detected — ` +
          `all sessions wiped for adminId: ${storedToken.adminId}`,
      );
      throw new UnauthorizedException(
        'Refresh token has been revoked. Please log in again.',
      );
    }

    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedException(
        'Refresh token has expired. Please log in again.',
      );
    }

    if (!storedToken.admin.isActive) {
      throw new UnauthorizedException('Admin account is not active.');
    }

    // Rotate: revoke old token, issue new pair
    await this.prisma.adminRefreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    const tokens = await this.issueTokens(
      storedToken.admin.id,
      storedToken.admin.email,
      storedToken.admin.role,
      ipAddress,
      userAgent,
    );

    this.logger.log(`Admin token rotated for adminId: ${storedToken.adminId}`);
    return tokens;
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  /**
   * Revokes the provided refresh token.
   * Access token expiry is handled by JWT TTL (8h).
   * Frontend must discard the access token from memory on logout.
   */
  async logout(
    refreshToken: string,
    adminId: string,
  ): Promise<{ success: boolean; message: string }> {
    const tokenHash = this.encryption.hash(refreshToken);

    await this.prisma.adminRefreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });

    this.logger.log(`Admin logout: ${adminId}`);
    return { success: true, message: 'Logged out successfully.' };
  }

  // ─── Create admin ─────────────────────────────────────────────────────────

  /**
   * Creates a new ADMIN account and sends an invite email.
   * Only callable by a SUPER_ADMIN (enforced by AdminAuthGuard + @RequireRole).
   *
   * Flow:
   *   1. Check email is not already registered
   *   2. Create Admin record (passwordHash=null, isVerified=false)
   *   3. Generate 48h invite token — store SHA-256 hash in DB
   *   4. Send invite email with set-password link
   *   5. Log the action to AdminAuditLog
   */
  async createAdmin(
    dto: CreateAdminDto,
    createdByAdminId: string,
    createdByName: string,
    ipAddress: string,
  ): Promise<{ success: boolean; message: string; data: SafeAdminProfile }> {
    // Fetch the SUPER_ADMIN's real name — never trust req.user for display names
    const creator = await this.prisma.admin.findUnique({
      where:  { id: createdByAdminId },
      select: { firstName: true, lastName: true, email: true },
    });

    const createdByName = creator
      ? `${creator.firstName} ${creator.lastName}`
      : creator?.email ?? 'SUPER_ADMIN'

    // Check email uniqueness
    const existing = await this.prisma.admin.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        `An admin account with email "${dto.email}" already exists.`,
      );
    }

    // Generate invite token — raw token goes in email, hash in DB
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.encryption.hash(rawToken);
    const expiresAt = new Date(Date.now() + this.INVITE_TOKEN_EXPIRY_MS);

    let newAdmin: SafeAdminProfile;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Create the admin account — no password yet
        const admin = await tx.admin.create({
          data: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
            phoneNumber: dto.phoneNumber ?? null,
            passwordHash: null, // set when invite is accepted
            role: AdminRole.ADMIN,
            isVerified: false, // activated when invite link is clicked
            isActive: true,
            createdById: createdByAdminId,
          },
        });

        // Store hashed invite token
        await tx.adminInviteToken.create({
          data: {
            adminId: admin.id,
            tokenHash,
            expiresAt,
            used: false,
          },
        });

        return admin;
      });

      newAdmin = this.buildSafeProfile(result);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: unknown }).code === 'P2002'
      ) {
        throw new ConflictException(
          'An admin account with this email already exists.',
        );
      }
      this.logger.error('Failed to create admin account', error);
      throw new InternalServerErrorException(
        'Failed to create admin account. Please try again.',
      );
    }

    // Send invite email — outside transaction, non-blocking
    await this.mailer.sendAdminInviteEmail({
      to: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      createdByName,
      adminId: newAdmin.adminId,
      token: rawToken,
    });

    // Audit log — every admin creation is recorded
    void this.audit.log({
      adminId: createdByAdminId,
      action: AdminAction.ADMIN_CREATED,
      metadata: {
        newAdminId: newAdmin.adminId,
        newAdminEmail: dto.email,
        newAdminName: `${dto.firstName} ${dto.lastName}`,
      },
      ipAddress,
    });

    this.logger.log(
      `Admin account created: ${dto.firstName} ${dto.lastName} ` +
        `(${dto.email}) by adminId: ${createdByAdminId}`,
    );

    return {
      success: true,
      message: `Admin account created. An invite email has been sent to ${dto.email}.`,
      data: newAdmin,
    };
  }

  // ─── Validate invite token ────────────────────────────────────────────────

  /**
   * Pre-flight check called by the admin frontend when the set-password
   * page loads. Returns validity status so the UI can show an appropriate
   * message before asking the admin to enter a password.
   *
   * This prevents showing the set-password form for expired or used links.
   */
  async validateInviteToken(
    adminId: string,
    token: string,
  ): Promise<{ valid: boolean; message: string; adminName?: string }> {
    const result = await this.findValidInviteToken(adminId, token);

    if (!result.valid) {
      return { valid: false, message: result.reason };
    }

    // Return the admin's name so the frontend can personalise the page
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { firstName: true, lastName: true },
    });

    return {
      valid: true,
      message: 'Invite link is valid.',
      adminName: admin ? `${admin.firstName} ${admin.lastName}` : undefined,
    };
  }

  // ─── Set password (accept invite) ────────────────────────────────────────

  /**
   * Activates an admin account by setting their password.
   * Called when the admin clicks their invite link and submits the form.
   *
   * Atomically:
   *   1. Validates the invite token
   *   2. Hashes the chosen password
   *   3. Sets passwordHash + isVerified=true
   *   4. Marks the invite token as used
   *
   * After this call the admin can log in for the first time.
   */
  async setPassword(
    dto: SetPasswordDto,
    ipAddress: string,
  ): Promise<{ success: boolean; message: string }> {
    const tokenLookup = await this.findValidInviteToken(dto.adminId, dto.token);

    if (!tokenLookup.valid || !tokenLookup.record) {
      throw new BadRequestException(tokenLookup.reason);
    }

    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      // Activate the account
      await tx.admin.update({
        where: { id: dto.adminId },
        data: {
          passwordHash,
          isVerified: true,
        },
      });

      // Mark invite token used — prevents replay
      await tx.adminInviteToken.update({
        where: { id: tokenLookup.record!.id },
        data: { used: true },
      });
    });

    this.logger.log(
      `Admin account activated via invite link: adminId=${dto.adminId} ` +
        `from IP: ${ipAddress}`,
    );

    return {
      success: true,
      message:
        'Password set successfully. Your admin account is now active. ' +
        'You can log in.',
    };
  }

  // ─── Resend invite ────────────────────────────────────────────────────────

  /**
   * Resends the invite email to an unverified admin.
   * Invalidates the previous invite token and issues a new 48h token.
   * Only callable by SUPER_ADMIN.
   */
  async resendInvite(
    targetAdminId:      string,
    requestingAdminId:  string,
    ipAddress:          string,
  ): Promise<{ success: boolean; message: string }> {

    const admin = await this.prisma.admin.findUnique({
      where:  { id: targetAdminId },
      select: {
        id: true, firstName: true, lastName: true,
        email: true, isVerified: true,
      },
    });

    if (!admin) throw new NotFoundException('Admin account not found.');
    if (admin.isVerified) {
      throw new BadRequestException(
        'This admin account is already verified. Cannot resend invite.',
      );
    }

    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.encryption.hash(rawToken);
    const expiresAt = new Date(Date.now() + this.INVITE_TOKEN_EXPIRY_MS);

    // Atomic — if create fails, old tokens stay valid (no data loss)
    await this.prisma.$transaction(async (tx) => {
      await tx.adminInviteToken.updateMany({
        where: { adminId: targetAdminId, used: false },
        data:  { used: true },
      });
      await tx.adminInviteToken.create({
        data: { adminId: targetAdminId, tokenHash, expiresAt, used: false },
      });
    });

    // Fetch requesting admin name for the email
    const requester = await this.prisma.admin.findUnique({
      where:  { id: requestingAdminId },
      select: { firstName: true, lastName: true },
    });
    const requestingName = requester
      ? `${requester.firstName} ${requester.lastName}`
      : 'SUPER_ADMIN';

    await this.mailer.sendAdminInviteEmail({
      to: admin.email, firstName: admin.firstName, lastName: admin.lastName,
      email: admin.email, createdByName: requestingName,
      adminId: admin.id, token: rawToken,
    });

    void this.audit.log({
      adminId:  requestingAdminId,
      action:   AdminAction.ADMIN_INVITE_RESENT,
      metadata: { targetAdminId, targetEmail: admin.email },
      ipAddress,
    });

    return { success: true, message: `Invite email resent to ${admin.email}.` };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Issues an access token + refresh token pair for an admin.
   * Access token is a signed JWT — stateless, 8h TTL.
   * Refresh token is a random hex string — hash stored in DB.
   */
  private async issueTokens(
    adminId: string,
    email: string,
    role: AdminRole,
    ipAddress: string,
    userAgent: string,
  ): Promise<AdminAuthTokens> {
    // JWT access token
    const accessToken = this.jwtService.sign(
      {
        sub: adminId,
        email,
        role,
        type: 'admin', // distinguishes from user tokens
      },
      {
        // Cast required: ACCESS_TOKEN_EXPIRY is string, but @nestjs/jwt expects
        // the ms StringValue branded type — safe at runtime
        expiresIn: this.ACCESS_TOKEN_EXPIRY as '8h',
        secret: this.config.get<string>('ADMIN_JWT_SECRET'),
      },
    );

    // Refresh token — cryptographically random, hash stored in DB
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = this.encryption.hash(rawRefreshToken);
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY_MS);

    await this.prisma.adminRefreshToken.create({
      data: {
        adminId,
        tokenHash: refreshTokenHash,
        expiresAt,
        ipAddress,
        userAgent: userAgent?.substring(0, 512),
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  // In constructor, after reading config:
  const refreshExpiry = this.config.get('ADMIN_JWT_REFRESH_EXPIRY', '24h');
  this.REFRESH_TOKEN_EXPIRY_MS = this.parseExpiryToMs(refreshExpiry);

  // Add this private helper at the bottom of the class:
  private parseExpiryToMs(expiry: string): number {
    const unit  = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1), 10);
    const map: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    if (!map[unit] || isNaN(value)) {
      throw new Error(`Invalid expiry format: "${expiry}". Use e.g. "24h", "7d".`);
    }
    return value * map[unit];
  }

  /**
   * Revokes all active refresh tokens for an admin.
   * Called on suspicious token reuse — possible theft scenario.
   */
  private async revokeAllAdminTokens(adminId: string): Promise<void> {
    await this.prisma.adminRefreshToken.updateMany({
      where: { adminId, revoked: false },
      data: { revoked: true },
    });
  }

  /**
   * Finds a valid (unused, unexpired) invite token for the given admin.
   * Returns the DB record so the caller can mark it used.
   */
  private async findValidInviteToken(
    adminId: string,
    rawToken: string,
  ): Promise<
    | { valid: true; record: { id: string }; reason: null }
    | { valid: false; record: null; reason: string }
  > {
    const tokenHash = this.encryption.hash(rawToken);

    const record = await this.prisma.adminInviteToken.findFirst({
      where: { adminId, tokenHash },
      select: { id: true, used: true, expiresAt: true },
    });

    if (!record) {
      return {
        valid: false,
        record: null,
        reason: 'Invalid or expired invite link. Please request a new one.',
      };
    }

    if (record.used) {
      return {
        valid: false,
        record: null,
        reason:
          'This invite link has already been used. ' +
          'Ask a SUPER_ADMIN to resend your invite.',
      };
    }

    if (new Date() > record.expiresAt) {
      return {
        valid: false,
        record: null,
        reason:
          'This invite link has expired (48-hour limit). ' +
          'Ask a SUPER_ADMIN to resend your invite.',
      };
    }

    return { valid: true, record: { id: record.id }, reason: null };
  }

  /**
   * Builds a safe admin profile — never includes passwordHash.
   */
  private buildSafeProfile(admin: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string | null;
    role: AdminRole;
    createdAt: Date;
  }): SafeAdminProfile {
    return {
      adminId: admin.id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      phoneNumber: admin.phoneNumber ?? null,
      role: admin.role,
      createdAt: admin.createdAt,
    };
  }
}
