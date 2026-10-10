import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import type { SeoMetadata } from '@birthday/types';
import { Public } from '../common/decorators/auth.decorators';
import { PublicCache } from '../common/public-cache';
import { SeoService } from './seo.service';

class SeoQuery {
  @ApiPropertyOptional({ example: '/gallery/childhood' }) @IsOptional() @IsString() @MaxLength(300) path?: string;
}

@ApiTags('SEO')
@Controller()
@Public()
export class SeoController {
  constructor(
    private readonly seo: SeoService,
    private readonly cache: PublicCache,
  ) {}

  @Get('seo')
  @ApiOperation({ summary: 'Title, description, image and JSON-LD for a public path' })
  async forPath(@Query() query: SeoQuery, @Res({ passthrough: true }) res: Response): Promise<SeoMetadata> {
    res.setHeader('Cache-Control', 'public, max-age=300');
    const path = query.path ?? '/';
    return this.cache.remember(`seo:${path}`, () => this.seo.forPath(path));
  }

  @Get('sitemap.xml')
  async sitemap(@Res() res: Response): Promise<void> {
    res.type('application/xml').setHeader('Cache-Control', 'public, max-age=3600');
    res.send(await this.seo.sitemap());
  }
}
