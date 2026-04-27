// One-off DB inspection — replays the exact queries the admin service runs.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  // ── Mirror admin-signatures.service.listSignatures with no filters ──
  const sigSelect = {
    id: true,
    userId: true,
    algorithm: true,
    isActive: true,
    createdAt: true,
    user: {
      select: {
        email: true,
        imageUrl: true,
        citizenIdentity: { select: { surName: true, postNames: true } },
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
          orderBy: { signedAt: 'desc' },
          take: 1,
          select: { signedAt: true },
        },
      },
    },
  };

  const sigCount = await prisma.personalKeyPair.count({ where: {} });
  const sigRows = await prisma.personalKeyPair.findMany({
    where: {},
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: sigSelect,
  });
  console.log('SIGNATURES list count:', sigCount);
  console.log('SIGNATURES rows:', JSON.stringify(sigRows, null, 2));

  // ── Mirror admin-certificates.service.listCertificates with no filters ──
  const certSelect = {
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
        citizenIdentity: { select: { surName: true, postNames: true } },
      },
    },
    keyPair: { select: { algorithm: true } },
  };

  const certCount = await prisma.personalCertificate.count({ where: {} });
  const certRows = await prisma.personalCertificate.findMany({
    where: {},
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: certSelect,
  });
  console.log('CERTIFICATES list count:', certCount);
  console.log('CERTIFICATES rows:', JSON.stringify(certRows, null, 2));
} finally {
  await prisma.$disconnect();
}
