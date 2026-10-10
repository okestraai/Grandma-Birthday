import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { AlbumsController } from './albums.controller';

@Module({ imports: [MediaModule], controllers: [AlbumsController] })
export class AlbumsModule {}
