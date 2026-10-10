import { Module } from '@nestjs/common';
import { CelebrantController } from './celebrant.controller';

@Module({ controllers: [CelebrantController] })
export class CelebrantModule {}
