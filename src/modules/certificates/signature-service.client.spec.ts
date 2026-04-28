import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SignatureServiceClient } from './signature-service.client';

describe('SignatureServiceClient', () => {
  const originalFetch = global.fetch;

  function createClient() {
    return new SignatureServiceClient({
      get: (key: string) => {
        const values: Record<string, string> = {
          SIGNATURE_SERVICE_URL: 'http://localhost:3002/api/v1',
          SIGNATURE_SERVICE_USERNAME: 'service.signature-admin@gracon.local',
          SIGNATURE_SERVICE_PASSWORD: 'strong-password',
        };

        return values[key];
      },
    } as never);
  }

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns json for successful approvals', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ id: 'cert-1' }),
    }) as never;

    const client = createClient();
    await expect(
      client.approveCertificateRequest('request-1', {
        adminId: 'admin-1',
        reason: 'Identity evidence and ownership were reviewed.',
      }),
    ).resolves.toEqual({ id: 'cert-1' });
  });

  it('maps 400 responses to bad request exceptions', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({ message: 'Request is not reviewable.' }),
    }) as never;

    const client = createClient();
    await expect(
      client.rejectCertificateRequest('request-1', {
        adminId: 'admin-1',
        reason: 'Rejecting an invalid request state.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps 404 responses to not found exceptions', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: jest.fn(),
    }) as never;

    const client = createClient();
    await expect(
      client.approveCertificateRequest('request-1', {
        adminId: 'admin-1',
        reason: 'Approving a missing request should fail.',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps 409 responses to conflict exceptions', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: jest.fn().mockResolvedValue({
        message: 'Only pending certificate requests can be reviewed.',
      }),
    }) as never;

    const client = createClient();
    await expect(
      client.approveCertificateRequest('request-1', {
        adminId: 'admin-1',
        reason: 'Attempted duplicate review.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps 401 and 403 responses to internal auth bridge failures', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn(),
    }) as never;

    const client = createClient();
    await expect(
      client.approveCertificateRequest('request-1', {
        adminId: 'admin-1',
        reason: 'Testing internal credential failure handling.',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('maps 5xx responses to service unavailable exceptions', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn(),
    }) as never;

    const client = createClient();
    await expect(
      client.approveCertificateRequest('request-1', {
        adminId: 'admin-1',
        reason: 'Testing signature service outage handling.',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps network failures to service unavailable exceptions', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('socket hang up')) as never;

    const client = createClient();
    await expect(
      client.rejectCertificateRequest('request-1', {
        adminId: 'admin-1',
        reason: 'Testing transport failure handling.',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
