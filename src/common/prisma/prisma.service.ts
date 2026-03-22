// PrismaService — wraps PrismaClient and integrates with NestJS lifecycle.
// The admin service NEVER calls prisma.$executeRaw for schema changes.
// It only reads and writes data — schema is owned by api/auth/.
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy() {
    // Graceful shutdown — close the connection cleanly
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
