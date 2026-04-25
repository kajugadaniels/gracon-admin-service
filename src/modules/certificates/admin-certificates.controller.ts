// AdminCertificatesController — admin-facing operations on personal X.509
// certificates. Base path: /api/v1/certificates
//
// Every route inherits the global AdminAuthGuard so it requires a valid
// admin JWT. Revoke/reissue write to AdminAuditLog via the service.
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
  Header,
  Res,
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
import type { Request, Response } from 'express';
import { AdminCertificatesService } from './admin-certificates.service';
import { QueryCertificatesDto } from './dto/query-certificates.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';
import { ReissueCertificateDto } from './dto/reissue-certificate.dto';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import type { AdminJwtPayload } from '../../common/decorators/current-admin.decorator';

@ApiTags('certificates')
@ApiBearerAuth('admin-jwt')
@Controller('certificates')
export class AdminCertificatesController {
  constructor(private readonly service: AdminCertificatesService) {}

  // ── GET /certificates ────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List certificates across all users',
    description:
      'Returns a paginated list of every personal X.509 certificate on ' +
      'the platform with its derived ACTIVE/EXPIRED/REVOKED status, owner ' +
      'identity, and days-to-expiry.',
  })
  @ApiResponse({ status: 200, description: 'Paginated certificates list.' })
  listCertificates(@Query() dto: QueryCertificatesDto) {
    return this.service.listCertificates(dto);
  }

  // ── GET /certificates/:id ────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get certificate detail',
    description:
      'Returns the certificate detail payload — including the parsed ' +
      'subject DN built from persisted columns, the SHA-256 fingerprint, ' +
      'the key algorithm/size and the full PEM body.',
  })
  @ApiParam({ name: 'id', description: 'Certificate UUID.' })
  @ApiResponse({ status: 200, description: 'Certificate detail returned.' })
  @ApiResponse({ status: 404, description: 'Certificate not found.' })
  getCertificate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getCertificateDetail(id);
  }

  // ── GET /certificates/:id/download/pem ───────────────────────────────────

  @Get(':id/download/pem')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({
    summary: 'Download certificate as PEM',
    description: 'Returns the raw PEM body as text/plain.',
  })
  @ApiParam({ name: 'id', description: 'Certificate UUID.' })
  @ApiResponse({ status: 200, description: 'Certificate PEM body.' })
  @ApiResponse({ status: 404, description: 'Certificate not found.' })
  async downloadPem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const pem = await this.service.getCertificatePem(id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="certificate-${id}.pem"`,
    );
    return pem;
  }

  // ── GET /certificates/:id/download/der ───────────────────────────────────

  @Get(':id/download/der')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Download certificate as DER',
    description:
      'Returns the certificate as raw DER bytes (application/pkix-cert).',
  })
  @ApiParam({ name: 'id', description: 'Certificate UUID.' })
  @ApiResponse({ status: 200, description: 'Certificate DER bytes.' })
  @ApiResponse({ status: 404, description: 'Certificate not found.' })
  async downloadDer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const der = await this.service.getCertificateDer(id);
    res.setHeader('Content-Type', 'application/pkix-cert');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="certificate-${id}.der"`,
    );
    res.send(der);
  }

  // ── POST /certificates/:id/revoke ────────────────────────────────────────

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @Throttle({ strict: { limit: 10, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Revoke a certificate',
    description:
      'Marks the certificate revoked, captures the supplied CRL reason ' +
      'code in the audit metadata, and writes a CERTIFICATE_REVOKED entry ' +
      'to AdminAuditLog. Idempotent: returns 409 if already revoked.',
  })
  @ApiParam({ name: 'id', description: 'Certificate UUID.' })
  @ApiResponse({ status: 200, description: 'Certificate revoked.' })
  @ApiResponse({ status: 404, description: 'Certificate not found.' })
  @ApiResponse({ status: 409, description: 'Certificate already revoked.' })
  revokeCertificate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RevokeCertificateDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request,
  ) {
    return this.service.revokeCertificate({
      certificateId: id,
      adminId: admin.adminId,
      ipAddress: req.ip ?? null,
      dto,
    });
  }

  // ── POST /certificates/:id/reissue ───────────────────────────────────────

  @Post(':id/reissue')
  @HttpCode(HttpStatus.OK)
  @Throttle({ strict: { limit: 10, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Request certificate reissue (audit-only)',
    description:
      'Marks the existing certificate revoked with reason "superseded" ' +
      'and writes a CERTIFICATE_REISSUE_REQUESTED audit entry. Re-signing ' +
      'happens asynchronously from the user app — the admin service never ' +
      'touches the encrypted private key.',
  })
  @ApiParam({ name: 'id', description: 'Certificate UUID.' })
  @ApiResponse({ status: 200, description: 'Reissue request recorded.' })
  @ApiResponse({ status: 404, description: 'Certificate not found.' })
  @ApiResponse({
    status: 409,
    description: 'Certificate already revoked — issue a new one from the user app.',
  })
  reissueCertificate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReissueCertificateDto,
    @CurrentAdmin() admin: AdminJwtPayload,
    @Req() req: Request,
  ) {
    return this.service.reissueCertificate({
      certificateId: id,
      adminId: admin.adminId,
      ipAddress: req.ip ?? null,
      dto,
    });
  }
}
