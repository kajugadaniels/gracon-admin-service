import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type ReviewRequestPayload = {
  adminId: string;
  reason: string;
};

@Injectable()
export class SignatureServiceClient {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.requireConfig('SIGNATURE_SERVICE_URL');
    this.authorization = this.buildAuthorizationHeader();
  }

  approveCertificateRequest(requestId: string, payload: ReviewRequestPayload) {
    return this.sendReviewRequest(requestId, 'approve', payload);
  }

  rejectCertificateRequest(requestId: string, payload: ReviewRequestPayload) {
    return this.sendReviewRequest(requestId, 'reject', payload);
  }

  private async sendReviewRequest(
    requestId: string,
    action: 'approve' | 'reject',
    payload: ReviewRequestPayload,
  ) {
    const response = await this.performRequest(requestId, action, payload);

    if (response.status === 404) {
      throw new NotFoundException('Certificate request not found.');
    }

    if (response.status >= 500) {
      throw new ServiceUnavailableException(
        'Signature service is currently unavailable. Please try again shortly.',
      );
    }

    if (!response.ok) {
      const message = await this.safeReadErrorMessage(response);
      throw new InternalServerErrorException(message);
    }

    return response.json();
  }

  private performRequest(
    requestId: string,
    action: 'approve' | 'reject',
    payload: ReviewRequestPayload,
  ) {
    return fetch(
      `${this.baseUrl}/internal/certificate-requests/${requestId}/${action}`,
      {
        method: 'POST',
        headers: {
          Authorization: this.authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    ).catch(() => {
      throw new ServiceUnavailableException(
        'Signature service is currently unavailable. Please try again shortly.',
      );
    });
  }

  private async safeReadErrorMessage(response: Response): Promise<string> {
    try {
      const data = (await response.json()) as { message?: string };
      return data.message ?? 'Signature service rejected the request.';
    } catch {
      return 'Signature service rejected the request.';
    }
  }

  private requireConfig(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new Error(`${key} must be set`);
    }

    return value;
  }

  private buildAuthorizationHeader(): string {
    const username = this.requireConfig('SIGNATURE_SERVICE_USERNAME');
    const password = this.requireConfig('SIGNATURE_SERVICE_PASSWORD');
    const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString(
      'base64',
    );

    return `Basic ${encoded}`;
  }
}
