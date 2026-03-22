// EncryptionService — identical logic to api/auth/.
// Uses the same ENCRYPTION_SECRET so this service can decrypt
// NIDs and PIDs that were encrypted by the auth service.
// If the secrets differ, decryption will produce garbage — .env must match.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly secretKey: Buffer;

  constructor(private readonly config: ConfigService) {
    const secret = this.config.get<string>('ENCRYPTION_SECRET');
    // Hash the secret to guarantee exactly 32 bytes for AES-256
    this.secretKey = crypto.createHash('sha256').update(secret).digest();
  }

  /**
   * Encrypts plain text using AES-256-CBC.
   * Returns "ivHex:encryptedHex" — IV is random per call so identical
   * inputs produce different ciphertext (prevents pattern detection).
   */
  encrypt(plainText: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypts a value that was encrypted by this service or api/auth/.
   * Requires the same ENCRYPTION_SECRET — will throw if secrets differ.
   */
  decrypt(encryptedText: string): string {
    const [ivHex, encryptedHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.secretKey,
      iv,
    );
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  /**
   * SHA-256 one-way hash — used for token storage and lookup.
   */
  hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Constant-time hash comparison — prevents timing attacks.
   */
  compareHash(plainValue: string, storedHash: string): boolean {
    const hashed = this.hash(plainValue);
    return crypto.timingSafeEqual(
      Buffer.from(hashed, 'hex'),
      Buffer.from(storedHash, 'hex'),
    );
  }

  /**
   * Masks a sensitive value — shows only the last N characters.
   * Used when ADMIN role views a NID or PID (only SUPER_ADMIN gets full value).
   * Example: maskValue("1193270010390056", 4) → "************0056"
   */
  maskValue(value: string, visibleChars: number = 4): string {
    if (value.length <= visibleChars) return value;
    return '•'.repeat(value.length - visibleChars) + value.slice(-visibleChars);
  }
}
