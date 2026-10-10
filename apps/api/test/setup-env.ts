// Test environment: a dedicated database whose name must end in _test, and its own blob container.
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.AZURE_STORAGE_CONTAINER = 'birthday-test';
process.env.SMTP_HOST = '';
process.env.LOG_LEVEL = 'error';
