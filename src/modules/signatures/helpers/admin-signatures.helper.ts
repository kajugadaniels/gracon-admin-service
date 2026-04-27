// Pure helpers for the admin signatures module.
//
// Everything in this file is side-effect free so it can be unit-tested in
// isolation from Prisma. The service layer feeds in raw certificate rows,
// the helpers return the public shape consumed by the admin frontend.
//
// A "signature" on the dashboard is a `PersonalCertificate` with its
// linked `PersonalKeyPair` and the signing user's identity. Status,
// "documents signed" count, and "last used" timestamp are all derived
// here from the certificate row.
import { AdminRole, PersonalKeyAlgorithm, Prisma } from '@prisma/client';

/** Public-facing signature status as rendered by the admin dashboard. */
export type AdminSignatureStatus = 'ACTIVE' | 'REVOKED';

/**
 * Canonical shape of the rows returned by the centralised Prisma select in
 * `admin-signatures.service.ts`. Keeping this in one place means the
 * helpers never accept a wider type than the service actually selects.
 */
export type SignatureCertificateRow = {
  id: string;
  userId: string;
  isRevoked: boolean;
  revokedAt: Date | null;
  revokedReason: string | null;
  createdAt: Date;
  notAfter: Date;
  user: {
    email: string;
    imageUrl: string | null;
    citizenIdentity: {
      surName: string;
      postNames: string;
    } | null;
    personalSignatureImages: {
      id: string;
      s3Key: string;
      mimeType: string;
      sizeBytes: number;
    }[];
  };
  keyPair: {
    id: string;
    algorithm: PersonalKeyAlgorithm;
    isActive: boolean;
    createdAt: Date;
  };
  _count: { signedDocs: number };
  signedDocs: { signedAt: Date }[];
};

/** Audit row shape consumed by `buildSignatureDetail`. */
export type SignatureAuditRow = {
  id: string;
  action: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  admin: {
    id: string;
    role: AdminRole;
    firstName: string;
    lastName: string;
  } | null;
};

// ─── Public shapes returned by the service ──────────────────────────────────

/** Compact signature row rendered by the admin signatures table. */
export interface SignatureListItem {
  signatureId: string;
  userId: string;
  userName: string;
  userEmail: string;
  algorithm: PersonalKeyAlgorithm;
  createdAt: string;
  lastUsedAt: string | null;
  documentsSigned: number;
  status: AdminSignatureStatus;
}

