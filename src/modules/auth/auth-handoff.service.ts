import { Repository } from "typeorm";
import { AppDataSource } from "../../config/database";
import {
  AuthHandoffClientRegistry,
  getAuthHandoffClientRegistry,
  isAuthHandoffClientId,
} from "../../config/authClients";
import { env } from "../../config/env";
import { User } from "../../entities/User";
import { AppError } from "../../utils/AppError";
import { AuthResponseDto } from "./auth.dto";
import { AuthService } from "./auth.service";
import {
  constantTimeValueMatches,
  createPkceS256Challenge,
  generateAuthHandoffCode,
  isValidAuthHandoffState,
  isValidPkceS256Challenge,
  isValidPkceVerifier,
} from "./auth-handoff.crypto";
import {
  AuthHandoffStore,
  authHandoffStore,
  hashAuthHandoffCode,
} from "./auth-handoff.store";

const GENERIC_EXCHANGE_ERROR = "Invalid authentication handoff";

type UserRepository = Pick<Repository<User>, "findOne">;
type AuthSessionIssuer = Pick<AuthService, "issueSessionForUser">;

export interface AuthorizeAuthHandoffInput {
  userId: string;
  clientId: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

export interface AuthorizeAuthHandoffResult {
  redirectUrl: string;
  expiresIn: number;
}

export interface ExchangeAuthHandoffInput {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
}

export interface AuthHandoffServiceOptions {
  store?: AuthHandoffStore;
  clients?: AuthHandoffClientRegistry;
  userRepository?: UserRepository;
  sessionIssuer?: AuthSessionIssuer;
  ttlSeconds?: number;
  generateCode?: () => string;
  now?: () => Date;
}

export class AuthHandoffService {
  private readonly store: AuthHandoffStore;
  private readonly clients: AuthHandoffClientRegistry;
  private readonly userRepository: UserRepository;
  private readonly sessionIssuer: AuthSessionIssuer;
  private readonly ttlSeconds: number;
  private readonly generateCode: () => string;
  private readonly now: () => Date;

  constructor(options: AuthHandoffServiceOptions = {}) {
    this.store = options.store ?? authHandoffStore;
    this.clients = options.clients ?? getAuthHandoffClientRegistry();
    this.userRepository =
      options.userRepository ?? AppDataSource.getRepository(User);
    this.sessionIssuer = options.sessionIssuer ?? new AuthService();
    this.ttlSeconds = options.ttlSeconds ?? env.AUTH_HANDOFF_CODE_TTL_SECONDS;
    this.generateCode = options.generateCode ?? generateAuthHandoffCode;
    this.now = options.now ?? (() => new Date());
  }

  async authorize(
    input: AuthorizeAuthHandoffInput,
  ): Promise<AuthorizeAuthHandoffResult> {
    if (!isAuthHandoffClientId(input.clientId)) {
      throw AppError.badRequest("Unsupported authentication handoff client");
    }

    if (!isValidAuthHandoffState(input.state)) {
      throw AppError.badRequest("Invalid authentication handoff state");
    }

    if (
      input.codeChallengeMethod !== "S256" ||
      !isValidPkceS256Challenge(input.codeChallenge)
    ) {
      throw AppError.badRequest("Invalid PKCE S256 challenge");
    }

    const client = this.clients[input.clientId];
    const user = await this.userRepository.findOne({
      where: { id: input.userId },
    });

    if (!user || !user.isActive || user.role !== client.requiredRole) {
      throw AppError.forbidden(
        "User is not authorized for the requested dashboard",
      );
    }

    const code = this.generateCode();
    await this.store.create(
      hashAuthHandoffCode(code),
      {
        userId: user.id,
        clientId: input.clientId,
        codeChallenge: input.codeChallenge,
        codeChallengeMethod: "S256",
        createdAt: this.now().toISOString(),
      },
      this.ttlSeconds,
    );

    const callback = new URL(client.callbackUrl);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", input.state);

    return {
      redirectUrl: callback.toString(),
      expiresIn: this.ttlSeconds,
    };
  }

  async exchange(input: ExchangeAuthHandoffInput): Promise<AuthResponseDto> {
    const codeHash = hashAuthHandoffCode(input.code);
    const record = await this.store.consume(codeHash);

    // Consumption happens before client/PKCE checks. Any failed attempt using a
    // real code therefore cannot leave that authorization grant replayable.
    if (!record || !isAuthHandoffClientId(input.clientId)) {
      throw AppError.unauthorized(GENERIC_EXCHANGE_ERROR);
    }

    const client = this.clients[input.clientId];
    const secretValid = client.verifySecret(input.clientSecret);
    const verifierValid = isValidPkceVerifier(input.codeVerifier);
    const challengeValid = verifierValid
      ? constantTimeValueMatches(
          record.codeChallenge,
          createPkceS256Challenge(input.codeVerifier),
        )
      : false;
    const clientValid = record.clientId === input.clientId;

    if (!secretValid || !clientValid || !challengeValid) {
      throw AppError.unauthorized(GENERIC_EXCHANGE_ERROR);
    }

    const user = await this.userRepository.findOne({
      where: { id: record.userId },
    });

    if (!user || !user.isActive || user.role !== client.requiredRole) {
      throw AppError.forbidden(
        "User is no longer authorized for the requested dashboard",
      );
    }

    return this.sessionIssuer.issueSessionForUser(user);
  }
}
