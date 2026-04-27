// AdminSignaturesService
//
// Owns all read/write logic for the admin signatures dashboard.
//
// A "signature" on the dashboard is anchored on `PersonalCertificate` —
// the user-meaningful unit that binds a verified identity to a key pair.
// A key pair without a certificate cannot be used to sign, so anchoring
// on the certificate avoids ever surfacing unusable rows. The linked
// `PersonalKeyPair` is read for the algorithm and active flag, and
// `PersonalSignedDocument` is counted/most-recent-fetched to power the
// "Documents Signed" and "Last Used" columns.
//
// Revocation is the only mutating operation here: it flips the certificate
// to revoked, marks the key pair inactive, and writes an `AdminAuditLog`
// entry. The plaintext private key is never read or touched.
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { QuerySignaturesDto } from './dto/query-signatures.dto';
import { ListSignedDocumentsDto } from './dto/list-signed-documents.dto';
import { RevokeSignatureDto } from './dto/revoke-signature.dto';
import {
  buildPaginatedResponse,
  type PaginatedResponse,
} from '../../common/pagination/paginated-response';
import {
  buildSignatureListItem,
  buildSignatureDetail,
  deriveSignatureStatusFromRow,
  formatSignatureSignedDocument,
  type SignatureCertificateRow,
  type SignatureListItem,
  type SignatureDetailResponse,
  type SignatureSignedDocumentItem,
} from './helpers/admin-signatures.helper';

