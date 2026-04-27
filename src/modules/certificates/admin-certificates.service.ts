// AdminCertificatesService
//
// Owns read access plus revocation/reissue side-effects for the admin
// certificate dashboard. Reads `PersonalCertificate` joined with the owner's
// `User` and the `PersonalKeyPair` so the public response can include
// algorithm, key size, and identity type without re-querying.
//
// Reissue is intentionally **audit-only**: re-signing a certificate
// requires touching the encrypted private key, which only `api/signature`
// is allowed to do. The admin endpoint records intent and revokes the
// existing certificate with reason "superseded"; the user re-issues from
// their own app.
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { CertificateRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { QueryCertificatesDto } from './dto/query-certificates.dto';
import { QueryCertificateRequestsDto } from './dto/query-certificate-requests.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';
import { ReissueCertificateDto } from './dto/reissue-certificate.dto';
import { ReviewCertificateRequestDto } from './dto/review-certificate-request.dto';
import { buildPaginatedResponse } from '../../common/pagination/paginated-response';
import {
  buildCertificateListItem,
  buildCertificateDetail,
  CERTIFICATE_EXPIRING_SOON_DAYS,
  certificatePemToDer,
  deriveCertificateStatus,
  type CertificateRow,
} from './helpers/admin-certificates.helper';
import {
  buildCertificateRequestDetail,
  buildCertificateRequestListItem,
  type CertificateRequestRow,
} from './helpers/admin-certificate-requests.helper';
import { SignatureServiceClient } from './signature-service.client';

@Injectable()
export class AdminCertificatesService {
  private readonly logger = new Logger(AdminCertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly signatureServiceClient: SignatureServiceClient,
  ) {}

  // ─── List ────────────────────────────────────────────────────────────────

  /**
   * Lists certificates across all users with pagination, search and
   * status/identity-type/country/expiringSoon filters.
   */
  async listCertificates(dto: QueryCertificatesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: Prisma.PersonalCertificateWhereInput = {};

    if (dto.country) {
      where.subjectC = dto.country.toUpperCase();
    }

    if (dto.search) {
      const term = dto.search;
      where.OR = [
        { subjectCN: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    // Identity type is encoded in the certificate subject identifier:
    // FINs match the platform's /^2\d{15}$/ contract, while NIDs do not.
    // Filter on the persisted subject value so the list stays correct even
    // though FIN users now also have CitizenIdentity rows.
    if (dto.identityType === 'NID') {
      where.NOT = [{ subjectUserId: { startsWith: '2' } }];
    } else if (dto.identityType === 'FIN') {
      where.subjectUserId = { startsWith: '2' };
    }

    // Status filtering is the most subtle bit because EXPIRED is a derived
    // value (notAfter < now). We translate each status to the concrete
    // SQL predicate it represents so pagination math stays correct.
    if (dto.status === 'REVOKED') {
      where.isRevoked = true;
    } else if (dto.status === 'EXPIRED') {
      where.isRevoked = false;
      where.notAfter = { lt: now };
    } else if (dto.status === 'ACTIVE') {
      where.isRevoked = false;
      where.notAfter = { gte: now };
    }

    if (dto.expiringSoon) {
      const horizon = new Date(now);
      horizon.setDate(horizon.getDate() + CERTIFICATE_EXPIRING_SOON_DAYS);
      // Combine with any pre-existing notAfter filter without clobbering it.
      const existing = (where.notAfter as Prisma.DateTimeFilter | undefined) ?? {};
      where.notAfter = { ...existing, gte: now, lte: horizon };
      where.isRevoked = false;
    }

    const [total, rows] = await Promise.all([
      this.prisma.personalCertificate.count({ where }),
      this.prisma.personalCertificate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: this.certificateRowSelect(),
      }),
    ]);

    return buildPaginatedResponse({
      items: rows.map((row) => buildCertificateListItem(row, now)),
      total,
      page,
      limit,
    });
  }

  // ─── Detail ──────────────────────────────────────────────────────────────

  /**
   * Returns the full certificate detail payload, including parsed DN built
   * from persisted columns, the PEM body, and SHA-256 fingerprint.
   */
  async getCertificateDetail(certificateId: string) {
    const row = await this.findCertificateOrThrow(certificateId);
    return buildCertificateDetail(row);
  }

  async listCertificateRequests(dto: QueryCertificateRequestsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildRequestWhere(dto);

    const [total, rows] = await Promise.all([
      this.prisma.personalCertificateRequest.count({ where }),
      this.prisma.personalCertificateRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: this.certificateRequestRowSelect(),
      }),
    ]);

    return buildPaginatedResponse({
      items: rows.map((row) => buildCertificateRequestListItem(row)),
      total,
      page,
      limit,
    });
  }

  async getCertificateRequestDetail(requestId: string) {
    const row = await this.findCertificateRequestOrThrow(requestId);
    return buildCertificateRequestDetail(row);
  }

  // ─── Downloads ───────────────────────────────────────────────────────────

  /**
   * Returns the raw PEM body for the certificate as a string. Designed to
   * be served as `text/plain` by the controller.
   */
  async getCertificatePem(certificateId: string): Promise<string> {
    const row = await this.findCertificateOrThrow(certificateId);
    return row.certificatePem;
  }

  /**
   * Returns the DER bytes for the certificate. Designed to be served as
   * `application/pkix-cert` by the controller.
   */
  async getCertificateDer(certificateId: string): Promise<Buffer> {
    const row = await this.findCertificateOrThrow(certificateId);
    return certificatePemToDer(row.certificatePem);
  }

  // ─── Revoke ──────────────────────────────────────────────────────────────

  /**
   * Revokes a certificate and writes a `CERTIFICATE_REVOKED` audit entry.
   * Idempotent at the API surface: 409 when already revoked.
   */
  async revokeCertificate(params: {
    certificateId: string;
    adminId: string;
    ipAddress: string | null;
    dto: RevokeCertificateDto;
  }) {
    const row = await this.findCertificateOrThrow(params.certificateId);

    if (row.isRevoked) {
      throw new ConflictException('Certificate is already revoked.');
    }

    const revokedAt = new Date();
    const reason = params.dto.reason.trim();

    await this.prisma.personalCertificate.update({
      where: { id: row.id },
      data: {
        isRevoked: true,
        revokedAt,
        revokedReason: reason,
      },
    });

    await this.audit.log({
      adminId: params.adminId,
      action: 'CERTIFICATE_REVOKED',
      targetUserId: row.userId,
      ipAddress: params.ipAddress ?? undefined,
      metadata: {
        certificateId: row.id,
        serialNumber: row.serialNumber,
        crlReasonCode: params.dto.crlReasonCode,
        reason,
        revokedAt: revokedAt.toISOString(),
      },
    });

    return this.getCertificateDetail(params.certificateId);
  }

  // ─── Reissue (audit-only) ────────────────────────────────────────────────

  /**
   * Records that a reissue should occur. Marks the existing certificate
   * revoked with reason "superseded" and writes a
   * `CERTIFICATE_REISSUE_REQUESTED` audit entry. The actual re-signing is
   * performed later by `api/signature` from the user's own app — this
   * service never has access to the encrypted private key.
   */
  async reissueCertificate(params: {
    certificateId: string;
    adminId: string;
    ipAddress: string | null;
    dto: ReissueCertificateDto;
  }) {
    const row = await this.findCertificateOrThrow(params.certificateId);
    const reason = params.dto.reason.trim();
    const now = new Date();

    if (deriveCertificateStatus(row, now) === 'REVOKED') {
      throw new ConflictException(
        'Certificate is already revoked — issue a new one from the user app.',
      );
    }

    await this.prisma.personalCertificate.update({
      where: { id: row.id },
      data: {
        isRevoked: true,
        revokedAt: now,
        revokedReason: `Superseded — reissue requested by admin: ${reason}`,
      },
    });

    await this.audit.log({
      adminId: params.adminId,
      action: 'CERTIFICATE_REISSUE_REQUESTED',
      targetUserId: row.userId,
      ipAddress: params.ipAddress ?? undefined,
      metadata: {
        certificateId: row.id,
        serialNumber: row.serialNumber,
        reason,
        supersededAt: now.toISOString(),
      },
    });

    return this.getCertificateDetail(params.certificateId);
  }

  async approveCertificateRequest(params: {
    requestId: string;
    adminId: string;
    ipAddress: string | null;
    dto: ReviewCertificateRequestDto;
  }) {
    const request = await this.findCertificateRequestOrThrow(params.requestId);
    this.ensurePendingRequest(request);

    const certificate = await this.signatureServiceClient.approveCertificateRequest(
      params.requestId,
      {
        adminId: params.adminId,
        reason: params.dto.reason.trim(),
      },
    );

    await this.audit.log({
      adminId: params.adminId,
      action: 'CERTIFICATE_REQUEST_APPROVED',
      targetUserId: request.userId,
      ipAddress: params.ipAddress ?? undefined,
      metadata: {
        requestId: request.id,
        issuedCertificateId:
          this.extractStringField(certificate, 'id') ?? request.issuedCertificateId,
        reason: params.dto.reason.trim(),
      },
    });

    return this.getCertificateRequestDetail(params.requestId);
  }

  async rejectCertificateRequest(params: {
    requestId: string;
    adminId: string;
    ipAddress: string | null;
    dto: ReviewCertificateRequestDto;
  }) {
    const request = await this.findCertificateRequestOrThrow(params.requestId);
    this.ensurePendingRequest(request);

    await this.signatureServiceClient.rejectCertificateRequest(params.requestId, {
      adminId: params.adminId,
      reason: params.dto.reason.trim(),
    });

    await this.audit.log({
      adminId: params.adminId,
      action: 'CERTIFICATE_REQUEST_REJECTED',
      targetUserId: request.userId,
      ipAddress: params.ipAddress ?? undefined,
      metadata: {
        requestId: request.id,
        reason: params.dto.reason.trim(),
      },
    });

    return this.getCertificateRequestDetail(params.requestId);
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  /**
   * Loads one certificate with the canonical select shape, throwing 404
   * when missing. Centralised so list/detail/download/revoke/reissue stay
   * consistent.
   */
  private async findCertificateOrThrow(
    certificateId: string,
  ): Promise<CertificateRow> {
    const row = await this.prisma.personalCertificate.findUnique({
      where: { id: certificateId },
      select: this.certificateRowSelect(),
    });

    if (!row) {
      throw new NotFoundException('Certificate not found.');
    }
    return row;
  }

  private async findCertificateRequestOrThrow(
    requestId: string,
  ): Promise<CertificateRequestRow> {
    const row = await this.prisma.personalCertificateRequest.findUnique({
      where: { id: requestId },
      select: this.certificateRequestRowSelect(),
    });

    if (!row) {
      throw new NotFoundException('Certificate request not found.');
    }

    return row;
  }

  private buildRequestWhere(
    dto: QueryCertificateRequestsDto,
  ): Prisma.PersonalCertificateRequestWhereInput {
    const where: Prisma.PersonalCertificateRequestWhereInput = {};

    if (dto.status) {
      where.status = dto.status;
    }

    if (!dto.search) {
      return where;
    }

    where.OR = [
      { user: { email: { contains: dto.search, mode: 'insensitive' } } },
      {
        user: {
          citizenIdentity: {
            is: {
              postNames: { contains: dto.search, mode: 'insensitive' },
            },
          },
        },
      },
      {
        user: {
          citizenIdentity: {
            is: {
              surName: { contains: dto.search, mode: 'insensitive' },
            },
          },
        },
      },
    ];

    return where;
  }

  private ensurePendingRequest(
    request: Pick<CertificateRequestRow, 'status'>,
  ): void {
    if (request.status !== CertificateRequestStatus.PENDING) {
      throw new ConflictException(
        'Only pending certificate requests can be reviewed.',
      );
    }
  }

  private extractStringField(
    value: unknown,
    key: string,
  ): string | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }

    const nextValue = Reflect.get(value, key);
    return typeof nextValue === 'string' ? nextValue : null;
  }

  /**
   * Returns the canonical Prisma select for certificate rows. Centralising
   * this keeps the helper's `CertificateRow` type the single source of truth.
   */
  private certificateRowSelect() {
    return {
      id: true,
      userId: true,
      serialNumber: true,
      subjectCN: true,
      subjectO: true,
      subjectC: true,
      subjectUserId: true,
      notBefore: true,
      notAfter: true,
      certificatePem: true,
      isRevoked: true,
      revokedAt: true,
      revokedReason: true,
      createdAt: true,
      user: {
        select: {
          email: true,
          imageUrl: true,
          citizenIdentity: {
            select: { surName: true, postNames: true },
          },
        },
      },
      keyPair: {
        select: { algorithm: true },
      },
    } satisfies Prisma.PersonalCertificateSelect;
  }

  private certificateRequestRowSelect() {
    return {
      id: true,
      userId: true,
      keyPairId: true,
      status: true,
      requestedValidityYears: true,
      reviewReason: true,
      cancellationReason: true,
      reviewedByAdminId: true,
      reviewedAt: true,
      cancelledAt: true,
      issuedCertificateId: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          email: true,
          imageUrl: true,
          citizenIdentity: {
            select: {
              surName: true,
              postNames: true,
              identityType: true,
            },
          },
        },
      },
      keyPair: {
        select: {
          algorithm: true,
          fingerprint: true,
          createdAt: true,
        },
      },
    } satisfies Prisma.PersonalCertificateRequestSelect;
  }
}
