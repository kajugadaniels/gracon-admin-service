import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'admin-jwt' }),

    // JWT module configured with ADMIN_JWT_SECRET — separate from api/auth/
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('ADMIN_JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('ADMIN_JWT_ACCESS_EXPIRY', '8h'),
          issuer: 'id-verification-admin',
          audience: 'id-verification-admin-panel',
        },
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtStrategy, AdminAuthGuard],
  exports: [AdminAuthService, AdminJwtStrategy, PassportModule, AdminAuthGuard],
})
export class AdminAuthModule {}
