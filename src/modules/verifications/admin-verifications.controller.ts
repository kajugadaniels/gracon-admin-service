import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminVerificationsService } from './admin-verifications.service';
import { QueryVerificationsDto } from './dto/query-verifications.dto';

@ApiTags('verifications')
@ApiBearerAuth('admin-jwt')
@Controller('verifications')
export class AdminVerificationsController {
  constructor(
    private readonly verificationsService: AdminVerificationsService,
  ) {}

  // ── GET /verifications ─────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all verification attempts',
    description: `
Returns a paginated list of every ID verification attempt across all
users on the platform, ordered by most recent first.

**Filtering options:**
- \`passed\` — true for successful verifications, false for failures
- \`userId\` — all attempts for a specific user
- \`ipAddress\` — attempts originating from a specific IP
- \`createdFrom\` / \`createdTo\` — date range filter
- \`scoreMin\` / \`scoreMax\` — composite score range (0–100)

**Score range use case:** An admin wants to investigate borderline failures
— attempts that nearly passed. She filters \`scoreMin=70&scoreMax=79.9\`
to find all attempts that scored between 70 and 80, just under the
passing threshold of 80.

**IP investigation use case:** Multiple failed verifications from IP
197.243.55.100 are suspected to be fraudulent. The admin filters by
\`ipAddress=197.243.55.100\` to see all attempts from that origin.

**Example scenario:**
Ishimwe Patrick notices a spike in failed verifications. He filters by
\`passed=false&createdFrom=2024-11-19T00:00:00Z\` to see all failures
in the last 24 hours. He finds 47 failures, most from the same IP range.
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated verification attempt list.',
    schema: {
      example: {
        data: [
          {
            id: 'v1a2b3c4-d5e6-f789-0123-456789abcdef',
            userId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            userEmail: 'kalisa.jp@gmail.com',
            userName: 'Jean-Pierre Kalisa',
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
          {
            id: 'v2b3c4d5-e6f7-8901-2345-67890abcdef1',
            userId: 'd4e5f6a7-b8c9-0123-defa-234567890123',
            userEmail: 'habimana.eric@gmail.com',
            userName: 'Eric Habimana',
            attemptNumber: 1,
            documentMatch: true,
            faceScore: 91.2,
            livenessScore: 87.5,
            compositeScore: 92.4,
            passed: true,
            failReason: null,
            ipAddress: '41.186.100.22',
            createdAt: '2024-11-17T14:20:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 4312,
          totalPages: 216,
          hasNext: true,
          hasPrev: false,
        },
      },
    },
  })
  async listVerifications(@Query() dto: QueryVerificationsDto) {
    return this.verificationsService.listVerifications(dto);
  }

  // ── GET /verifications/:id ─────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get full verification attempt detail with score breakdown',
    description: `
Returns a single verification attempt with a complete score breakdown
showing exactly how each component contributed to the final composite score.

**Score breakdown formula:**
\`\`\`
composite = (faceScore × 0.50) + (livenessScore × 0.30) + (20 × documentMatch)
pass      = composite >= 80.0
\`\`\`

This breakdown is critical for investigating borderline failures — it
shows exactly which component pulled the score below the threshold.

**User context** is included — the user's current active/verified status
and total attempt count at the time of the request. This helps identify
whether the user has since been verified through another attempt.

**Example scenario:**
Ishimwe Patrick is investigating a failed attempt for Jean-Pierre Kalisa.
The detail shows: face score 62.4 (weighted: 31.2), liveness 55.1
(weighted: 16.5), document matched (weighted: 20.0), composite 67.7.
The failure is primarily due to low liveness detection — the image was
likely too dark or low resolution. Patrick can advise the user to retry
in better lighting.
    `,
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the verification attempt.',
    example: 'v1a2b3c4-d5e6-f789-0123-456789abcdef',
  })
  @ApiResponse({
    status: 200,
    description: 'Full verification attempt with score breakdown.',
    schema: {
      example: {
        id: 'v1a2b3c4-d5e6-f789-0123-456789abcdef',
        userId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        userEmail: 'kalisa.jp@gmail.com',
        userName: 'Jean-Pierre Kalisa',
        attemptNumber: 3,
        documentMatch: true,
        faceScore: 62.4,
        livenessScore: 55.1,
        compositeScore: 67.7,
        passed: false,
        failReason: 'Composite score below threshold (67.7 < 80.0)',
        ipAddress: '197.243.11.45',
        createdAt: '2024-11-18T11:42:00.000Z',
        scoreBreakdown: {
          face: { score: 62.4, weight: 50, weighted: 31.2 },
          liveness: { score: 55.1, weight: 30, weighted: 16.53 },
          document: { matched: true, weight: 20, weighted: 20.0 },
          composite: 67.73,
          threshold: 80.0,
          passed: false,
        },
        userContext: {
          isActive: true,
          isIdVerified: false,
          totalAttempts: 3,
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Verification attempt not found.',
  })
  async getVerificationDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.verificationsService.getVerificationDetail(id);
  }
}
