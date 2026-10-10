import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { TestimonialsController } from './testimonials.controller';
import { TestimonialsService } from './testimonials.service';

@Module({ imports: [MediaModule], controllers: [TestimonialsController], providers: [TestimonialsService] })
export class TestimonialsModule {}
