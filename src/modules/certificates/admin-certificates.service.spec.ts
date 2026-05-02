import { ConflictException } from '@nestjs/common';
import {
  CertificateAccessPolicyStatus,
  CertificateRequestStatus,
  IdentityType,
  PersonalKeyAlgorithm,
} from '@prisma/client';
import { AdminCertificatesService } from './admin-certificates.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuditService } from '../../common/audit/audit.service';
import type { SignatureServiceClient } from './signature-service.client';

function buildRequestRow(status: CertificateRequestStatus) {
  return {
    id: 'request-1',
    userId: 'user-1',
    keyPairId: 'key-1',
    status,
    requestedValidityYears: 2,
    reviewReason: status === 'APPROVED' ? 'Reviewed and approved.' : null,
    cancellationReason: null,
    reviewedByAdminId: status === 'APPROVED' ? 'admin-1' : null,
    reviewedAt: status === 'APPROVED' ? new Date('2026-04-28T10:00:00.000Z') : null,
    cancelledAt: null,
    issuedCertificateId: status === 'APPROVED' ? 'cert-1' : null,
    createdAt: new Date('2026-04-27T10:00:00.000Z'),
    updatedAt: new Date('2026-04-28T10:00:00.000Z'),
    user: {
      email: 'patrick@example.com',
      imageUrl: null,
      personalCertificateAccessPolicy: null,
      citizenIdentity: {
        surName: 'Ishimwe',
        postNames: 'Patrick',
        identityType: IdentityType.FIN,
      },
    },
    keyPair: {
      algorithm: PersonalKeyAlgorithm.RSA_2048,
      fingerprint: 'fingerprint-1',
      createdAt: new Date('2026-04-20T10:00:00.000Z'),
    },
  };
}

function buildCertificateRow(isRevoked = false) {
  return {
    id: 'cert-1',
    userId: 'user-1',
    serialNumber: 'SERIAL-1',
    subjectCN: 'Patrick Ishimwe',
    subjectO: 'ID Verification Platform',
    subjectC: 'RW',
    subjectUserId: '1199912345678901',
    notBefore: new Date('2026-04-01T00:00:00.000Z'),
    notAfter: new Date('2028-04-01T00:00:00.000Z'),
    certificatePem: '-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----',
    isRevoked,
    revokedAt: isRevoked ? new Date('2026-04-28T10:00:00.000Z') : null,
    revokedReason: isRevoked ? 'Already revoked.' : null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    user: {
      email: 'patrick@example.com',
      imageUrl: null,
      citizenIdentity: {
        surName: 'Ishimwe',
        postNames: 'Patrick',
      },
    },
    keyPair: {
      algorithm: PersonalKeyAlgorithm.RSA_2048,
    },
  };
}

