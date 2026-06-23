// AuditService — writes every admin action to AdminAuditLog.
// Injected into every module that performs admin actions.
// Never throws — logging failure must never break the admin flow.
// Every action is logged AFTER it succeeds — never before.
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@gracon/database';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAction } from '@gracon/database';

export interface LogAuditParams {
  adminId: string;
  action: AdminAction;
  targetUserId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Logs an admin action to the audit trail.
   * Called fire-and-forget after every successful admin operation.
   * Failure is logged server-side but never surfaced to the caller.
   */
  async log(params: LogAuditParams): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId: params.adminId,
          action: params.action,
          targetUserId: params.targetUserId ?? null,
          ipAddress: params.ipAddress ?? null,
          metadata: (params.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        },
      });
    } catch (error) {
      // Never throw — audit failure must not break the admin operation
      this.logger.error(
        `Failed to write audit log [${params.action}] by admin ${params.adminId}`,
        error,
      );
    }
  }
}
