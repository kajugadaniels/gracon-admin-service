import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TokenCleanupTask } from './token-cleanup.task';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [TokenCleanupTask],
})
export class TasksModule {}
