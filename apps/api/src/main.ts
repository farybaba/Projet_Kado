import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Sécurité HTTP
  app.use(helmet());

  // CORS — origines autorisées depuis env
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',');
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Validation globale — rejette les propriétés non déclarées dans les DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Prefix API
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ?? 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Kado API running on http://localhost:${port}/api/v1`);
}

bootstrap();
