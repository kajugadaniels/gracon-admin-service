// PrismaService — wraps PrismaClient and integrates with NestJS lifecycle.
// Prisma 7 requires a driver adapter — the URL is no longer read from schema.prisma.
// The admin service NEVER calls prisma.$executeRaw for schema changes.
// It only reads and writes data — schema is owned by api/auth/.
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Prisma 7 requires a driver adapter — datasource url in schema.prisma is no longer supported.
    // DATABASE_URL is validated by ConfigModule at startup; this guard is a safety net only.
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
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
