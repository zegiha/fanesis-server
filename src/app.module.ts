import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './core/auth/auth.module';
import appConfig from './core/config/app.config';
import databaseConfig from './core/config/database.config';
import googleConfig from './core/config/google.config';
import jwtConfig from './core/config/jwt.config';
import { validate } from './core/config/env.validation';
import { PrismaModule } from './core/prisma/prisma.module';
import { FolderModule } from './domain/folder/folder.module';
import { TaskModule } from './domain/task/task.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV ?? 'development'}`,
      load: [appConfig, databaseConfig, jwtConfig, googleConfig],
      validate,
      cache: true,
    }),
    PrismaModule,
    AuthModule,
    FolderModule,
    TaskModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
