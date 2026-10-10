import { Global, Module } from '@nestjs/common';
import { RsvpController } from './rsvp.controller';
import { RsvpService } from './rsvp.service';

@Global()
@Module({ controllers: [RsvpController], providers: [RsvpService], exports: [RsvpService] })
export class RsvpModule {}
