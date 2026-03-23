import { AdminRole } from '@prisma/client';

// Paginated user list item — lightweight, no sensitive data
export interface AdminUserListItem {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  isVerified: boolean;
  isIdVerified: boolean;
  createdAt: Date;
}

// Full user detail — returned by GET /users/:id
export interface AdminUserDetail {
  // Personal
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  imageUrl: string | null;

  // Identity — NID/PID masked for ADMIN, full for SUPER_ADMIN
  nid: string; // "••••••••••••0056" for ADMIN, full for SUPER_ADMIN
  pid: string; // same masking rule
  nidDecrypted: boolean; // true = full value shown, false = masked
  dateOfBirth: Date | null;
  sex: string | null;
  countryOfBirth: string | null;

  // Account status
  isActive: boolean;
  isVerified: boolean;
  isIdVerified: boolean;
  idVerifiedAt: Date | null;
  verificationAttempts: number;
  createdAt: Date;
  updatedAt: Date;

  // Last 5 verification attempts
  verifications: VerificationSummary[];

  // Active sessions
  sessions: SessionSummary[];

  // Last 10 security events
  securityEvents: SecurityEventSummary[];

  // Last 5 admin actions on this user
  auditHistory: AuditSummary[];
}

export interface VerificationSummary {
  id: string;
  attemptNumber: number;
  documentMatch: boolean;
  faceScore: number;
  livenessScore: number;
  compositeScore: number;
  passed: boolean;
  failReason: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

export interface SessionSummary {
  id: string;
  tokenType: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface SecurityEventSummary {
  id: string;
  eventType: string;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditSummary {
  id: string;
  action: string;
  adminId: string;
  adminName: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}

// Paginated list response
export interface PaginatedUsers {
  data: AdminUserListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  // Warning shown when the table is large enough for offset to slow down
  performanceWarning?: string;
}
