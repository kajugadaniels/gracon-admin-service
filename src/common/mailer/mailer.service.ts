// AppMailerService — sends admin-specific transactional emails.
// Currently handles the admin account invite email.
// Uses Handlebars templates for HTML emails.
import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

interface SendAdminInviteParams {
  to: string; // new admin's email
  firstName: string;
  lastName: string;
  email: string;
  createdByName: string; // SUPER_ADMIN's full name
  adminId: string;
  token: string; // raw invite token — included in the link
}

interface SendCertificateNoticeParams {
  to: string;
  userName: string;
  reason: string;
  actionAt: Date;
}

@Injectable()
export class AppMailerService {
  private readonly logger = new Logger(AppMailerService.name);
  private readonly frontendUrl: string;
  private readonly userFrontendUrl: string;

  // 48-hour expiry displayed in emails
  private readonly INVITE_EXPIRES_IN = '48 hours';

  constructor(
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {
    const frontendUrl = this.config.get<string>('ADMIN_FRONTEND_URL');
    if (!frontendUrl) {
      throw new Error('ADMIN_FRONTEND_URL environment variable is not set');
    }
    this.frontendUrl = frontendUrl;
    this.userFrontendUrl =
      this.config.get<string>('USER_FRONTEND_URL') ?? 'http://localhost:4000';
  }

  /**
   * Sends an invite email to a newly created admin.
   * The link directs the admin to /set-password where they set their
   * password and activate their account.
   *
   * Failure is logged but never thrown — a mail failure must not
   * prevent the admin record from being created.
   */
  async sendAdminInviteEmail(params: SendAdminInviteParams): Promise<void> {
    const { to, firstName, lastName, email, createdByName, adminId, token } =
      params;

    // Build the set-password link
    // Admin sees: /set-password?adminId=xxx&token=rawToken
    const setPasswordUrl =
      `${this.frontendUrl}/set-password` +
      `?adminId=${adminId}` +
      `&token=${encodeURIComponent(token)}`;

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.mailer.sendMail({
        to,
        subject: 'You have been invited to the ID Verification Admin Panel',
        template: 'admin-invite',
        context: {
          firstName,
          lastName,
          email,
          createdByName,
          setPasswordUrl,
          expiresIn: this.INVITE_EXPIRES_IN,
          currentYear: new Date().getFullYear(),
        },
      });
      this.logger.log(`Admin invite email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send admin invite email to ${to}`, error);
    }
  }

  async sendCertificateRevokedEmail(
    params: SendCertificateNoticeParams,
  ): Promise<void> {
    await this.sendCertificateNotice({
      ...params,
      subject: 'Your digital certificate was revoked',
      title: 'Certificate revoked',
      summary:
        'Your current digital certificate has been revoked by platform administrators. You cannot sign documents until a new certificate request is approved.',
      statusLabel: 'Revoked',
    });
  }

  async sendCertificateAccessBannedEmail(
    params: SendCertificateNoticeParams,
  ): Promise<void> {
    await this.sendCertificateNotice({
      ...params,
      subject: 'Your certificate access was restricted',
      title: 'Certificate access restricted',
      summary:
        'Platform administrators have restricted certificate access for your account. You cannot request certificates or sign documents until this restriction is lifted.',
      statusLabel: 'Restricted',
    });
  }

  async sendCertificateAccessRestoredEmail(
    params: SendCertificateNoticeParams,
  ): Promise<void> {
    await this.sendCertificateNotice({
      ...params,
      subject: 'Your certificate access was restored',
      title: 'Certificate access restored',
      summary:
        'Platform administrators have restored certificate access for your account. You still need an approved active certificate before signing documents.',
      statusLabel: 'Restored',
    });
  }

  private async sendCertificateNotice(
    params: SendCertificateNoticeParams & {
      subject: string;
      title: string;
      summary: string;
      statusLabel: string;
    },
  ): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.mailer.sendMail({
        to: params.to,
        subject: params.subject,
        template: 'certificate-notice',
        context: {
          userName: params.userName,
          title: params.title,
          summary: params.summary,
          statusLabel: params.statusLabel,
          reason: params.reason,
          actionAt: params.actionAt.toISOString(),
          signatureUrl: `${this.userFrontendUrl}/profile/signature`,
          currentYear: new Date().getFullYear(),
        },
      });
      this.logger.log(`Certificate notice email sent to ${params.to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send certificate notice email to ${params.to}`,
        error,
      );
    }
  }
}
