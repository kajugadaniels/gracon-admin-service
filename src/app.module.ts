import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { EncryptionModule } from './common/crypto/encryption.module';
import { AuditModule } from './common/audit/audit.module';
import { AppMailerModule } from './common/mailer/mailer.module';
import { DocsAuthMiddleware } from './common/security/docs-auth.middleware';
import { AdminAuthModule } from './modules/auth/admin-auth.module';
import { AdminAuthGuard } from './common/guards/admin-auth.guard';
import { ThrottlerGuard } from '@nestjs/throttler';
import { validateEnv } from './common/config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),

    ThrottlerModule.forRoot([
      { name: 'general', ttl: 60_000, limit: 30 },
      { name: 'auth', ttl: 60_000, limit: 5 },
      { name: 'strict', ttl: 600_000, limit: 10 },
    ]),

    PrismaModule,
    EncryptionModule,
    AuditModule,
    AppMailerModule,
    AdminAuthModule,
  ],
  providers: [
    // ThrottlerGuard applied first — rate limit before auth check
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // AdminAuthGuard applied globally — every route protected by default
    // Use @SkipAuth() on public endpoints (login, invite flow)
    { provide: APP_GUARD, useClass: AdminAuthGuard },
    DocsAuthMiddleware,
  ],
})
export class AppModule {}
