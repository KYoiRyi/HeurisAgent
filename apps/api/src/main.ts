import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "warn", "error", "debug"],
  });

  app.enableCors({
    origin: (origin, cb) => cb(null, origin ?? true),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.setGlobalPrefix("api");

  const port = Number(process.env.PORT ?? 5001);
  await app.listen(port, "0.0.0.0");
  new Logger("bootstrap").log(`HeurisAgent API ready at http://127.0.0.1:${port}`);
}

void bootstrap();