@Injectable()
export class AdminSignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── List ────────────────────────────────────────────────────────────────

  /**
   * Lists every issued personal certificate (= signature) across all users
   * for the admin dashboard, with pagination, search and filters.
   *
   * Filters are translated into concrete SQL predicates so pagination math
   * stays correct — we never filter in memory after `take`.
   *
   * @param dto - Validated query parameters from the controller.
   * @returns A `PaginatedResponse<SignatureListItem>` matching the admin
   *          frontend's shared pagination contract.
   */
  async listSignatures(
    dto: QuerySignaturesDto,
  ): Promise<PaginatedResponse<SignatureListItem>> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PersonalCertificateWhereInput = {};
    let keyPairFilter: Prisma.PersonalKeyPairWhereInput = {};

    if (dto.algorithm) {
      keyPairFilter = { ...keyPairFilter, algorithm: dto.algorithm };
    }

    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {};
      if (dto.createdFrom) {
        (where.createdAt as Prisma.DateTimeFilter).gte = new Date(dto.createdFrom);
      }
      if (dto.createdTo) {
        (where.createdAt as Prisma.DateTimeFilter).lte = new Date(dto.createdTo);
      }
    }

    if (dto.search) {
      const term = dto.search;
      where.user = {
        OR: [
          { email: { contains: term, mode: 'insensitive' } },
          {
            citizenIdentity: {
              OR: [
                { surName: { contains: term, mode: 'insensitive' } },
                { postNames: { contains: term, mode: 'insensitive' } },
              ],
            },
          },
        ],
      };
    }

    if (dto.status === 'ACTIVE') {
      where.isRevoked = false;
      keyPairFilter = { ...keyPairFilter, isActive: true };
    } else if (dto.status === 'REVOKED') {
      // A signature is REVOKED if either the cert is revoked or the key
      // pair has been deactivated (e.g. after key rotation).
      where.OR = [
        { isRevoked: true },
        { keyPair: { is: { isActive: false } } },
      ];
    }

    if (Object.keys(keyPairFilter).length > 0) {
      where.keyPair = { is: keyPairFilter };
    }

    const [total, rows] = await Promise.all([
      this.prisma.personalCertificate.count({ where }),
      this.prisma.personalCertificate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: this.signatureRowSelect(),
      }),
    ]);

    return buildPaginatedResponse({
      items: rows.map((row) => buildSignatureListItem(row)),
      total,
      page,
      limit,
    });
  }

  // ─── Detail ──────────────────────────────────────────────────────────────

  /**
   * Returns the full signature detail payload, including the recent admin
   * audit history filtered to this specific signature id.
   *
   * @param signatureId - The PersonalCertificate id (the dashboard treats
   *                      this as the signature id).
   * @throws NotFoundException when no certificate exists with this id.
   */
  async getSignatureDetail(signatureId: string): Promise<SignatureDetailResponse> {
    const row = await this.prisma.personalCertificate.findUnique({
      where: { id: signatureId },
      select: this.signatureRowSelect(),
    });

    if (!row) {
      throw new NotFoundException('Signature not found.');
    }

    // Audit history for this signature — correlated via metadata.signatureId
    // (= certificate id under the new anchor). We intentionally avoid an
    // `action: SIGNATURE_REVOKED` predicate here because shared environments
    // can lag on enum rollout; filtering by the metadata key is the stable
    // cross-version contract and still returns the rows the detail page needs.
    const auditRows = await this.prisma.adminAuditLog.findMany({
      where: {
        metadata: { path: ['signatureId'], equals: signatureId },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        action: true,
        metadata: true,
        createdAt: true,
        admin: {
          select: {
            id: true,
            role: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return buildSignatureDetail(row, auditRows);
  }

  // ─── Signed documents drill-down ─────────────────────────────────────────

  /**
   * Paginated list of documents signed by this signature, used as the
   * "Documents" tab on the admin signature detail page.
   */
  async listSignedDocuments(
    signatureId: string,
    dto: ListSignedDocumentsDto,
  ): Promise<PaginatedResponse<SignatureSignedDocumentItem>> {
    // signatureId is the certificate id under the new anchor.
    const cert = await this.prisma.personalCertificate.findUnique({
      where: { id: signatureId },
      select: { id: true },
    });

    if (!cert) {
      throw new NotFoundException('Signature not found.');
    }

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PersonalSignedDocumentWhereInput = {
      certificateId: signatureId,
    };

    const [total, rows] = await Promise.all([
      this.prisma.personalSignedDocument.count({ where }),
      this.prisma.personalSignedDocument.findMany({
        where,
        orderBy: { signedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          documentName: true,
          documentHash: true,
          signedAt: true,
          metadata: true,
        },
      }),
    ]);

    return buildPaginatedResponse({
      items: rows.map((row) => formatSignatureSignedDocument(row)),
      total,
      page,
      limit,
    });
  }

  // ─── Revoke ──────────────────────────────────────────────────────────────

  /**
   * Revokes a signature on behalf of an admin. Flips the certificate to
   * revoked, marks the linked key pair inactive, and writes a
   * `SIGNATURE_REVOKED` audit log entry capturing the reason.
   *
   * Idempotent at the API surface: a 409 is returned if the signature is
   * already revoked so the UI shows a clear message instead of pretending
   * a no-op succeeded.
   */
  async revokeSignature(params: {
    signatureId: string;
    adminId: string;
    ipAddress: string | null;
    dto: RevokeSignatureDto;
  }) {
    const row = await this.prisma.personalCertificate.findUnique({
      where: { id: params.signatureId },
      select: this.signatureRowSelect(),
    });

    if (!row) {
      throw new NotFoundException('Signature not found.');
    }

    if (deriveSignatureStatusFromRow(row) === 'REVOKED') {
      throw new ConflictException('Signature is already revoked.');
    }

    const revokedAt = new Date();
    const reason = params.dto.reason.trim();

    // Wrap both writes in a transaction so partial failure cannot leave
    // the signature in an inconsistent half-revoked state.
    await this.prisma.$transaction(async (tx) => {
      await tx.personalCertificate.update({
        where: { id: row.id },
        data: {
          isRevoked: true,
          revokedAt,
          revokedReason: reason,
        },
      });

      await tx.personalKeyPair.update({
        where: { id: row.keyPair.id },
        data: { isActive: false },
      });
    });

    await this.audit.log({
      adminId: params.adminId,
      action: 'SIGNATURE_REVOKED',
      targetUserId: row.userId,
      ipAddress: params.ipAddress ?? undefined,
      metadata: {
        signatureId: row.id,
        certificateId: row.id,
        keyPairId: row.keyPair.id,
        reason,
        revokedAt: revokedAt.toISOString(),
      },
    });

    return this.getSignatureDetail(params.signatureId);
  }

  // ─── Internal — Prisma select shape ──────────────────────────────────────
  //
  // Centralised so list/detail/revoke all read the exact same columns and
  // pass the same `SignatureCertificateRow` type into the helpers.

  /**
   * Returns the canonical Prisma select for the signature (certificate)
   * rows. Includes the joined user (with active signature image preview),
   * the key pair (for algorithm + active flag), and the signed-documents
   * count + most-recent timestamp.
   */
  private signatureRowSelect() {
    return {
      id: true,
      userId: true,
      isRevoked: true,
      revokedAt: true,
      revokedReason: true,
      createdAt: true,
      notAfter: true,
      user: {
        select: {
          email: true,
          imageUrl: true,
          citizenIdentity: {
            select: { surName: true, postNames: true },
          },
          // The user's active signature image — used to preview the
          // handwritten signature next to the cert on the detail page.
          personalSignatureImages: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' as const },
            take: 1,
            select: { id: true, s3Key: true, mimeType: true, sizeBytes: true },
          },
        },
      },
      keyPair: {
        select: {
          id: true,
          algorithm: true,
          isActive: true,
          createdAt: true,
        },
      },
      _count: { select: { signedDocs: true } },
      signedDocs: {
        orderBy: { signedAt: 'desc' as const },
        take: 1,
        select: { signedAt: true },
      },
    } satisfies Prisma.PersonalCertificateSelect;
  }
}
