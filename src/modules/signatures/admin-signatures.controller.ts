// AdminSignaturesController — admin-facing operations on personal
// signature key pairs. Base path: /api/v1/signatures
//
// Every route inherits the global AdminAuthGuard, so requests must carry a
// valid admin JWT. Revocation is logged to AdminAuditLog by the service.
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AdminSignaturesService } from './admin-signatures.service';
import { QuerySignaturesDto } from './dto/query-signatures.dto';
import { ListSignedDocumentsDto } from './dto/list-signed-documents.dto';
import { RevokeSignatureDto } from './dto/revoke-signature.dto';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import type { AdminJwtPayload } from '../../common/decorators/current-admin.decorator';

@ApiTags('signatures')
@ApiBearerAuth('admin-jwt')
@Controller('signatures')
export class AdminSignaturesController {
  constructor(private readonly service: AdminSignaturesService) {}

  // ── GET /signatures ──────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List signatures across all users',
    description:
      'Returns a paginated list of every personal signature key pair on ' +
      'the platform with its current ACTIVE/REVOKED status, owner identity, ' +
      'and a count of documents the signature has been used to sign.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated signatures list.',
  })
  listSignatures(@Query() dto: QuerySignaturesDto) {
    return this.service.listSignatures(dto);
  }

  // ── GET /signatures/:id ──────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get signature detail',
    description:
      'Returns the full signature payload including signer identity and ' +
      'the recent admin audit history for this specific signature id.',
  })
  @ApiParam({ name: 'id', description: 'Signature (key pair) UUID.' })
  @ApiResponse({ status: 200, description: 'Signature detail returned.' })
  @ApiResponse({ status: 404, description: 'Signature not found.' })
  getSignature(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getSignatureDetail(id);
  }

  // ── GET /signatures/:id/documents ────────────────────────────────────────

  @Get(':id/documents')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List documents signed by this signature',
    description:
      'Paginated list of immutable signing events tied to this signature, ' +
      'ordered most-recent first.',
  })
  @ApiParam({ name: 'id', description: 'Signature (key pair) UUID.' })
  @ApiResponse({ status: 200, description: 'Paginated signed-documents list.' })
  @ApiResponse({ status: 404, description: 'Signature not found.' })
  listSignatureDocuments(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() dto: ListSignedDocumentsDto,
  ) {
    return this.service.listSignedDocuments(id, dto);
  }

  // ── POST /signatures/:id/revoke ──────────────────────────────────────────

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  // Strict throttle — revocation is a destructive operation; a runaway client
  // should not be able to revoke many signatures in a tight loop.
  @Throttle({ strict: { limit: 10, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Revoke a signature',
    description:
      'Marks the signature key pair inactive and revokes its linked ' +
      'certificate. Writes a SIGNATURE_REVOKED entry to AdminAuditLog with ' +
      'the supplied reason. Idempotent: returns 409 if already revoked.',
  })
  @ApiParam({ name: 'id', description: 'Signature (key pair) UUID.' })
  @ApiResponse({ status: 200, description: 'Signature revoked.' })
  @ApiResponse({ status: 404, description: 'Signature not found.' })
  @ApiResponse({ status: 409, description: 'Signature already revoked.' })
  revokeSignature(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RevokeSignatureDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request,
  ) {
    return this.service.revokeSignature({
      signatureId: id,
      adminId: admin.adminId,
      ipAddress: req.ip ?? null,
      dto,
    });
  }
}
