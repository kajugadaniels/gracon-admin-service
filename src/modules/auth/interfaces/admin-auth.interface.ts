import { AdminRole } from '@gracon/database';

// JWT payload stored inside the admin access token
export interface AdminJwtPayload {
  sub: string; // adminId
  email: string;
  role: AdminRole;
  type: 'admin'; // constant — rejects user tokens
  iat?: number;
  exp?: number;
}

// Token pair returned on login and refresh
export interface AdminAuthTokens {
  accessToken: string; // 8-hour JWT
  refreshToken: string; // 24-hour random hex — hashed in DB
}

// Full login response returned to the admin frontend
export interface AdminLoginResult {
  success: boolean;
  message: string;
  data: {
    accessToken: string;
    refreshToken: string;
    admin: SafeAdminProfile;
  };
}

// Safe admin shape — never includes passwordHash
export interface SafeAdminProfile {
  adminId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  role: AdminRole;
  createdAt: Date;
}
