import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { AppException } from '../common/errors';
import type { RequestWithUser } from '../common/request-context';
import { safeEqual } from '../common/utils/crypto';
import { SettingsService } from '../settings/settings.service';

/** Rejects a bad upload token before any file bytes are accepted. */
@Injectable()
export class TokenCheckFirst implements NestInterceptor {
  constructor(private readonly settings: SettingsService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const token = String(req.params.token ?? '');
    const settings = await this.settings.getSettings();
    if (!safeEqual(token, settings.uploadToken)) {
      throw new AppException(HttpStatus.NOT_FOUND, 'UPLOAD_TOKEN_INVALID', 'This photo sharing link is no longer active.');
    }
    if (!settings.guestUploadsOpen) throw new AppException(HttpStatus.FORBIDDEN, 'UPLOADS_CLOSED', 'Photo sharing is closed at the moment.');
    return next.handle();
  }
}
