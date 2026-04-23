import { Controller, Get, Post, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminStatsService } from './admin-stats.service';
import { RequireRole } from '../../common/decorators/require-role.decorator';
import { AdminRole } from '@prisma/client';

@ApiTags('stats')
@ApiBearerAuth('admin-jwt')
@Controller('stats')
export class AdminStatsController {
  constructor(private readonly statsService: AdminStatsService) {}

  // ── GET /stats/overview ────────────────────────────────────────────────────

  @Get('overview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get platform statistics overview',
    description: `
Returns a comprehensive snapshot of platform activity for the admin
dashboard. Results are cached for 5 minutes to avoid hammering the
database on every dashboard load.

**Cached data** — the \`cachedAt\` and \`cacheExpiresAt\` fields in the
response tell you exactly when the numbers were computed and when the
next recomputation will occur. If you need fresh numbers immediately,
call \`POST /stats/invalidate-cache\` (SUPER_ADMIN only).

**What is returned:**

*Snapshot numbers (live at cache time):*
- Total registered users on the platform
- Users who completed ID verification today
- Users pending ID verification (email verified but ID not done)

*Verification health:*
- Total attempts, passed, failed, and pass rate percentage

*Security indicators (last 24 hours):*
- Failed login count — high values indicate brute force
- Rate limit hit count — high values indicate automated abuse

*7-day chart data (daily buckets, oldest to newest):*
- New registrations per day
- Verification attempts per day
- Missing days filled with 0 — no gaps in chart data

*Geographic breakdown:*
- Top 5 countries of birth among all users with citizen identity records

*Foreign identity registry analysis:*
- Total FIN-backed records with active vs inactive split
- Foreign identities registered today
- 7-day FIN issuance trend
- Top countries of origin and most recent FIN registrations

**Example scenario:**
Ishimwe Patrick opens the admin dashboard. The stats load in under 200ms
because they are served from cache. He sees: 2,847 total users, 12
verified today, 340 pending verification, and a 78.4% pass rate. He also
notices 847 failed logins in the last 24 hours — nearly 10x the usual
baseline. He navigates to Security Events to investigate.
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Platform stats overview. May be up to 5 minutes stale.',
    schema: {
      example: {
        totalUsers: 2847,
        usersVerifiedToday: 12,
        usersPendingIdVerification: 340,
        totalVerifications: 4312,
        verificationsPassed: 3380,
        verificationsFailed: 932,
        verificationPassRate: 78.39,
        failedLoginsLast24h: 847,
        rateLimitHitsLast24h: 23,
        registrationsLast7Days: [
          { date: '2024-11-13', count: 34 },
          { date: '2024-11-14', count: 41 },
          { date: '2024-11-15', count: 28 },
          { date: '2024-11-16', count: 0 },
          { date: '2024-11-17', count: 0 },
          { date: '2024-11-18', count: 52 },
          { date: '2024-11-19', count: 18 },
        ],
        verificationsLast7Days: [
          { date: '2024-11-13', count: 29 },
          { date: '2024-11-14', count: 38 },
          { date: '2024-11-15', count: 22 },
          { date: '2024-11-16', count: 0 },
          { date: '2024-11-17', count: 0 },
          { date: '2024-11-18', count: 45 },
          { date: '2024-11-19', count: 14 },
        ],
        topCountriesOfBirth: [
          { country: 'Rwanda', count: 2541 },
          { country: 'Uganda', count: 89 },
          { country: 'Burundi', count: 74 },
          { country: 'DRC', count: 61 },
          { country: 'Kenya', count: 47 },
        ],
        foreignIdentityStats: {
          totalRegistered: 183,
          active: 176,
          inactive: 7,
          registeredToday: 4,
          activeRate: 96.17,
          maleCount: 101,
          femaleCount: 82,
          registrationsLast7Days: [
            { date: '2024-11-13', count: 2 },
            { date: '2024-11-14', count: 5 },
            { date: '2024-11-15', count: 1 },
            { date: '2024-11-16', count: 0 },
            { date: '2024-11-17', count: 3 },
            { date: '2024-11-18', count: 6 },
            { date: '2024-11-19', count: 4 },
          ],
          topCountriesOfOrigin: [
            { country: 'KE', count: 48 },
            { country: 'UG', count: 33 },
            { country: 'TZ', count: 21 },
            { country: 'CD', count: 19 },
            { country: 'BI', count: 16 },
          ],
          recentRegistrations: [
            {
              fin: '2199180000001234',
              firstName: 'Ishimwe',
              lastName: 'Patrick',
              countryOfOrigin: 'KE',
              isActive: true,
              issuanceVersion: 0,
              createdAt: '2024-11-19T09:42:00.000Z',
            },
          ],
        },
        cachedAt: '2024-11-19T10:00:00.000Z',
        cacheExpiresAt: '2024-11-19T10:05:00.000Z',
      },
    },
  })
  async getOverviewStats() {
    return this.statsService.getOverviewStats();
  }

  // ── POST /stats/invalidate-cache ───────────────────────────────────────────

  @Post('invalidate-cache')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  @RequireRole(AdminRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force-refresh the stats cache — SUPER_ADMIN only',
    description: `
**SUPER_ADMIN only.** Immediately invalidates the stats cache so that
the next call to \`GET /stats/overview\` recomputes from the database.

**When to use:** After a major administrative action — for example,
after deactivating a large batch of accounts, or after a verification
campaign — when you need the dashboard numbers to reflect the current
state immediately rather than waiting up to 5 minutes.

**Note:** This does not return the fresh stats itself — call
\`GET /stats/overview\` after this to get the recomputed numbers.

**Example scenario:**
Uwimana Diane has just manually verified 50 users in-person at the
Kigali office using the admin panel. She calls this endpoint to flush
the cache, then reloads the dashboard. The new stats immediately reflect
the 50 additional verified users.
    `,
  })
  @ApiResponse({
    status: 200,
    description:
      'Cache invalidated. Next GET /stats/overview recomputes from DB.',
    schema: {
      example: {
        success: true,
        message:
          'Stats cache invalidated. Fresh data will be computed on next request.',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Caller is not a SUPER_ADMIN.',
  })
  invalidateCache() {
    this.statsService.invalidateCache();
    return {
      success: true,
      message:
        'Stats cache invalidated. Fresh data will be computed on next request.',
    };
  }
}
