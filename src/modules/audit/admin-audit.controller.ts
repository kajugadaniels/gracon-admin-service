import { Controller, Get, Query, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminAuditService } from './admin-audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';

@ApiTags('audit')
@ApiBearerAuth('admin-jwt')
@Controller('audit')
export class AdminAuditController {
  constructor(private readonly auditService: AdminAuditService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List admin audit log',
    description: `
Returns the complete, immutable audit trail of every action taken by
every admin on the platform, ordered by most recent first.

**This log is append-only** — entries are never modified or deleted.
It answers the question: "Who did what to whom and when?"

**Filtering options:**
- \`adminId\` — all actions taken by a specific admin
- \`targetUserId\` — all actions taken on a specific user
- \`action\` — filter by action type (e.g. USER_DEACTIVATED, NID_DECRYPTED)
- \`createdFrom\` / \`createdTo\` — date range

**Available action types:**
USER_DEACTIVATED, USER_REACTIVATED, SESSIONS_REVOKED, ID_STATUS_CHANGED,
NID_DECRYPTED, PID_DECRYPTED, USER_DETAIL_VIEWED, ADMIN_CREATED,
ADMIN_DEACTIVATED, ADMIN_REACTIVATED, ADMIN_INVITE_RESENT

**Example scenario:**
A compliance audit requires a report of all NID decryption events in
November 2024. The auditor filters by
\`action=NID_DECRYPTED&createdFrom=2024-11-01T00:00:00Z&createdTo=2024-11-30T23:59:59Z\`.
The log shows: SUPER_ADMIN Uwimana Diane decrypted 3 NIDs, with reasons,
timestamps, and originating IP addresses for each.
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated audit log returned.',
    schema: {
      example: {
        data: [
          {
            id: 'al1-uuid',
            adminId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            adminName: 'Ishimwe Patrick',
            adminEmail: 'ishimwe.patrick@idverify.rw',
            action: 'USER_DEACTIVATED',
            targetUserId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            targetEmail: 'kalisa.jp@gmail.com',
            metadata: {
              reason: 'Brute force attack detected from IP 197.243.55.100',
              newStatus: false,
              userEmail: 'kalisa.jp@gmail.com',
            },
            ipAddress: '41.186.255.12',
            createdAt: '2024-11-19T08:30:00.000Z',
          },
          {
            id: 'al2-uuid',
            adminId: 'f1e2d3c4-b5a6-7890-fedc-ba9876543210',
            adminName: 'Uwimana Diane',
            adminEmail: 'uwimana.diane@idverify.rw',
            action: 'NID_DECRYPTED',
            targetUserId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            targetEmail: 'kalisa.jp@gmail.com',
            metadata: { accessedAt: '2024-11-19T09:00:00.000Z' },
            ipAddress: '41.186.100.50',
            createdAt: '2024-11-19T09:00:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 50,
          total: 1847,
          totalPages: 37,
          hasNext: true,
          hasPrev: false,
        },
      },
    },
  })
  async listAuditLogs(@Query() dto: QueryAuditDto) {
    return this.auditService.listAuditLogs(dto);
  }
}
