// Pure helpers for the admin certificates module.
//
// Side-effect free: takes Prisma rows in, returns the public shape consumed
// by the admin frontend's certificate pages. PEM-related conversions
// (fingerprint, DER) live here too because they're pure transformations
// over the certificate body.
import * as crypto from 'crypto';
import {
  CertificateAccessPolicyStatus,
  PersonalKeyAlgorithm,
} from '@prisma/client';
import type {
  AdminCertificateIdentityType,
  AdminCertificateStatusFilter,
} from '../dto/query-certificates.dto';

/** Public-facing certificate status as rendered by the admin dashboard. */
export type AdminCertificateStatus = AdminCertificateStatusFilter;

/** Window (in days) considered "expiring soon" by the dashboard filter. */
export const CERTIFICATE_EXPIRING_SOON_DAYS = 30;

/**
 * Canonical row shape selected by the certificates service. Co-located here
 * so the helper has a stable, narrow type to project against.
 */
export type CertificateRow = {
  id: string;
  userId: string;
  serialNumber: string;
  subjectCN: string;
  subjectO: string;
  subjectC: string;
  subjectUserId: string;
  notBefore: Date;
  notAfter: Date;
  certificatePem: string;
  isRevoked: boolean;
  revokedAt: Date | null;
  revokedReason: string | null;
  createdAt: Date;
  user: {
    email: string;
    imageUrl: string | null;
    personalCertificateAccessPolicy: {
      status: CertificateAccessPolicyStatus;
      banReason: string | null;
      bannedAt: Date | null;
      unbanReason: string | null;
      unbannedAt: Date | null;
      updatedAt: Date;
    } | null;
    citizenIdentity: { surName: string; postNames: string } | null;
  };
  keyPair: {
    algorithm: PersonalKeyAlgorithm;
  };
};

function isFinIdentifier(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^2\d{15}$/.test(value);
}

// ─── Status / identity-type derivation ──────────────────────────────────────

/**
 * Derives the public certificate status from the persisted row + the
 * current time. REVOKED wins over EXPIRED — a revoked-then-expired cert
 * is still REVOKED on the dashboard.
 */
export function deriveCertificateStatus(
  row: Pick<CertificateRow, 'isRevoked' | 'notAfter'>,
  now: Date = new Date(),
): AdminCertificateStatus {
  if (row.isRevoked) return 'REVOKED';
  if (row.notAfter.getTime() <= now.getTime()) return 'EXPIRED';
  return 'ACTIVE';
}

/**
 * Derives the identity type from the joined user record. Users with a
 * citizen identity are NID holders; everyone else (currently the foreign
 * identity flow) maps to FIN.
 */
export function deriveCertificateIdentityType(
  row: Pick<CertificateRow, 'subjectUserId'>,
): AdminCertificateIdentityType {
  return isFinIdentifier(row.subjectUserId) ? 'FIN' : 'NID';
}

/**
 * Days remaining until `notAfter`, floored to whole days. Negative for
 * already-expired certs. Used both for the "Days Left" column and for the
 * `expiringSoon` filter.
 */
export function computeDaysToExpiry(
  notAfter: Date,
  now: Date = new Date(),
): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((notAfter.getTime() - now.getTime()) / msPerDay);
}

// ─── Display helpers ────────────────────────────────────────────────────────

function buildSignerDisplayName(input: {
  postNames: string | null | undefined;
  surName: string | null | undefined;
  fallback: string;
}): string {
  const composed = `${input.postNames ?? ''} ${input.surName ?? ''}`.trim();
  return composed || input.fallback;
}

// ─── List item formatter ────────────────────────────────────────────────────

/**
 * Projects a Prisma row into the `CertificateListItem` shape consumed by
 * the admin frontend's certificates table.
 */
export function buildCertificateListItem(row: CertificateRow, now: Date = new Date()) {
  const userName = buildSignerDisplayName({
    postNames: row.user.citizenIdentity?.postNames,
    surName: row.user.citizenIdentity?.surName,
    fallback: row.user.email,
  });

  return {
    certificateId: row.id,
    userId: row.userId,
    userName,
    identityType: deriveCertificateIdentityType(row),
    country: row.subjectC,
    issuedAt: row.createdAt.toISOString(),
    expiresAt: row.notAfter.toISOString(),
    daysToExpiry: computeDaysToExpiry(row.notAfter, now),
    status: deriveCertificateStatus(row, now),
  };
}

