import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import type { AuthSession } from '@birthday/types';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from '../common/cookies';
import { requestMeta, type AuthenticatedUser, type RequestWithUser } from '../common/request-context';
import { randomToken } from '../common/utils/crypto';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, ResetPasswordDto } from './auth.dto';
import { AuthService, type IssuedTokens } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in. Sets httpOnly session cookies and a readable CSRF cookie.' })
  async login(@Body() dto: LoginDto, @Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response): Promise<AuthSession> {
    const tokens = await this.auth.login(dto.email, dto.password, requestMeta(req));
    this.setCookies(res, tokens);
    return tokens.session;
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  async refresh(@Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response): Promise<AuthSession> {
    const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    try {
      const tokens = await this.auth.refresh(raw, requestMeta(req));
      this.setCookies(res, tokens);
      return tokens.session;
    } catch (error) {
      this.clearCookies(res);
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(@Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout((req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE]);
    this.clearCookies(res);
  }

  @Get('me')
  @ApiCookieAuth()
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthSession> {
    return this.auth.session(user.id);
  }

  @Post('password/forgot')
  @Public()
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @ApiOperation({ summary: 'Email a reset link if the account exists. Always 202.' })
  async forgot(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.auth.forgotPassword(dto.email);
    return { message: 'If an account exists for that email, a reset link is on its way.' };
  }

  @Post('password/reset')
  @Public()
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  reset(@Body() dto: ResetPasswordDto, @Req() req: RequestWithUser): Promise<void> {
    return this.auth.resetPassword(dto.token, dto.password, requestMeta(req));
  }

  @Post('password/change')
  @HttpCode(204)
  @ApiCookieAuth()
  async change(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, requestMeta(req));
    // All sessions ended; keep this one alive with fresh tokens.
    const tokens = await this.auth.login(user.email, dto.newPassword, requestMeta(req));
    this.setCookies(res, tokens);
  }

  private base(): CookieOptions {
    return { secure: this.config.auth.cookieSecure, sameSite: 'lax', domain: this.config.auth.cookieDomain };
  }

  private setCookies(res: Response, tokens: IssuedTokens): void {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...this.base(), httpOnly: true, path: '/api', maxAge: this.config.auth.accessTtlSeconds * 1000 });
    if (tokens.refreshToken && tokens.refreshExpiresAt) {
      res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...this.base(), httpOnly: true, path: '/api/auth', expires: tokens.refreshExpiresAt });
      res.cookie(CSRF_COOKIE, randomToken(24), { ...this.base(), httpOnly: false, path: '/', expires: tokens.refreshExpiresAt });
    }
    res.setHeader('Cache-Control', 'no-store');
  }

  private clearCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...this.base(), path: '/api' });
    res.clearCookie(REFRESH_COOKIE, { ...this.base(), path: '/api/auth' });
    res.clearCookie(CSRF_COOKIE, { ...this.base(), path: '/' });
  }
}
