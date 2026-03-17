import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

// PrismaService est fourni globalement via PrismaModule (@Global)
@Module({
  controllers: [InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
