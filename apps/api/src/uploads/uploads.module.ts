import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { TokenCheckFirst } from './token-check.interceptor';
import { UploadsController } from './uploads.controller';

@Module({ imports: [MediaModule], controllers: [UploadsController], providers: [TokenCheckFirst] })
export class UploadsModule {}
