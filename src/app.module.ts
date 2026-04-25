import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { EncryptionModule } from './common/crypto/encryption.module';
import { AuditModule } from './common/audit/audit.module';
import { AppMailerModule } from './common/mailer/mailer.module';
import { TasksModule } from './common/tasks/tasks.module';
import { DocsAuthMiddleware } from './common/security/docs-auth.middleware';
import { AdminAuthModule } from './modules/auth/admin-auth.module';
import { AdminUsersModule } from './modules/users/admin-users.module';
import { AdminVerificationsModule } from './modules/verifications/admin-verifications.module';
import { AdminAuditModule } from './modules/audit/admin-audit.module';
import { AdminSecurityEventsModule } from './modules/security-events/admin-security-events.module';
import { AdminStatsModule } from './modules/stats/admin-stats.module';
import { AdminSignaturesModule } from './modules/signatures/admin-signatures.module';
import { AdminCertificatesModule } from './modules/certificates/admin-certificates.module';
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

    // Global common modules
    PrismaModule,
    EncryptionModule,
    AuditModule,
    AppMailerModule,
    TasksModule,

    // Feature modules
    AdminAuthModule,
    AdminUsersModule,
    AdminVerificationsModule,
    AdminAuditModule,
    AdminSecurityEventsModule,
    AdminStatsModule,
    AdminSignaturesModule,
    AdminCertificatesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AdminAuthGuard },
    DocsAuthMiddleware,
  ],
})
export class AppModule {}
