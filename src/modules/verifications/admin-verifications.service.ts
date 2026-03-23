// AdminVerificationsService — read-only access to ID verification attempts.
// Provides the paginated list and individual attempt detail.
// No writes — verifications are immutable audit records.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueryVerificationsDto } from './dto/query-verifications.dto';

export interface VerificationListItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  attemptNumber: number;
  documentMatch: boolean;
  faceScore: number;
  livenessScore: number;
  compositeScore: number;
  passed: boolean;
  failReason: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

export interface VerificationDetail extends VerificationListItem {
  // Score breakdown with thresholds for context
  scoreBreakdown: {
    face: {
      score: number;
      weight: number; // 50%
      weighted: number; // score × 0.50
    };
    liveness: {
      score: number;
      weight: number; // 30%
      weighted: number; // score × 0.30
    };
    document: {
      matched: boolean;
      weight: number; // 20%
      weighted: number; // 20 if matched, 0 if not
    };
    composite: number;
    threshold: number; // 80.0 — passes if composite >= threshold
    passed: boolean;
  };
  // User context at the time of the attempt
  userContext: {
    isActive: boolean;
    isIdVerified: boolean;
    totalAttempts: number;
  };
}

export interface PaginatedVerifications {
  data: VerificationListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

@Injectable()
export class AdminVerificationsService {
  private readonly logger = new Logger(AdminVerificationsService.name);

  // Must match the threshold in engine/ — keeping them in sync is critical.
  // If the engine threshold changes, update this constant.
  private readonly COMPOSITE_PASS_THRESHOLD = 80.0;

  constructor(private readonly prisma: PrismaService) {}

  // ─── List verifications ───────────────────────────────────────────────────

  /**
   * Returns a paginated list of all verification attempts across all users.
   * Joins User and CitizenIdentity for context — no decryption performed.
   * Supports filtering by pass/fail, user, IP, date range, and score range.
   */
  async listVerifications(
    dto: QueryVerificationsDto,
  ): Promise<PaginatedVerifications> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (dto.passed !== undefined) where.passed = dto.passed;
    if (dto.userId) where.userId = dto.userId;
    if (dto.ipAddress) where.ipAddress = { contains: dto.ipAddress };

    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {};
      if (dto.createdFrom) where.createdAt.gte = new Date(dto.createdFrom);
      if (dto.createdTo) where.createdAt.lte = new Date(dto.createdTo);
    }

    if (dto.scoreMin !== undefined || dto.scoreMax !== undefined) {
      where.compositeScore = {};
      if (dto.scoreMin !== undefined) where.compositeScore.gte = dto.scoreMin;
      if (dto.scoreMax !== undefined) where.compositeScore.lte = dto.scoreMax;
    }

    const [total, attempts] = await Promise.all([
      this.prisma.idVerification.count({ where }),
      this.prisma.idVerification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          attemptNumber: true,
          documentMatch: true,
          faceScore: true,
          livenessScore: true,
          compositeScore: true,
          passed: true,
          failReason: true,
          ipAddress: true,
          createdAt: true,
          user: {
            select: {
              email: true,
              citizenIdentity: {
                select: {
                  surName: true,
                  postNames: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const data: VerificationListItem[] = attempts.map((a) => ({
      id: a.id,
      userId: a.userId,
      userEmail: a.user.email,
      userName:
        [a.user.citizenIdentity?.postNames, a.user.citizenIdentity?.surName]
          .filter(Boolean)
          .join(' ') || a.user.email,
      attemptNumber: a.attemptNumber,
      documentMatch: a.documentMatch,
      faceScore: a.faceScore,
      livenessScore: a.livenessScore,
      compositeScore: a.compositeScore,
      passed: a.passed,
      failReason: a.failReason ?? null,
      ipAddress: a.ipAddress ?? null,
      createdAt: a.createdAt,
    }));

    return {
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
  }

  // ─── Verification detail ──────────────────────────────────────────────────

  /**
   * Returns a single verification attempt with full score breakdown.
   * The score breakdown shows how each component contributed to the final
   * composite score — useful for understanding borderline failures.
   */
  async getVerificationDetail(id: string): Promise<VerificationDetail> {
    const attempt = await this.prisma.idVerification.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        attemptNumber: true,
        documentMatch: true,
        faceScore: true,
        livenessScore: true,
        compositeScore: true,
        passed: true,
        failReason: true,
        ipAddress: true,
        createdAt: true,
        user: {
          select: {
            email: true,
            isActive: true,
            isIdVerified: true,
            verificationAttempts: true,
            citizenIdentity: {
              select: {
                surName: true,
                postNames: true,
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(
        `Verification attempt with ID "${id}" not found.`,
      );
    }

    // Reconstruct the scoring formula for transparency
    // Weights: face 50%, liveness 30%, document 20%
    const faceWeighted = attempt.faceScore * 0.5;
    const livenessWeighted = attempt.livenessScore * 0.3;
    const documentWeighted = attempt.documentMatch ? 20.0 : 0.0;

    return {
      id: attempt.id,
      userId: attempt.userId,
      userEmail: attempt.user.email,
      userName:
        [
          attempt.user.citizenIdentity?.postNames,
          attempt.user.citizenIdentity?.surName,
        ]
          .filter(Boolean)
          .join(' ') || attempt.user.email,
      attemptNumber: attempt.attemptNumber,
      documentMatch: attempt.documentMatch,
      faceScore: attempt.faceScore,
      livenessScore: attempt.livenessScore,
      compositeScore: attempt.compositeScore,
      passed: attempt.passed,
      failReason: attempt.failReason ?? null,
      ipAddress: attempt.ipAddress ?? null,
      createdAt: attempt.createdAt,

      scoreBreakdown: {
        face: {
          score: attempt.faceScore,
          weight: 50,
          weighted: parseFloat(faceWeighted.toFixed(2)),
        },
        liveness: {
          score: attempt.livenessScore,
          weight: 30,
          weighted: parseFloat(livenessWeighted.toFixed(2)),
        },
        document: {
          matched: attempt.documentMatch,
          weight: 20,
          weighted: documentWeighted,
        },
        composite: attempt.compositeScore,
        threshold: this.COMPOSITE_PASS_THRESHOLD,
        passed: attempt.passed,
      },

      userContext: {
        isActive: attempt.user.isActive,
        isIdVerified: attempt.user.isIdVerified,
        totalAttempts: attempt.user.verificationAttempts,
      },
    };
  }
}