/** One audit log entry shown on the signature detail page. */
export interface SignatureAuditItem {
  id: string;
  action: string;
  actorName: string;
  actorRole: AdminRole;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

/** Optional preview metadata for the user's active handwritten signature. */
export interface SignatureImagePreview {
  imageId: string;
  s3Key: string;
  mimeType: string;
  sizeBytes: number;
}

/** Full signature detail rendered on the signature detail page. */
export interface SignatureDetailResponse extends SignatureListItem {
  userImageUrl: string | null;
  signatureImage: SignatureImagePreview | null;
  auditLog: SignatureAuditItem[];
}

/** One row rendered in the per-signature signed-documents drilldown. */
export interface SignatureSignedDocumentItem {
  documentId: string;
  documentHash: string;
  documentName: string;
  signedAt: string;
  verificationStatus: 'VALID' | 'INVALID' | 'UNKNOWN';
  documentSource: string;
}

// ─── Display name helpers ───────────────────────────────────────────────────

/**
 * Combines the citizen identity `postNames + surName` into the display
 * name used across signature rows and audit entries. Falls back to the
 * email when the user has no citizen identity attached (e.g. seed data
 * or in-progress identity verification).
 */
export function buildSignerDisplayName(input: {
  postNames: string | null | undefined;
  surName: string | null | undefined;
  fallback: string;
}): string {
  const composed = `${input.postNames ?? ''} ${input.surName ?? ''}`.trim();
  return composed || input.fallback;
}

// ─── Status derivation ──────────────────────────────────────────────────────

/**
 * A signature is REVOKED whenever the certificate is revoked or its key
 * pair has been deactivated (e.g. after rotation). Anything else is
 * ACTIVE. Expired certificates are still treated as ACTIVE here because
 * the frontend type only models ACTIVE/REVOKED — expiry has its own
 * dedicated treatment on the certificates dashboard.
 */
export function deriveSignatureStatusFromRow(
  row: Pick<SignatureCertificateRow, 'isRevoked' | 'keyPair'>,
): AdminSignatureStatus {
  if (row.isRevoked) return 'REVOKED';
  if (!row.keyPair.isActive) return 'REVOKED';
  return 'ACTIVE';
}

// ─── List item formatter ────────────────────────────────────────────────────

/**
 * Projects a Prisma certificate row into the `SignatureListItem` shape
 * consumed by the admin frontend's signatures table.
 */
export function buildSignatureListItem(
  row: SignatureCertificateRow,
): SignatureListItem {
  const displayName = buildSignerDisplayName({
    postNames: row.user.citizenIdentity?.postNames,
    surName: row.user.citizenIdentity?.surName,
    fallback: row.user.email,
  });

  // Most recent signed-document timestamp is "last used"; the count of
  // signed documents drives the "Signed" column.
  const lastSignedAt = row.signedDocs[0]?.signedAt ?? null;
  const documentsSigned = row._count.signedDocs;

  return {
    signatureId: row.id,
    userId: row.userId,
    userName: displayName,
    userEmail: row.user.email,
    algorithm: row.keyPair.algorithm,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: lastSignedAt ? lastSignedAt.toISOString() : null,
    documentsSigned,
    status: deriveSignatureStatusFromRow(row),
  };
}

// ─── Detail formatter ───────────────────────────────────────────────────────

/**
 * Projects a Prisma certificate row + the matching audit slice into the
 * full `SignatureDetailResponse` shape used by the signature detail page.
 *
 * Surfaces the user's active handwritten signature image (if any) so the
 * dashboard can render a preview alongside the cert metadata.
 */
export function buildSignatureDetail(
  row: SignatureCertificateRow,
  auditRows: SignatureAuditRow[],
): SignatureDetailResponse {
  const displayName = buildSignerDisplayName({
    postNames: row.user.citizenIdentity?.postNames,
    surName: row.user.citizenIdentity?.surName,
    fallback: row.user.email,
  });
  const lastSignedAt = row.signedDocs[0]?.signedAt ?? null;
  const documentsSigned = row._count.signedDocs;
  const activeImage = row.user.personalSignatureImages[0] ?? null;

  return {
    signatureId: row.id,
    userId: row.userId,
    userName: displayName,
    userEmail: row.user.email,
    userImageUrl: row.user.imageUrl,
    algorithm: row.keyPair.algorithm,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: lastSignedAt ? lastSignedAt.toISOString() : null,
    status: deriveSignatureStatusFromRow(row),
    documentsSigned,
    signatureImage: activeImage
      ? {
          imageId: activeImage.id,
          s3Key: activeImage.s3Key,
          mimeType: activeImage.mimeType,
          sizeBytes: activeImage.sizeBytes,
        }
      : null,
    auditLog: auditRows.map((entry) => formatSignatureAuditEntry(entry)),
  };
}

/** Sanitises one audit row into the `SignatureAuditItem` shape. */
function formatSignatureAuditEntry(entry: SignatureAuditRow): SignatureAuditItem {
  // Admins use firstName/lastName directly (no citizenIdentity join), so
  // map them through the same display-name builder for consistent output.
  const actorName = buildSignerDisplayName({
    postNames: entry.admin?.firstName,
    surName: entry.admin?.lastName,
    fallback: 'Unknown admin',
  });

  return {
    id: entry.id,
    action: entry.action,
    actorName,
    actorRole: entry.admin?.role ?? AdminRole.ADMIN,
    createdAt: entry.createdAt.toISOString(),
    metadata: sanitizeAuditMetadata(entry.metadata),
  };
}

/**
 * Allow-list scrub of the audit metadata JSON blob — only string/number/
 * boolean/null primitives survive, so we never accidentally leak nested
 * objects with sensitive context out to the dashboard.
 */
function sanitizeAuditMetadata(
  metadata: Prisma.JsonValue | null,
): Record<string, string | number | boolean | null> | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

// ─── Signed documents formatter ─────────────────────────────────────────────

/** Row shape returned by the signed-documents Prisma query. */
type SignedDocumentRow = {
  id: string;
  documentName: string;
  documentHash: string;
  signedAt: Date;
  metadata: Prisma.JsonValue | null;
};

/**
 * Projects a signed-document row into the `SignatureSignedDocumentItem`
 * shape consumed by the per-signature documents drilldown table.
 *
 * The frontend type carries `verificationStatus` and `documentSource`
 * fields. We do not yet store either explicitly — return safe defaults
 * here so the table stays type-consistent until that data is wired in.
 */
export function formatSignatureSignedDocument(
  row: SignedDocumentRow,
): SignatureSignedDocumentItem {
  return {
    documentId: row.id,
    documentHash: row.documentHash,
    documentName: row.documentName,
    signedAt: row.signedAt.toISOString(),
    verificationStatus: 'UNKNOWN',
    documentSource: extractDocumentSource(row.metadata) ?? 'personal',
  };
}

/**
 * Reads the optional `source` field off a signed document's metadata blob.
 * Only string values are accepted — anything else is treated as missing.
 */
function extractDocumentSource(
  metadata: Prisma.JsonValue | null,
): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const source = (metadata as Record<string, unknown>)['source'];
  return typeof source === 'string' ? source : null;
}
