import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { company: { select: { name: true } } },
    });

    if (!invitation) {
      throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'Invitation introuvable.' });
    }

    // Auto-expire si TTL dépassé
    if (invitation.status === 'PENDING' && invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { token },
        data: { status: 'EXPIRED' },
      });
      throw new ConflictException({ code: 'INVITATION_EXPIRED', message: 'Ce lien d\'invitation a expiré.' });
    }

    if (invitation.status === 'ACCEPTED') {
      throw new ConflictException({ code: 'INVITATION_ALREADY_ACCEPTED', message: 'Cette invitation a déjà été acceptée.' });
    }

    if (invitation.status === 'EXPIRED') {
      throw new ConflictException({ code: 'INVITATION_EXPIRED', message: 'Ce lien d\'invitation a expiré.' });
    }

    return {
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      poste: invitation.poste,
      phone: invitation.phone,
      companyName: invitation.company.name,
      expiresAt: invitation.expiresAt,
    };
  }

  async accept(token: string, userId: string, userPhone?: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'Invitation introuvable.' });
    }

    if (invitation.status !== 'PENDING' || invitation.expiresAt < new Date()) {
      throw new ConflictException({
        code: invitation.status === 'ACCEPTED' ? 'INVITATION_ALREADY_ACCEPTED' : 'INVITATION_EXPIRED',
        message: invitation.status === 'ACCEPTED'
          ? 'Cette invitation a déjà été acceptée.'
          : 'Ce lien d\'invitation a expiré.',
      });
    }

    // Si l'invitation cible un numéro précis, vérifier la correspondance
    if (invitation.phone && userPhone && invitation.phone !== userPhone) {
      throw new ForbiddenException({
        code: 'PHONE_MISMATCH',
        message: 'Ce lien d\'invitation ne correspond pas à votre numéro.',
      });
    }

    // Lier l'utilisateur à l'entreprise avec le rôle COMPANY_VIEWER
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        companyId: invitation.companyId,
        role: 'COMPANY_VIEWER',
        firstName: invitation.firstName ?? undefined,
        lastName: invitation.lastName ?? undefined,
      },
    });

    // Marquer l'invitation comme acceptée
    await this.prisma.invitation.update({
      where: { token },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    return { message: 'Compte activé avec succès.' };
  }
}
