import { Controller, Get, Query, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminSecurityEventsService } from './admin-security-events.service';
import { QuerySecurityEventsDto } from './dto/query-security-events.dto';

@ApiTags('security-events')
@ApiBearerAuth('admin-jwt')
@Controller('security-events')
export class AdminSecurityEventsController {
  constructor(
    private readonly securityEventsService: AdminSecurityEventsService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List security events',
    description: `
Returns the paginated security event log written by the auth service.
This is the admin's real-time threat visibility feed — every security-relevant
action taken by users is recorded here by \`api/auth/\` and readable here.

**Event types and what they mean:**
| Event | Meaning |
|---|---|
| LOGIN_FAILED | Wrong password or email — watch for clusters from same IP |
| LOGIN_SUCCESS | Successful login — useful for session auditing |
| VERIFICATION_FAILED | ID verification failed — includes composite score |
| VERIFICATION_PASSED | ID verification passed |
| PASSWORD_RESET_REQUESTED | User initiated password reset |
| PASSWORD_CHANGED | Password successfully changed |
| SESSIONS_REVOKED_BY_USER | User signed out of all devices |
| REVOKED_TOKEN_REUSE | Revoked refresh token was submitted — possible theft |
| RATE_LIMIT_EXCEEDED | IP hit rate limiter — watch for sustained hits |

**Threat investigation workflow:**
1. Filter \`eventType=LOGIN_FAILED\` — find IPs with high failure counts
2. Filter by that \`ipAddress\` — see all events from that origin
3. Cross-reference with the verifications log for the same IP
4. If a pattern is confirmed, deactivate affected users and log the incident

**REVOKED_TOKEN_REUSE is high-priority** — this event fires when a
previously revoked refresh token is submitted. The auth service immediately
wipes all sessions for that user. This is the clearest indicator of a
stolen token being used after the legitimate user has already rotated.

**Example scenario:**
Ishimwe Patrick gets an alert that 120 LOGIN_FAILED events occurred in
5 minutes. He filters \`eventType=LOGIN_FAILED&createdFrom=2024-11-19T10:00Z\`.
All 120 failures come from IP 197.243.55.100. He filters all events from
that IP, confirms it is a brute force attempt, and deactivates the
targeted accounts while blocking the IP at the network level.
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated security event log.',
    schema: {
      example: {
        data: [
          {
            id: 'se1-uuid',
            userId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            userEmail: 'kalisa.jp@gmail.com',
            eventType: 'REVOKED_TOKEN_REUSE',
            ipAddress: '197.243.55.100',
            metadata: { tokenHash: 'redacted' },
            createdAt: '2024-11-19T10:05:00.000Z',
          },
          {
            id: 'se2-uuid',
            userId: null,
            userEmail: null,
            eventType: 'LOGIN_FAILED',
            ipAddress: '197.243.55.100',
            metadata: {
              email: 'unknown@test.com',
              reason: 'invalid_credentials',
            },
            createdAt: '2024-11-19T10:04:55.000Z',
          },
          {
            id: 'se3-uuid',
            userId: null,
            userEmail: null,
            eventType: 'RATE_LIMIT_EXCEEDED',
            ipAddress: '197.243.55.100',
            metadata: { path: '/api/v1/auth/login', method: 'POST' },
            createdAt: '2024-11-19T10:04:50.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 50,
          total: 9831,
          totalPages: 197,
          hasNext: true,
          hasPrev: false,
        },
      },
    },
  })
  async listSecurityEvents(@Query() dto: QuerySecurityEventsDto) {
    return this.securityEventsService.listSecurityEvents(dto);
  }
}
