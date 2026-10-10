/**
 * Typed configuration, read once from environment variables and validated at boot.
 * The app refuses to start with a clear list of problems rather than failing later.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  trustProxy: number;
  logLevel: 'verbose' | 'debug' | 'log' | 'warn' | 'error';
  databaseUrl: string;
  auth: {
    jwtSecret: string;
    refreshSecret: string;
    accessTtlSeconds: number;
    refreshTtlDays: number;
    cookieSecure: boolean;
    cookieDomain: string | undefined;
    maxFailedLogins: number;
    lockoutMinutes: number;
  };
  publicWebUrl: string;
  corsOrigins: string[];
  storage: {
    /** Azure Storage connection string (Azurite's well-known development string locally). */
    connectionString: string;
    container: string;
  };
  uploadDefaults: {
    maxStorageBytes: number;
    maxPhotoBytes: number;
    maxVideoBytes: number;
  };
  guestUploadFilesPerHour: number;
  smtp: {
    host: string | undefined;
    port: number;
    secure: boolean;
    user: string | undefined;
    password: string | undefined;
    from: string;
  };
  adminNotifyEmail: string | undefined;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

type Env = Record<string, string | undefined>;

class ConfigErrors {
  readonly problems: string[] = [];
  add(problem: string) {
    this.problems.push(problem);
  }
}

function str(env: Env, key: string, errors: ConfigErrors, fallback?: string): string {
  const value = env[key]?.trim();
  if (value) return value;
  if (fallback !== undefined) return fallback;
  errors.add(`${key} is required`);
  return '';
}

function optional(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function int(env: Env, key: string, fallback: number, errors: ConfigErrors, min = 0): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    errors.add(`${key} must be an integer >= ${min} (got "${raw}")`);
    return fallback;
  }
  return value;
}

function bool(env: Env, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export function loadConfig(env: Env = process.env): AppConfig {
  const errors = new ConfigErrors();
  const nodeEnvRaw = env.NODE_ENV ?? 'development';
  const nodeEnv = (['development', 'test', 'production'].includes(nodeEnvRaw) ? nodeEnvRaw : 'development') as AppConfig['nodeEnv'];
  const isProduction = nodeEnv === 'production';

  const jwtSecret = str(env, 'JWT_SECRET', errors);
  const refreshSecret = str(env, 'JWT_REFRESH_SECRET', errors);
  for (const [key, value] of [
    ['JWT_SECRET', jwtSecret],
    ['JWT_REFRESH_SECRET', refreshSecret],
  ] as const) {
    if (value && value.length < 32) errors.add(`${key} must be at least 32 characters`);
    if (isProduction && value.startsWith('change-me')) errors.add(`${key} still has the example value; generate a real secret`);
    // docker-compose.yml falls back to these for local runs; they are public in the repository.
    if (isProduction && value.includes('not-for-production')) errors.add(`${key} is the local Docker default; generate a real secret`);
  }
  if (jwtSecret && jwtSecret === refreshSecret) errors.add('JWT_SECRET and JWT_REFRESH_SECRET must differ');

  const publicWebUrl = str(env, 'PUBLIC_WEB_URL', errors, 'http://localhost:5173').replace(/\/$/, '');
  const corsOrigins = str(env, 'CORS_ORIGIN', errors, publicWebUrl)
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (isProduction && corsOrigins.includes('*')) errors.add('CORS_ORIGIN cannot be "*" in production (cookies are used)');

  const cookieSecure = bool(env, 'COOKIE_SECURE', isProduction);

  const config: AppConfig = {
    nodeEnv,
    isProduction,
    port: int(env, 'PORT', 4100, errors, 1),
    trustProxy: int(env, 'TRUST_PROXY', 0, errors),
    logLevel: (['verbose', 'debug', 'log', 'warn', 'error'].includes(env.LOG_LEVEL ?? '') ? env.LOG_LEVEL : 'log') as AppConfig['logLevel'],
    databaseUrl: str(env, 'DATABASE_URL', errors),
    auth: {
      jwtSecret,
      refreshSecret,
      accessTtlSeconds: int(env, 'ACCESS_TOKEN_TTL_SECONDS', 900, errors, 60),
      refreshTtlDays: int(env, 'REFRESH_TOKEN_TTL_DAYS', 7, errors, 1),
      cookieSecure,
      cookieDomain: optional(env, 'COOKIE_DOMAIN'),
      maxFailedLogins: int(env, 'MAX_FAILED_LOGINS', 5, errors, 1),
      lockoutMinutes: int(env, 'LOCKOUT_MINUTES', 15, errors, 1),
    },
    publicWebUrl,
    corsOrigins,
    storage: {
      connectionString: str(env, 'AZURE_STORAGE_CONNECTION_STRING', errors),
      container: str(env, 'AZURE_STORAGE_CONTAINER', errors, 'birthday-media'),
    },
    uploadDefaults: {
      maxStorageBytes: int(env, 'MAX_STORAGE_BYTES', 10 * 1024 ** 3, errors, 1),
      maxPhotoBytes: int(env, 'MAX_PHOTO_SIZE', 10 * 1024 ** 2, errors, 1),
      maxVideoBytes: int(env, 'MAX_VIDEO_SIZE', 100 * 1024 ** 2, errors, 1),
    },
    guestUploadFilesPerHour: int(env, 'GUEST_UPLOAD_FILES_PER_HOUR', 60, errors, 1),
    smtp: {
      host: optional(env, 'SMTP_HOST'),
      port: int(env, 'SMTP_PORT', 587, errors, 1),
      secure: bool(env, 'SMTP_SECURE', false),
      user: optional(env, 'SMTP_USER'),
      password: optional(env, 'SMTP_PASSWORD'),
      from: str(env, 'SMTP_FROM', errors, 'Celebration Team <no-reply@example.com>'),
    },
    adminNotifyEmail: optional(env, 'ADMIN_NOTIFY_EMAIL'),
  };

  const container = config.storage.container;
  if (!/^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/.test(container)) {
    errors.add('AZURE_STORAGE_CONTAINER must be 3-63 lowercase letters, digits or single hyphens');
  }
  if (isProduction && /UseDevelopmentStorage=true|devstoreaccount1/.test(config.storage.connectionString)) {
    errors.add('AZURE_STORAGE_CONNECTION_STRING points at the local emulator; use your storage account in production');
  }

  if (isProduction && !cookieSecure) errors.add('COOKIE_SECURE must be true in production');

  if (errors.problems.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${errors.problems.join('\n  - ')}`);
  }
  return config;
}
