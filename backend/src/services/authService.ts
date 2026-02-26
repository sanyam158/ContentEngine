import crypto from 'crypto';
import { AUTH_USERS, ConfiguredAuthUser } from '../config/authUsers.js';

export interface PublicAuthUser {
  id: string;
  username: string;
  displayName: string;
  role: ConfiguredAuthUser['role'];
}

interface AuthTokenPayload {
  sub: string;
  username: string;
  displayName: string;
  role: ConfiguredAuthUser['role'];
  fp: string;
  iat: number;
  exp: number;
}

const DEFAULT_TOKEN_TTL_HOURS = 12;
const RAW_TOKEN_TTL_HOURS = Number(process.env.AUTH_TOKEN_TTL_HOURS || DEFAULT_TOKEN_TTL_HOURS);
const TOKEN_TTL_HOURS = Number.isFinite(RAW_TOKEN_TTL_HOURS) && RAW_TOKEN_TTL_HOURS > 0
  ? RAW_TOKEN_TTL_HOURS
  : DEFAULT_TOKEN_TTL_HOURS;

const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'contentengine-dev-token-secret-change-me';

const findUserByUsername = (username: string): ConfiguredAuthUser | undefined => {
  const normalized = username.trim().toLowerCase();
  return AUTH_USERS.find((user) => user.username.toLowerCase() === normalized);
};

const toPublicUser = (user: ConfiguredAuthUser): PublicAuthUser => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
});

const safeStringEquals = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const createCredentialFingerprint = (password: string): string => {
  return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
};

const encodePayload = (payload: AuthTokenPayload): string => {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

const signPayload = (encodedPayload: string): string => {
  return crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(encodedPayload).digest('base64url');
};

const isValidPayload = (value: unknown): value is AuthTokenPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<AuthTokenPayload>;
  return Boolean(
    payload.sub
    && payload.username
    && payload.displayName
    && payload.role
    && payload.fp
    && typeof payload.iat === 'number'
    && typeof payload.exp === 'number'
  );
};

export const authenticateUser = (username: string, password: string): PublicAuthUser | null => {
  const user = findUserByUsername(username);
  if (!user) {
    return null;
  }

  if (!safeStringEquals(user.password, password)) {
    return null;
  }

  return toPublicUser(user);
};

export const issueAccessToken = (user: PublicAuthUser): string => {
  const configuredUser = AUTH_USERS.find((item) => item.id === user.id && item.username === user.username);
  if (!configuredUser) {
    throw new Error('Unable to issue token for unknown user');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: AuthTokenPayload = {
    sub: configuredUser.id,
    username: configuredUser.username,
    displayName: configuredUser.displayName,
    role: configuredUser.role,
    fp: createCredentialFingerprint(configuredUser.password),
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_HOURS * 60 * 60,
  };

  const encodedPayload = encodePayload(payload);
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
};

export const verifyAccessToken = (token: string): PublicAuthUser | null => {
  const [encodedPayload, tokenSignature] = token.split('.');
  if (!encodedPayload || !tokenSignature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  if (!safeStringEquals(expectedSignature, tokenSignature)) {
    return null;
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!isValidPayload(parsedPayload)) {
    return null;
  }

  const payload = parsedPayload;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (payload.exp <= nowSeconds) {
    return null;
  }

  const configuredUser = AUTH_USERS.find((user) => user.id === payload.sub && user.username === payload.username);
  if (!configuredUser) {
    return null;
  }

  const expectedFingerprint = createCredentialFingerprint(configuredUser.password);
  if (!safeStringEquals(expectedFingerprint, payload.fp)) {
    return null;
  }

  return toPublicUser(configuredUser);
};
