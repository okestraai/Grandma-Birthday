import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const config = loadConfig();

  const levels = ['error', 'warn', 'log', 'debug', 'verbose'] as const;
  const logger = new ConsoleLogger({
    json: config.isProduction,
    logLevels: [...levels.slice(0, levels.indexOf(config.logLevel === 'verbose' ? 'verbose' : config.logLevel) + 1)],
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger, bodyParser: false });
  configureApp(app, config);
  await app.listen(config.port);
  Logger.log(`API listening on http://localhost:${config.port}/api (docs at /api/docs)`, 'Bootstrap');
}

void bootstrap();
