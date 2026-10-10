import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node dist/seed/run-seed.js',
  },
  datasource: {
    // Optional here so `prisma generate` works at image build time; migrate commands need it.
    url: process.env.DATABASE_URL ?? '',
  },
});
