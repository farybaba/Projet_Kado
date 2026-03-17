import { Controller, Get, Put, Param, UseGuards, Req } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';
import type { JwtPayload } from '../auth/auth.service';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  // Public — pas d'auth requise, vérifie juste le token
  @Get(':token')
  findByToken(@Param('token') token: string) {
    return this.invitationsService.findByToken(token);
  }

  // Requiert un JWT valide (l'utilisateur a déjà vérifié son OTP)
  @Put(':token/accept')
  @UseGuards(JwtAuthGuard)
  accept(
    @Param('token') token: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.invitationsService.accept(token, req.user.sub, req.user.phone);
  }
}
