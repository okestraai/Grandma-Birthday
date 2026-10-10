import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { RsvpFormConfig, RsvpInvitePrefill, SubmitRsvpResult } from '@birthday/types';
import { Public } from '../common/decorators/auth.decorators';
import { requestMeta, type RequestWithUser } from '../common/request-context';
import { SubmitRsvpDto } from './rsvp.dto';
import { RsvpService } from './rsvp.service';

@ApiTags('Public: RSVP')
@Controller('rsvp')
@Public()
export class RsvpController {
  constructor(private readonly rsvp: RsvpService) {}

  @Get('form')
  @ApiOperation({ summary: 'Whether RSVPs are open, categories, companion limits and custom questions' })
  form(): Promise<RsvpFormConfig> {
    return this.rsvp.formConfig();
  }

  @Get('invite/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  prefill(@Param('token') token: string): Promise<RsvpInvitePrefill> {
    return this.rsvp.invitePrefill(token);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 10 * 60_000 } })
  @ApiOperation({ summary: 'Submit or update an RSVP. Guest limits and event capacity are enforced here.' })
  submit(@Body() dto: SubmitRsvpDto, @Req() req: RequestWithUser): Promise<SubmitRsvpResult> {
    return this.rsvp.submit(dto, requestMeta(req));
  }
}
