import { Module } from '@nestjs/common';
import { CelebrationController } from './celebration.controller';

@Module({ controllers: [CelebrationController] })
export class CelebrationModule {}
