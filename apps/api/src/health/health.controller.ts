import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@ApiTags('Health')
@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Liveness plus database check. Used by Docker and load balancers. */
  @Get()
  async health(): Promise<{ status: 'ok'; database: 'up' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok', database: 'up' };
  }

  /** Readiness including object storage. */
  @Get('ready')
  async ready(): Promise<{ status: 'ok'; database: 'up'; storage: 'up' }> {
    await this.health();
    if (!(await this.storage.ping())) throw new ServiceUnavailableException('Storage unavailable');
    return { status: 'ok', database: 'up', storage: 'up' };
  }
}
