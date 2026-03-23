import { Module } from '@nestjs/common';
import { AdminVerificationsService } from './admin-verifications.service';
import { AdminVerificationsController } from './admin-verifications.controller';

@Module({
  controllers: [AdminVerificationsController],
  providers: [AdminVerificationsService],
})
export class AdminVerificationsModule {}
