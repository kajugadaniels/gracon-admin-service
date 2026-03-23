// AdminSecurityEventsService — read-only access to SecurityEventLog.
// Written by api/auth/ — this service only reads.
// Gives admins real-time visibility into security threats:
// brute force attempts, token reuse, rate limit hits.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QuerySecurityEventsDto } from './dto/query-security-events.dto';

export interface SecurityEventEntry {
  id: string;
  userId: string | null;
  userEmail: string | null;
  eventType: string;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface PaginatedSecurityEvents {
  data: SecurityEventEntry[];
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
export class AdminSecurityEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the paginated security event log, newest first.
   * Joins User for email context — userEmail is null for pre-auth events
   * (e.g. login attempts with an unknown email address).
   */
  async listSecurityEvents(
    dto: QuerySecurityEventsDto,
  ): Promise<PaginatedSecurityEvents> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (dto.userId) where.userId = dto.userId;
    if (dto.eventType) where.eventType = dto.eventType;
    if (dto.ipAddress) where.ipAddress = { contains: dto.ipAddress };

    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {};
      if (dto.createdFrom) where.createdAt.gte = new Date(dto.createdFrom);
      if (dto.createdTo) where.createdAt.lte = new Date(dto.createdTo);
    }

    const [total, events] = await Promise.all([
      this.prisma.securityEventLog.count({ where }),
      this.prisma.securityEventLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          eventType: true,
          ipAddress: true,
          metadata: true,
          createdAt: true,
          user: {
            select: { email: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const data: SecurityEventEntry[] = events.map((e) => ({
      id: e.id,
      userId: e.userId ?? null,
      userEmail: e.user?.email ?? null,
      eventType: e.eventType,
      ipAddress: e.ipAddress ?? null,
      metadata: (e.metadata as Record<string, unknown>) ?? null,
      createdAt: e.createdAt,
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
