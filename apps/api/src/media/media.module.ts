import { Module } from '@nestjs/common';
import { AdminMediaController, PublicMediaController } from './media.controller';
import { MediaIngestService } from './media-ingest.service';
import { MediaService } from './media.service';

@Module({
  controllers: [PublicMediaController, AdminMediaController],
  providers: [MediaService, MediaIngestService],
  exports: [MediaService, MediaIngestService],
})
export class MediaModule {}
