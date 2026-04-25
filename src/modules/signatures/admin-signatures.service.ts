// AdminSignaturesService
//
// Owns all read/write logic for the admin signatures dashboard. Reads
// `PersonalKeyPair` + linked `PersonalCertificate` + the user's identity
// (joined from `users` and `citizen_identities`), then projects the result
// into the public shape consumed by the admin frontend's signatures pages.
//
// Revocation is the only mutating operation here: it flips the linked
// certificate to revoked, marks the key pair inactive, and writes an
// `AdminAuditLog` entry. The plaintext private key is never read or touched.
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
  buildSignatureListItem,
  buildSignatureDetail,
  deriveSignatureStatusFromRow,
  formatSignatureSignedDocument,
  type SignatureKeyPairRow,
} from './helpers/admin-signatures.helper';

@Injectable()
export class AdminSignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── List ────────────────────────────────────────────────────────────────

  /**
   * Lists every personal signature key pair across all users for the admin
   * dashboard, with pagination, search and status/algorithm/date filters.
   *
   * The ACTIVE/REVOKED filter is applied at the SQL level via the certificate
   * join — that keeps pagination math correct (we don't filter in memory).
   *
   * @param dto - Validated query parameters from the controller.
   * @returns A paginated envelope matching `PaginatedSignaturesResponse` on the frontend.
   */
  async listSignatures(dto: QuerySignaturesDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PersonalKeyPairWhereInput = {};

    if (dto.algorithm) {
      where.algorithm = dto.algorithm;
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
      where.isActive = true;
      where.personalCertificate = { is: { isRevoked: false } };
    } else if (dto.status === 'REVOKED') {
      where.OR = [
        { isActive: false },
        { personalCertificate: { is: { isRevoked: true } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.personalKeyPair.count({ where }),
      this.prisma.personalKeyPair.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: this.signatureRowSelect(),
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: rows.map((row) => buildSignatureListItem(row)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  // ─── Detail ──────────────────────────────────────────────────────────────

  /**
   * Returns the full signature detail payload, including the recent admin
   * audit history filtered to this specific signature id.
   *
   * @param signatureId - The PersonalKeyPair id (this is what the admin UI
   *                      treats as the signature id).
   * @throws NotFoundException when no key pair exists with this id.
   */
  async getSignatureDetail(signatureId: string) {
    const row = await this.prisma.personalKeyPair.findUnique({
      where: { id: signatureId },
      select: this.signatureRowSelect(),
    });

    if (!row) {
      throw new NotFoundException('Signature not found.');
    }

    // Audit history for this signature — filtered via metadata.signatureId.
    // We use a Prisma path filter on Json so the index on (action, createdAt)
    // can still help. Limited to 25 rows because the UI only shows recent.
    const auditRows = await this.prisma.adminAuditLog.findMany({
      where: {
        action: { in: ['SIGNATURE_REVOKED'] },
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
  async listSignedDocuments(signatureId: string, dto: ListSignedDocumentsDto) {
    // Resolve the certificate id from the signature key pair first — the
    // frontend treats key-pair-id as the signature-id, but signed documents
    // are FK'd to the certificate.
    const keyPair = await this.prisma.personalKeyPair.findUnique({
      where: { id: signatureId },
      select: { id: true, personalCertificate: { select: { id: true } } },
    });

    if (!keyPair) {
      throw new NotFoundException('Signature not found.');
    }

    const certificateId = keyPair.personalCertificate?.id;
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    if (!certificateId) {
      return {
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    const where: Prisma.PersonalSignedDocumentWhereInput = { certificateId };

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

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      data: rows.map((row) => formatSignatureSignedDocument(row)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  // ─── Revoke ──────────────────────────────────────────────────────────────

  /**
   * Revokes a signature on behalf of an admin. Flips the linked
   * certificate's revocation flags, marks the key pair inactive, and writes
   * a `SIGNATURE_REVOKED` audit log entry that captures the reason.
   *
   * Idempotent at the API surface: a 409 is returned if the signature is
   * already revoked so the UI can show a clear message instead of pretending
   * a no-op succeeded.
   */
  async revokeSignature(params: {
    signatureId: string;
    adminId: string;
    ipAddress: string | null;
    dto: RevokeSignatureDto;
  }) {
    const row = await this.prisma.personalKeyPair.findUnique({
      where: { id: params.signatureId },
      select: this.signatureRowSelect(),
    });

    if (!row) {
      throw new NotFoundException('Signature not found.');
    }

    const status = deriveSignatureStatusFromRow(row);
    if (status === 'REVOKED') {
      throw new ConflictException('Signature is already revoked.');
    }

    const revokedAt = new Date();
    const reason = params.dto.reason.trim();

    // Wrap both writes in a transaction so partial failure cannot leave the
    // signature in an inconsistent half-revoked state.
    await this.prisma.$transaction(async (tx) => {
      if (row.personalCertificate) {
        await tx.personalCertificate.update({
          where: { id: row.personalCertificate.id },
          data: {
            isRevoked: true,
            revokedAt,
            revokedReason: reason,
          },
        });
      }

      await tx.personalKeyPair.update({
        where: { id: row.id },
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
        certificateId: row.personalCertificate?.id ?? null,
        reason,
        revokedAt: revokedAt.toISOString(),
      },
    });

    return this.getSignatureDetail(params.signatureId);
  }

  // ─── Internal — Prisma select shape ──────────────────────────────────────
  //
  // Centralised so list/detail/revoke all read the exact same columns and
  // pass the same `SignatureKeyPairRow` type into the helpers.

  /**
   * Returns the canonical Prisma select for the signature list/detail rows.
   * Kept in one place so list and detail share the same shape (and so the
   * helper module can rely on a single TypeScript type).
   */
  private signatureRowSelect() {
    return {
      id: true,
      userId: true,
      algorithm: true,
      isActive: true,
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
      personalCertificate: {
        select: {
          id: true,
          isRevoked: true,
          revokedAt: true,
          revokedReason: true,
          notAfter: true,
          _count: { select: { signedDocs: true } },
          signedDocs: {
            orderBy: { signedAt: 'desc' as const },
            take: 1,
            select: { signedAt: true },
          },
        },
      },
    } satisfies Prisma.PersonalKeyPairSelect;
  }
}

// Re-export the row type so the helper keeps a stable contract with the service.
export type { SignatureKeyPairRow };
