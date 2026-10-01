import { JwtPayload } from '../utils/jwt';
import { AuthHandoffClientCredentials } from '../modules/auth/auth-handoff.credentials';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      authHandoffClientCredentials?: AuthHandoffClientCredentials;
      rawBody?: Buffer;
    }
  }
}

export {};
