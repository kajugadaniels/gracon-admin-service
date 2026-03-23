// AdminAuditService — read-only access to the AdminAuditLog table.
// Every write to this table is done by AuditService in common/audit/.
// This service exists solely to expose the log to the admin panel.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueryAuditDto } from './dto/query-audit.dto';

export interface AuditLogEntry {
  id: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  action: string;
  targetUserId: string | null;
  targetEmail: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}

export interface PaginatedAuditLog {
  data: AuditLogEntry[];
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
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the paginated admin audit log.
   * Joins Admin for actor details and User for target details.
   * All filters are optional — no filter returns the full log, newest first.
   */
  async listAuditLogs(dto: QueryAuditDto): Promise<PaginatedAuditLog> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (dto.adminId) where.adminId = dto.adminId;
    if (dto.targetUserId) where.targetUserId = dto.targetUserId;
    if (dto.action) where.action = dto.action;

    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {};
      if (dto.createdFrom) where.createdAt.gte = new Date(dto.createdFrom);
      if (dto.createdTo) where.createdAt.lte = new Date(dto.createdTo);
    }

    const [total, logs] = await Promise.all([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          adminId: true,
          action: true,
          targetUserId: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          admin: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    // Batch-fetch target user emails — avoids N+1 without complex joins
    const targetIds = [
      ...new Set(logs.map((l) => l.targetUserId).filter(Boolean) as string[]),
    ];

    const targetUsers = targetIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: targetIds } },
          select: { id: true, email: true },
        })
      : [];

    const targetEmailMap = new Map(targetUsers.map((u) => [u.id, u.email]));
    const totalPages = Math.ceil(total / limit);

    const data: AuditLogEntry[] = logs.map((l) => ({
      id: l.id,
      adminId: l.adminId,
      adminName: `${l.admin.firstName} ${l.admin.lastName}`,
      adminEmail: l.admin.email,
      action: l.action,
      targetUserId: l.targetUserId ?? null,
      targetEmail: l.targetUserId
        ? (targetEmailMap.get(l.targetUserId) ?? null)
        : null,
      metadata: (l.metadata as Record<string, unknown>) ?? null,
      ipAddress: l.ipAddress ?? null,
      createdAt: l.createdAt,
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
}
