import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';
import type { JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKey: config.get<string>('JWT_PUBLIC_KEY')?.replace(/\\n/g, '\n'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    // Vérifier blacklist Redis (tokens révoqués)
    const token = (req as any).headers?.authorization?.split(' ')[1];
    if (token) {
      const blacklisted = await this.redis.get(`jwt_blacklist:${token}`);
      if (blacklisted) {
        throw new UnauthorizedException('Token révoqué');
      }
    }

    return payload;
  }
}
