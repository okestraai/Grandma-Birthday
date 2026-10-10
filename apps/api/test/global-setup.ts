import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { BlobServiceClient } from '@azure/storage-blob';

/** Migrates the test database and creates the test blob container once per run. */
export default async function globalSetup(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must be set and its database name must end in _test');
  }
  execSync('npx prisma migrate deploy', { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url } });
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error('AZURE_STORAGE_CONNECTION_STRING must be set (Azurite locally)');
  await BlobServiceClient.fromConnectionString(conn).getContainerClient('birthday-test').createIfNotExists();
}
