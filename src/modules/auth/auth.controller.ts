import {
  Controller,
  Route,
  Tags,
  Post,
  Body,
  SuccessResponse,
  Response,
  Request,
  Security,
} from 'tsoa';
import { Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  MessageResponseDto,
  RefreshResponseDto,
  AuthorizeAuthHandoffDto,
  AuthorizeAuthHandoffResponseDto,
  ExchangeAuthHandoffDto,
} from './auth.dto';
import { AppError } from '../../utils/AppError';
import { AuthHandoffService } from './auth-handoff.service';
import { logAuthHandoffSecurityEvent } from './auth-handoff.events';

@Route('auth')
@Tags('Auth')
export class AuthController extends Controller {
  private authService = new AuthService();

  /**
   * Register a new customer account
   */
  @Post('register')
  @SuccessResponse(201, 'Created')
  @Response(409, 'Email already registered')
  async register(@Body() body: RegisterDto): Promise<AuthResponseDto> {
    this.setStatus(201);
    return this.authService.register(body);
  }

  /**
   * Log in with email and password
   */
  @Post('login')
  @SuccessResponse(200, 'OK')
  @Response(401, 'Invalid credentials')
  async login(
    @Request() req: ExpressRequest,
    @Body() body: LoginDto
  ): Promise<AuthResponseDto> {
    return this.authService.login(body, req.ip || 'unknown');
  }

  /**
   * Get a new access token using a refresh token
   */
  @Post('refresh')
  @SuccessResponse(200, 'OK')
  @Response(401, 'Invalid or expired refresh token')
  async refresh(
    @Body() body: RefreshTokenDto
  ): Promise<RefreshResponseDto> {
    return this.authService.refresh(body);
  }

  /**
   * Log out a user by invalidating their refresh token
   */
  @Post('logout')
  @SuccessResponse(200, 'OK')
  async logout(@Body() body: RefreshTokenDto): Promise<MessageResponseDto> {
    await this.authService.logout(body);
    return { message: 'Logged out successfully' };
  }

  /**
   * Create a short-lived, single-use authorization code for a registered
   * dashboard. The callback URL is selected by the server and cannot be
   * supplied by the caller.
   */
  @Post('handoff/authorize')
  @Security('jwt')
  @SuccessResponse(201, 'Created')
  @Response(400, 'Invalid handoff request')
  @Response(401, 'Missing or invalid access token')
  @Response(403, 'User is not authorized for the requested dashboard')
  @Response(429, 'Too many handoff authorization requests')
  async authorizeHandoff(
    @Request() req: ExpressRequest,
    @Body() body: AuthorizeAuthHandoffDto
  ): Promise<AuthorizeAuthHandoffResponseDto> {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }

      const result = await new AuthHandoffService().authorize({
        userId: req.user.sub,
        ...body,
      });
      this.setStatus(201);
      logAuthHandoffSecurityEvent(
        'handoff_authorize_succeeded',
        body.clientId
      );
      return result;
    } catch (error) {
      logAuthHandoffSecurityEvent('handoff_authorize_denied', body.clientId);
      throw error;
    }
  }

  /**
   * Exchange a one-time handoff code and PKCE verifier for the existing JWT
   * session response. The dashboard server must send its client ID and secret
   * through HTTP Basic Authorization; browser JavaScript must not call this
   * endpoint directly.
  */
  @Post('handoff/exchange')
  @Security('handoffClient')
  @SuccessResponse(200, 'OK')
  @Response(401, 'Invalid, expired, consumed, or unauthorized handoff')
  @Response(403, 'User is no longer authorized for the dashboard')
  @Response(429, 'Too many handoff exchange requests')
  async exchangeHandoff(
    @Request() req: ExpressRequest,
    @Body() body: ExchangeAuthHandoffDto
  ): Promise<AuthResponseDto> {
    try {
      const credentials = req.authHandoffClientCredentials;
      if (!credentials) {
        throw AppError.unauthorized('Invalid authentication handoff');
      }

      const result = await new AuthHandoffService().exchange({
        ...body,
        authenticatedClientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
      });
      logAuthHandoffSecurityEvent(
        'handoff_exchange_succeeded',
        body.clientId
      );
      return result;
    } catch (error) {
      logAuthHandoffSecurityEvent('handoff_exchange_denied', body.clientId);
      throw error;
    }
  }
}
