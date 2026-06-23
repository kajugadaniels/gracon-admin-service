// PrismaService — wraps PrismaClient and integrates with NestJS lifecycle.
// Prisma 7 runtime connection is supplied by @gracon/database.
// The admin service NEVER calls prisma.$executeRaw for schema changes.
// It only reads and writes data — schema is owned by api/database.
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { createPrismaClientOptions, PrismaClient } from '@gracon/database';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super(createPrismaClientOptions());
  }

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
