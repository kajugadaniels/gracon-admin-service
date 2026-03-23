import { Module } from '@nestjs/common';
import { AdminSecurityEventsService } from './admin-security-events.service';
import { AdminSecurityEventsController } from './admin-security-events.controller';

@Module({
  controllers: [AdminSecurityEventsController],
  providers: [AdminSecurityEventsService],
})
export class AdminSecurityEventsModule {}
