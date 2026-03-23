// AdminStatsService — platform overview statistics for the admin dashboard.
// All queries run in parallel using Promise.all() — never sequentially.
// Results are cached in memory for 5 minutes — stat freshness vs DB load tradeoff.
// Cache is invalidated on expiry only — no manual invalidation needed for dashboard stats.
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, SecurityEvent } from '@prisma/client';

export interface PlatformStats {
  // Snapshot numbers
  totalUsers: number;
  usersVerifiedToday: number;
  usersPendingIdVerification: number;

  // Verification stats
  totalVerifications: number;
  verificationsPassed: number;
  verificationsFailed: number;
  verificationPassRate: number; // percentage, 2 decimal places

  // Security stats (last 24 hours)
  failedLoginsLast24h: number;
  rateLimitHitsLast24h: number;

  // 7-day chart data — ordered oldest to newest
  registrationsLast7Days: DailyCount[];
  verificationsLast7Days: DailyCount[];

  // Geographic breakdown
  topCountriesOfBirth: CountryCount[];

  // Cache metadata
  cachedAt: Date;
  cacheExpiresAt: Date;
}

export interface DailyCount {
  date: string; // ISO date string — "2024-11-19"
  count: number;
}

export interface CountryCount {
  country: string;
  count: number;
}

interface CacheEntry {
  data: PlatformStats;
  expiresAt: Date;
}

@Injectable()
export class AdminStatsService {
  private readonly logger = new Logger(AdminStatsService.name);

  // 5-minute in-memory cache — no Redis dependency
  private readonly CACHE_TTL_MS = 5 * 60 * 1_000;
  private cache: CacheEntry | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ─── Get overview stats ───────────────────────────────────────────────────

  /**
   * Returns the platform stats overview.
   * Served from cache if available and unexpired.
   * Recomputed from the database on cache miss or expiry.
   *
   * All 9 database queries run in parallel — total latency equals
   * the slowest single query, not the sum of all queries.
   */
  async getOverviewStats(): Promise<PlatformStats> {
    // Serve from cache if valid
    if (this.cache && new Date() < this.cache.expiresAt) {
      this.logger.debug('Stats served from cache');
      return this.cache.data;
    }

    this.logger.log('Recomputing platform stats from database');

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);

    // All 9 queries run simultaneously — critical for dashboard load time
    const [
      totalUsers,
      usersVerifiedToday,
      usersPendingIdVerification,
      totalVerifications,
      verificationsPassed,
      verificationsFailed,
      failedLoginsLast24h,
      rateLimitHitsLast24h,
      topCountries,
    ] = await Promise.all([
      // 1. Total users
      this.prisma.user.count(),

      // 2. Users who completed ID verification today
      this.prisma.user.count({
        where: {
          isIdVerified: true,
          idVerifiedAt: { gte: todayStart },
        },
      }),

      // 3. Users with email verified but ID not yet verified
      this.prisma.user.count({
        where: {
          isVerified: true,
          isIdVerified: false,
        },
      }),

      // 4. Total verification attempts
      this.prisma.idVerification.count(),

      // 5. Passed attempts
      this.prisma.idVerification.count({ where: { passed: true } }),

      // 6. Failed attempts
      this.prisma.idVerification.count({ where: { passed: false } }),

      // 7. Failed logins in last 24 hours
      this.prisma.securityEventLog.count({
        where: {
          eventType: SecurityEvent.LOGIN_FAILED,
          createdAt: { gte: last24h },
        },
      }),

      // 8. Rate limit hits in last 24 hours
      this.prisma.securityEventLog.count({
        where: {
          eventType: SecurityEvent.RATE_LIMIT_EXCEEDED,
          createdAt: { gte: last24h },
        },
      }),

      // 9. Top 5 countries of birth — raw query for GROUP BY
      this.prisma.$queryRaw<{ country: string; count: bigint }[]>`
        SELECT "countryOfBirth" AS country, COUNT(*) AS count
        FROM citizen_identities
        WHERE "countryOfBirth" IS NOT NULL
        GROUP BY "countryOfBirth"
        ORDER BY count DESC
        LIMIT 5
      `,
    ]);

    // Daily chart data — two more parallel queries.
    // Prisma.sql is used explicitly rather than the $queryRaw tagged-template
    // shorthand to guarantee that Date values are passed as query parameters,
    // not interpolated as strings. The tagged-template form delegates Date
    // serialisation to Prisma internals whose behaviour has varied across
    // minor versions — Prisma.sql makes parameterisation unconditional.
    const [registrationRows, verificationRows] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.prisma.$queryRaw<{ date: string; count: bigint }[]>(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        Prisma.sql`
          SELECT
            DATE("createdAt") AS date,
            COUNT(*) AS count
          FROM users
          WHERE "createdAt" >= ${last7Days}
          GROUP BY DATE("createdAt")
          ORDER BY date ASC
        `,
      ),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.prisma.$queryRaw<{ date: string; count: bigint }[]>(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        Prisma.sql`
          SELECT
            DATE("createdAt") AS date,
            COUNT(*) AS count
          FROM id_verifications
          WHERE "createdAt" >= ${last7Days}
          GROUP BY DATE("createdAt")
          ORDER BY date ASC
        `,
      ),
    ]);

    // Generate all 7 date labels — fill missing days with 0
    // Without this, days with no activity are absent from the chart
    const dateLabels = this.generateDateLabels(last7Days, now);

    const registrationMap = new Map(
      registrationRows.map((r) => [r.date, Number(r.count)]),
    );
    const verificationMap = new Map(
      verificationRows.map((r) => [r.date, Number(r.count)]),
    );

    const registrationsLast7Days: DailyCount[] = dateLabels.map((date) => ({
      date,
      count: registrationMap.get(date) ?? 0,
    }));

    const verificationsLast7Days: DailyCount[] = dateLabels.map((date) => ({
      date,
      count: verificationMap.get(date) ?? 0,
    }));

    const passRate =
      totalVerifications > 0
        ? parseFloat(
            ((verificationsPassed / totalVerifications) * 100).toFixed(2),
          )
        : 0;

    const expiresAt = new Date(now.getTime() + this.CACHE_TTL_MS);

    const stats: PlatformStats = {
      totalUsers,
      usersVerifiedToday,
      usersPendingIdVerification,
      totalVerifications,
      verificationsPassed,
      verificationsFailed,
      verificationPassRate: passRate,
      failedLoginsLast24h,
      rateLimitHitsLast24h,
      registrationsLast7Days,
      verificationsLast7Days,
      topCountriesOfBirth: topCountries.map((c) => ({
        country: c.country,
        count: Number(c.count),
      })),
      cachedAt: now,
      cacheExpiresAt: expiresAt,
    };

    // Store in cache
    this.cache = { data: stats, expiresAt };
    this.logger.log('Platform stats recomputed and cached for 5 minutes');

    return stats;
  }

  // ─── Cache control ────────────────────────────────────────────────────────

  /**
   * Force-invalidates the stats cache.
   * Called by SUPER_ADMIN when they need fresh numbers immediately.
   * Next call to getOverviewStats() will recompute from the database.
   */
  invalidateCache(): void {
    this.cache = null;
    this.logger.log('Stats cache manually invalidated');
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Generates an array of ISO date strings for the past N days.
   * Ensures chart data has an entry for every day, even days with no activity.
   */
  private generateDateLabels(from: Date, to: Date): string[] {
    const dates: string[] = [];
    const current = new Date(from);
    current.setHours(0, 0, 0, 0);

    while (current <= to) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }
}
