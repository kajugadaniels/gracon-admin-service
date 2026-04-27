import { ConflictException } from '@nestjs/common';
import {
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

describe('AdminCertificatesService', () => {
  let service: AdminCertificatesService;
  let prisma: {
    personalCertificateRequest: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };
  let signatureServiceClient: {
    approveCertificateRequest: jest.Mock;
    rejectCertificateRequest: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      personalCertificateRequest: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
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
});
