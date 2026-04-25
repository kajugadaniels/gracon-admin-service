// Pure helpers for the admin signatures module.
//
// Everything in this file is side-effect free so it can be unit-tested in
// isolation from Prisma. The service layer feeds in raw Prisma rows, the
// helpers return the public shape consumed by the admin frontend.
import { AdminRole, Prisma } from '@prisma/client';

/** Public-facing signature status as rendered by the admin dashboard. */
export type AdminSignatureStatus = 'ACTIVE' | 'REVOKED';

/**
 * Canonical shape of the rows returned by the centralised Prisma select in
 * `admin-signatures.service.ts`. Keeping this in one place means the helpers
 * never accept a wider type than the service actually selects.
 */
export type SignatureKeyPairRow = {
  id: string;
  userId: string;
  algorithm: 'RSA_2048' | 'ED25519';
  isActive: boolean;
  createdAt: Date;
  user: {
    email: string;
    imageUrl: string | null;
    citizenIdentity: {
      surName: string;
      postNames: string;
    } | null;
  };
  personalCertificate: {
    id: string;
    isRevoked: boolean;
    revokedAt: Date | null;
    revokedReason: string | null;
    notAfter: Date;
    _count: { signedDocs: number };
    signedDocs: { signedAt: Date }[];
  } | null;
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

// ─── Display name helpers ───────────────────────────────────────────────────

/**
 * Combines the `postNames + surName` citizen identity fields into the
 * display name shown on signatures and audit entries. Falls back to the
 * email when no identity is attached (e.g. during local seed data).
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
 * Returns ACTIVE when both the key pair is active and its certificate (if
 * any) is not revoked. Anything else is REVOKED — that includes a
 * deactivated key pair without a certificate, which can happen if the user
 * rotated their keys before issuing one.
 */
export function deriveSignatureStatusFromRow(
  row: SignatureKeyPairRow,
): AdminSignatureStatus {
  if (!row.isActive) return 'REVOKED';
  if (row.personalCertificate?.isRevoked) return 'REVOKED';
  return 'ACTIVE';
}

// ─── List item formatter ────────────────────────────────────────────────────

/**
 * Projects a Prisma row into the `SignatureListItem` shape consumed by the
 * admin frontend's signatures table.
 */
export function buildSignatureListItem(row: SignatureKeyPairRow) {
  const displayName = buildSignerDisplayName({
    postNames: row.user.citizenIdentity?.postNames,
    surName: row.user.citizenIdentity?.surName,
    fallback: row.user.email,
  });

  // The most recent signed-document timestamp is "last used"; the count of
  // signed documents drives the "Signed" column.
  const lastSignedAt = row.personalCertificate?.signedDocs[0]?.signedAt ?? null;
  const documentsSigned = row.personalCertificate?._count.signedDocs ?? 0;

  return {
    signatureId: row.id,
    userId: row.userId,
    userName: displayName,
    userEmail: row.user.email,
    algorithm: row.algorithm,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: lastSignedAt ? lastSignedAt.toISOString() : null,
    documentsSigned,
    status: deriveSignatureStatusFromRow(row),
  };
}

// ─── Detail formatter ───────────────────────────────────────────────────────

/**
 * Projects a Prisma row + the admin audit slice into the `SignatureDetail`
 * shape consumed by the signature detail page on the admin frontend.
 */
export function buildSignatureDetail(
  row: SignatureKeyPairRow,
  auditRows: SignatureAuditRow[],
) {
  const displayName = buildSignerDisplayName({
    postNames: row.user.citizenIdentity?.postNames,
    surName: row.user.citizenIdentity?.surName,
    fallback: row.user.email,
  });
  const lastSignedAt = row.personalCertificate?.signedDocs[0]?.signedAt ?? null;
  const documentsSigned = row.personalCertificate?._count.signedDocs ?? 0;

  return {
    signatureId: row.id,
    userId: row.userId,
    userName: displayName,
    userEmail: row.user.email,
    userImageUrl: row.user.imageUrl,
    algorithm: row.algorithm,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: lastSignedAt ? lastSignedAt.toISOString() : null,
    status: deriveSignatureStatusFromRow(row),
    documentsSigned,
    auditLog: auditRows.map((entry) => formatSignatureAuditEntry(entry)),
  };
}

/** Sanitises one audit row into the `SignatureAuditItem` shape. */
function formatSignatureAuditEntry(entry: SignatureAuditRow) {
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
    actorRole: entry.admin?.role ?? 'ADMIN',
    createdAt: entry.createdAt.toISOString(),
    metadata: sanitizeAuditMetadata(entry.metadata),
  };
}

/**
 * Allow-list scrub of the audit metadata JSON blob — only string/number/
 * boolean/null primitives survive, so we never accidentally leak a nested
 * object containing sensitive context to the client.
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
 * Projects a signed-document row into the `SignatureDocumentItem` shape
 * consumed by the per-signature documents drill-down table.
 *
 * The frontend type carries a `verificationStatus` and `documentSource`
 * field. We do not yet store either explicitly — return safe defaults here
 * so the table stays type-consistent until that data is wired in.
 */
export function formatSignatureSignedDocument(row: SignedDocumentRow) {
  return {
    documentId: row.id,
    documentHash: row.documentHash,
    documentName: row.documentName,
    signedAt: row.signedAt.toISOString(),
    verificationStatus: 'UNKNOWN' as const,
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
