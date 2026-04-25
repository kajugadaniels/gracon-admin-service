// AdminSignaturesModule wires the signatures controller, service and audit
// helper. PrismaService and AuditService are exported by their respective
// global modules registered in AppModule, so we only declare local deps.
import { Module } from '@nestjs/common';
import { AdminSignaturesController } from './admin-signatures.controller';
import { AdminSignaturesService } from './admin-signatures.service';

@Module({
  controllers: [AdminSignaturesController],
  providers: [AdminSignaturesService],
})
export class AdminSignaturesModule {}
