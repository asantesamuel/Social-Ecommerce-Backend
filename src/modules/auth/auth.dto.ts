/**
 * @minLength 2
 * @maxLength 50
 * @pattern ^[a-zA-Z\s'-]+$
 */
export type PersonName = string;

/**
 * @minLength 8
 * @maxLength 64
 * @pattern ^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#])[A-Za-z\d@$!%*?&^#]{8,}$
 */
export type StrongPassword = string;

export interface RegisterDto {
  /** @format email */
  email: string;

  password: StrongPassword;

  /**
   * @minLength 2
   * @maxLength 50
   * @pattern ^[a-zA-Z\s'-]+$
   */
  firstName: string;

  /**
   * @minLength 2
   * @maxLength 50
   * @pattern ^[a-zA-Z\s'-]+$
   */
  lastName: string;

  /** Optional role override */
  role?: 'customer' | 'vendor';

  /** Required if role is vendor */
  companyName?: string;

  /** Required if role is vendor */
  companyEstablishedDate?: Date;
}

export interface LoginDto {
  /** @format email */
  email: string;

  /** @minLength 1 */
  password: string;
}

export interface RefreshTokenDto {
  /** @minLength 1 */
  refreshToken: string;
}

export interface UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: UserResponseDto;
}

export interface MessageResponseDto {
  message: string;
}

export interface RefreshResponseDto {
  accessToken: string;
  refreshToken: string;
}

export type AuthHandoffClientIdDto =
  | 'admin-dashboard'
  | 'vendor-dashboard';

export interface AuthorizeAuthHandoffDto {
  clientId: AuthHandoffClientIdDto;

  /**
   * @minLength 16
   * @maxLength 256
   * @pattern ^[A-Za-z0-9._~-]+$
   */
  state: string;

  /**
   * @minLength 43
   * @maxLength 43
   * @pattern ^[A-Za-z0-9_-]+$
   */
  codeChallenge: string;

  codeChallengeMethod: 'S256';
}

export interface AuthorizeAuthHandoffResponseDto {
  /** Exact registered dashboard callback containing only code and state. */
  redirectUrl: string;
  expiresIn: number;
}

export interface ExchangeAuthHandoffDto {
  clientId: AuthHandoffClientIdDto;

  /** @minLength 1 */
  code: string;

  /**
   * @minLength 43
   * @maxLength 128
   * @pattern ^[A-Za-z0-9\-._~]+$
   */
  codeVerifier: string;
}
