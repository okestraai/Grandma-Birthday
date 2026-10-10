import { loadConfig } from './app-config';

const base = {
  DATABASE_URL: 'postgresql://x',
  JWT_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=key;EndpointSuffix=core.windows.net',
};

describe('loadConfig', () => {
  it('loads a valid environment with defaults', () => {
    const config = loadConfig(base);
    expect(config.port).toBe(4100);
    expect(config.storage.container).toBe('birthday-media');
    expect(config.uploadDefaults.maxStorageBytes).toBe(10 * 1024 ** 3);
  });
  it('lists every problem at once', () => {
    const run = () => loadConfig({ JWT_SECRET: 'short' });
    expect(run).toThrow(/DATABASE_URL is required/);
    expect(run).toThrow(/JWT_SECRET must be at least 32/);
    expect(run).toThrow(/AZURE_STORAGE_CONNECTION_STRING is required/);
  });
  it('refuses unsafe production settings', () => {
    const run = () =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        JWT_SECRET: `change-me-${'x'.repeat(30)}`,
        COOKIE_SECURE: 'false',
        CORS_ORIGIN: '*',
        AZURE_STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
      });
    expect(run).toThrow(/example value/);
    expect(run).toThrow(/COOKIE_SECURE/);
    expect(run).toThrow(/CORS_ORIGIN/);
    expect(run).toThrow(/local emulator/);
  });
  it("refuses docker-compose's local fallback secrets in production", () => {
    const run = () =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        COOKIE_SECURE: 'true',
        JWT_SECRET: 'local-docker-access-secret-not-for-production',
        JWT_REFRESH_SECRET: 'local-docker-refresh-secret-not-for-production',
      });
    expect(run).toThrow(/JWT_SECRET is the local Docker default/);
    expect(run).toThrow(/JWT_REFRESH_SECRET is the local Docker default/);
  });
  it('validates the container name', () => {
    expect(() => loadConfig({ ...base, AZURE_STORAGE_CONTAINER: 'Bad_Name' })).toThrow(/AZURE_STORAGE_CONTAINER/);
  });
});
