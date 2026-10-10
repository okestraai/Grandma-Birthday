import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/app-config';
import { CSRF_HEADER } from './common/cookies';

/** Shared by main.ts and the API tests, so tests exercise the real HTTP setup. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  const express = app as NestExpressApplication;
  express.set('trust proxy', config.trustProxy);
  express.disable('x-powered-by');
  app.setGlobalPrefix('api');

  // Strict defaults for a JSON API; Swagger UI gets a relaxed policy below.
  const strict = helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], imgSrc: ["'self'", 'data:'] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  const docs = helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https:'] } } });
  app.use((req: Request, res: Response, next: NextFunction) => (req.path.startsWith('/api/docs') ? docs : strict)(req, res, next));

  app.use(compression({ filter: (req, res) => !String(res.getHeader('Content-Type') ?? '').startsWith('video/') && compression.filter(req, res) }));
  app.use(cookieParser());
  app.use(json({ limit: '256kb' }));
  app.use(urlencoded({ extended: false, limit: '64kb' }));

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) =>
      callback(null, !origin || config.corsOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', CSRF_HEADER, 'X-Request-Id', 'Range'],
    exposedHeaders: ['X-Request-Id', 'Content-Range', 'Accept-Ranges'],
    maxAge: 600,
  });

  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('70th Birthday Celebration API')
      .setDescription(
        'Public site, RSVP, invitations, QR check-in, guest uploads and admin.\n\n' +
          'Admin routes use cookie sessions from POST /api/auth/login. State-changing requests must send `X-CSRF-Token` equal to the `bp_csrf` cookie. ' +
          'Roles: SUPER_ADMIN (all), ADMIN (all but users), CHECK_IN_STAFF (check-in only). Errors are `{ success:false, statusCode, code, message, details?, requestId }`.',
      )
      .setVersion('1.0.0')
      .addCookieAuth('bp_access')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json', swaggerOptions: { persistAuthorization: true } });
}
