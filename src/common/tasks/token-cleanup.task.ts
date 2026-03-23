// Scheduled cleanup — deletes expired and revoked admin refresh tokens.
// Without this the admin_refresh_tokens table grows indefinitely.
// Every admin login creates a row — without cleanup, queries slow down.
// Runs at 02:30 AM daily — low-traffic window.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../auth/src/common/prisma/prisma.service';

@Injectable()
export class TokenCleanupTask {
  private readonly logger = new Logger(TokenCleanupTask.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('30 2 * * *') // 02:30 AM daily
  async cleanupExpiredTokens() {
    const now = new Date();

    try {
      const { count } = await this.prisma.adminRefreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } }, // expired
            { revoked: true }, // manually revoked
          ],
        },
      });

      if (count > 0) {
        this.logger.log(
          `Token cleanup: deleted ${count} expired/revoked admin refresh tokens`,
        );
      }
    } catch (error) {
      // Log but never throw — cleanup failure must not crash the service
      this.logger.error('Token cleanup task failed', error);
    }
  }
}