// ─── Detail formatter ───────────────────────────────────────────────────────

/**
 * Projects a Prisma row into the `CertificateDetail` shape — including the
 * PEM body, parsed DN built from persisted columns (no PEM parsing needed),
 * SHA-256 fingerprint, and key algorithm/size derived from the joined key
 * pair.
 */
export function buildCertificateDetail(row: CertificateRow, now: Date = new Date()) {
  const userName = buildSignerDisplayName({
    postNames: row.user.citizenIdentity?.postNames,
    surName: row.user.citizenIdentity?.surName,
    fallback: row.user.email,
  });

  const dn = {
    commonName: row.subjectCN,
    organization: row.subjectO,
    organizationalUnit: null,
    country: row.subjectC,
    serialNumber: row.serialNumber,
    subjectUserId: row.subjectUserId,
  };

  return {
    certificateId: row.id,
    userId: row.userId,
    userName,
    userEmail: row.user.email,
    userImageUrl: row.user.imageUrl,
    identityType: deriveCertificateIdentityType(row),
    serialNumber: row.serialNumber,
    issuer: dn, // self-signed today — issuer is the same DN
    subject: dn,
    keyAlgorithm: row.keyPair.algorithm,
    keySize: deriveKeySize(row.keyPair.algorithm),
    fingerprintSha256: computeCertificateFingerprintSha256(row.certificatePem),
    certificatePem: row.certificatePem,
    issuedAt: row.createdAt.toISOString(),
    notBefore: row.notBefore.toISOString(),
    notAfter: row.notAfter.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    revokedReason: row.revokedReason,
    status: deriveCertificateStatus(row, now),
    certificateAccessPolicy: buildCertificateAccessPolicy(row),
  };
}

function buildCertificateAccessPolicy(row: CertificateRow) {
  const policy = row.user.personalCertificateAccessPolicy;

  if (!policy) {
    return {
      status: CertificateAccessPolicyStatus.ALLOWED,
      isBanned: false,
      banReason: null,
      bannedAt: null,
      unbanReason: null,
      unbannedAt: null,
      updatedAt: null,
    };
  }

  return {
    status: policy.status,
    isBanned: policy.status === CertificateAccessPolicyStatus.BANNED,
    banReason: policy.banReason,
    bannedAt: policy.bannedAt?.toISOString() ?? null,
    unbanReason: policy.unbanReason,
    unbannedAt: policy.unbannedAt?.toISOString() ?? null,
    updatedAt: policy.updatedAt.toISOString(),
  };
}

/** Maps the algorithm enum to a key size (bits) for display. */
function deriveKeySize(algorithm: PersonalKeyAlgorithm): number | null {
  if (algorithm === 'RSA_2048') return 2048;
  if (algorithm === 'ED25519') return 256;
  return null;
}

// ─── PEM ↔ DER conversion + fingerprint ────────────────────────────────────

/** Strips the BEGIN/END markers + whitespace from a PEM body. */
function stripPemBody(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
}

/**
 * Converts a PEM-encoded certificate to its raw DER bytes. Cheap base64
 * decode of the PEM body — no third-party crypto library required.
 *
 * @throws Error when the body is not valid base64.
 */
export function certificatePemToDer(pem: string): Buffer {
  const body = stripPemBody(pem);
  if (!body) {
    throw new Error('Certificate PEM body is empty.');
  }
  return Buffer.from(body, 'base64');
}

/**
 * Computes the colon-separated SHA-256 fingerprint of a PEM-encoded
 * certificate, matching the format displayed by OpenSSL and most CA tools.
 */
export function computeCertificateFingerprintSha256(pem: string): string {
  const der = certificatePemToDer(pem);
  const digest = crypto.createHash('sha256').update(der).digest('hex').toUpperCase();
  // Insert ":" every two hex chars for human-readable display.
  return digest.match(/.{2}/g)?.join(':') ?? digest;
}
