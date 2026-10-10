import { Module } from '@nestjs/common';
import { CheckInController } from './checkin.controller';
import { CheckInService } from './checkin.service';

@Module({ controllers: [CheckInController], providers: [CheckInService] })
export class CheckInModule {}
