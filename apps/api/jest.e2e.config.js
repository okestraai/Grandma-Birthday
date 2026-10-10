/** API tests over HTTP against a real Postgres test database and Azurite. */
const base = require('./jest.config');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  globalSetup: '<rootDir>/test/global-setup.ts',
  testTimeout: 60000,
};
