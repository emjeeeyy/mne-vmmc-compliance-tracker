import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // Every deployment target here (Railway, Vercel, etc.) sits behind a reverse proxy, so Express
  // never sees the real client IP directly — without this, it sees the proxy's own IP for every
  // request. ThrottlerGuard (global, app.module.ts) can't resolve a real client to rate-limit
  // without this set, and throws on every single request as a result — including /api/health,
  // which takes no DB/auth dependency of its own, which is what made this so easy to misdiagnose
  // as a CORS or wrong-URL problem instead of what it actually was.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN'),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('VMMC TB DOTS API')
    .setDescription(
      'ITIL 4 Monitoring & Event Management backend for the VMMC TB DOTS health management system. ' +
        'Write endpoints accept an `Idempotency-Key` header so a client retry after a timeout never duplicates a record.',
    )
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  // Handoff artifact — a static copy of the live contract, so it can travel with the repo
  // without needing a running server (§ Phase 12 handoff: "OpenAPI + this spec + route map").
  try {
    writeFileSync(resolve(process.cwd(), 'openapi.json'), JSON.stringify(swaggerDocument, null, 2));
  } catch {
    // Non-fatal — e.g. a read-only deployment filesystem. The live /api/docs JSON is authoritative either way.
  }

  const port = configService.get<number>('PORT') ?? 8443;
  await app.listen(port);
}
bootstrap();