describe('AdminCertificatesService', () => {
  let service: AdminCertificatesService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
    };
    personalCertificate: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    personalCertificateRequest: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    personalCertificateAccessPolicy: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let signatureServiceClient: {
    approveCertificateRequest: jest.Mock;
    rejectCertificateRequest: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      personalCertificate: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      personalCertificateRequest: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      personalCertificateAccessPolicy: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => {
        return callback(prisma);
      }),
    };
    audit = { log: jest.fn() };
    signatureServiceClient = {
      approveCertificateRequest: jest.fn(),
      rejectCertificateRequest: jest.fn(),
    };

    service = new AdminCertificatesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      signatureServiceClient as unknown as SignatureServiceClient,
    );
  });

  it('lists certificate requests with paginated items', async () => {
    prisma.personalCertificateRequest.count.mockResolvedValue(1);
    prisma.personalCertificateRequest.findMany.mockResolvedValue([
      buildRequestRow(CertificateRequestStatus.PENDING),
    ]);

    const result = await service.listCertificateRequests({
      page: 1,
      limit: 20,
      status: 'PENDING',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.requestId).toBe('request-1');
    expect(result.items[0]?.status).toBe('PENDING');
  });

  it('approves a pending certificate request and writes audit state', async () => {
    prisma.personalCertificateRequest.findUnique
      .mockResolvedValueOnce(buildRequestRow(CertificateRequestStatus.PENDING))
      .mockResolvedValueOnce(buildRequestRow(CertificateRequestStatus.APPROVED));
    signatureServiceClient.approveCertificateRequest.mockResolvedValue({
      id: 'cert-1',
    });

    const result = await service.approveCertificateRequest({
      requestId: 'request-1',
      adminId: 'admin-1',
      ipAddress: '127.0.0.1',
      dto: { reason: 'Identity evidence and key ownership were reviewed.' },
    });

    expect(signatureServiceClient.approveCertificateRequest).toHaveBeenCalledWith(
      'request-1',
      {
        adminId: 'admin-1',
        reason: 'Identity evidence and key ownership were reviewed.',
      },
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATE_REQUEST_APPROVED',
        targetUserId: 'user-1',
      }),
    );
    expect(result.status).toBe('APPROVED');
  });

  it('rejects a pending certificate request and writes audit state', async () => {
    prisma.personalCertificateRequest.findUnique
      .mockResolvedValueOnce(buildRequestRow(CertificateRequestStatus.PENDING))
      .mockResolvedValueOnce({
        ...buildRequestRow(CertificateRequestStatus.REJECTED),
        reviewReason: 'Missing supporting verification evidence.',
      });

    const result = await service.rejectCertificateRequest({
      requestId: 'request-1',
      adminId: 'admin-1',
      ipAddress: '127.0.0.1',
      dto: { reason: 'Missing supporting verification evidence.' },
    });

    expect(signatureServiceClient.rejectCertificateRequest).toHaveBeenCalledWith(
      'request-1',
      {
        adminId: 'admin-1',
        reason: 'Missing supporting verification evidence.',
      },
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATE_REQUEST_REJECTED',
        targetUserId: 'user-1',
      }),
    );
    expect(result.status).toBe('REJECTED');
  });

  it('rejects review attempts for non-pending requests', async () => {
    prisma.personalCertificateRequest.findUnique.mockResolvedValue(
      buildRequestRow(CertificateRequestStatus.APPROVED),
    );

    await expect(
      service.approveCertificateRequest({
        requestId: 'request-1',
        adminId: 'admin-1',
        ipAddress: '127.0.0.1',
        dto: { reason: 'Already reviewed request should not be re-approved.' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('bans certificate access from a certificate and writes audit state', async () => {
    prisma.personalCertificate.findUnique
      .mockResolvedValueOnce(buildCertificateRow(false))
      .mockResolvedValueOnce(buildCertificateRow(true));

    const result = await service.banCertificateAccessFromCertificate({
      certificateId: 'cert-1',
      adminId: 'admin-1',
      ipAddress: '127.0.0.1',
      dto: {
        reason:
          'Repeated unauthorized signing attempts require manual trust review.',
      },
    });

    expect(prisma.personalCertificate.update).toHaveBeenCalledWith({
      where: { id: 'cert-1' },
      data: expect.objectContaining({
        isRevoked: true,
        revokedReason:
          'Certificate access banned by admin: Repeated unauthorized signing attempts require manual trust review.',
      }),
    });
    expect(prisma.personalCertificateAccessPolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({
          status: CertificateAccessPolicyStatus.BANNED,
        }),
      }),
    );
    expect(prisma.personalCertificateRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          status: CertificateRequestStatus.PENDING,
        },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATE_ACCESS_BANNED',
        targetUserId: 'user-1',
      }),
    );
    expect(result.status).toBe('REVOKED');
  });

  it('bans certificate access by user without requiring an active certificate', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.personalCertificate.findFirst.mockResolvedValue(null);
    prisma.personalCertificateAccessPolicy.findUnique.mockResolvedValue({
      status: CertificateAccessPolicyStatus.BANNED,
      banReason: 'Manual trust review is required before future issuance.',
      bannedAt: new Date('2026-04-28T10:00:00.000Z'),
      unbanReason: null,
      unbannedAt: null,
      updatedAt: new Date('2026-04-28T10:00:00.000Z'),
    });

    const result = await service.banCertificateAccessForUser({
      userId: 'user-1',
      adminId: 'admin-1',
      ipAddress: '127.0.0.1',
      dto: {
        reason: 'Manual trust review is required before future issuance.',
      },
    });

    expect(prisma.personalCertificateAccessPolicy.upsert).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATE_ACCESS_BANNED',
        targetUserId: 'user-1',
      }),
    );
    expect(result.isBanned).toBe(true);
  });

  it('lifts certificate access bans and writes audit state', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.personalCertificateAccessPolicy.findUnique
      .mockResolvedValueOnce({
        status: CertificateAccessPolicyStatus.BANNED,
        banReason: 'Manual trust review was required.',
        bannedAt: new Date('2026-04-28T10:00:00.000Z'),
        unbanReason: null,
        unbannedAt: null,
        updatedAt: new Date('2026-04-28T10:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        status: CertificateAccessPolicyStatus.ALLOWED,
        banReason: 'Manual trust review was required.',
        bannedAt: new Date('2026-04-28T10:00:00.000Z'),
        unbanReason: 'Trust review completed and access restored.',
        unbannedAt: new Date('2026-04-29T10:00:00.000Z'),
        updatedAt: new Date('2026-04-29T10:00:00.000Z'),
      });

    const result = await service.liftCertificateAccessBan({
      userId: 'user-1',
      adminId: 'admin-1',
      ipAddress: '127.0.0.1',
      dto: {
        reason: 'Trust review completed and access restored.',
      },
    });

    expect(prisma.personalCertificateAccessPolicy.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: expect.objectContaining({
        status: CertificateAccessPolicyStatus.ALLOWED,
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATE_ACCESS_BAN_LIFTED',
        targetUserId: 'user-1',
      }),
    );
    expect(result.isBanned).toBe(false);
  });
});
