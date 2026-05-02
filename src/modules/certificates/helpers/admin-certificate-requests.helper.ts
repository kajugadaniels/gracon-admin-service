import {
  CertificateAccessPolicyStatus,
  CertificateRequestStatus,
  PersonalKeyAlgorithm,
  type IdentityType,
} from '@prisma/client';

export type CertificateRequestRow = {
  id: string;
  userId: string;
  keyPairId: string;
  status: CertificateRequestStatus;
  requestedValidityYears: number;
  reviewReason: string | null;
  cancellationReason: string | null;
  reviewedByAdminId: string | null;
  reviewedAt: Date | null;
  cancelledAt: Date | null;
  issuedCertificateId: string | null;
  createdAt: Date;
  updatedAt: Date;
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
    citizenIdentity: {
      surName: string;
      postNames: string;
      identityType: IdentityType;
    } | null;
  };
  keyPair: {
    algorithm: PersonalKeyAlgorithm;
    fingerprint: string;
    createdAt: Date;
  };
};

function buildUserName(row: CertificateRequestRow): string {
  const identity = row.user.citizenIdentity;
  if (!identity) {
    return row.user.email;
  }

  return `${identity.postNames} ${identity.surName}`.trim() || row.user.email;
}

function buildIdentityType(row: CertificateRequestRow): IdentityType {
  return row.user.citizenIdentity?.identityType ?? 'NID';
}

export function buildCertificateRequestListItem(row: CertificateRequestRow) {
  return {
    requestId: row.id,
    userId: row.userId,
    userName: buildUserName(row),
    userEmail: row.user.email,
    identityType: buildIdentityType(row),
    status: row.status,
    requestedValidityYears: row.requestedValidityYears,
    keyAlgorithm: row.keyPair.algorithm,
    requestedAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    issuedCertificateId: row.issuedCertificateId,
    certificateAccessPolicy: buildCertificateAccessPolicy(row),
  };
}

export function buildCertificateRequestDetail(row: CertificateRequestRow) {
  return {
    requestId: row.id,
    userId: row.userId,
    userName: buildUserName(row),
    userEmail: row.user.email,
    userImageUrl: row.user.imageUrl,
    identityType: buildIdentityType(row),
    status: row.status,
    requestedValidityYears: row.requestedValidityYears,
    keyPairId: row.keyPairId,
    keyAlgorithm: row.keyPair.algorithm,
    keyFingerprint: row.keyPair.fingerprint,
    keyCreatedAt: row.keyPair.createdAt.toISOString(),
    reviewReason: row.reviewReason,
    cancellationReason: row.cancellationReason,
    reviewedByAdminId: row.reviewedByAdminId,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    issuedCertificateId: row.issuedCertificateId,
    requestedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    certificateAccessPolicy: buildCertificateAccessPolicy(row),
  };
}

function buildCertificateAccessPolicy(row: CertificateRequestRow) {
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
