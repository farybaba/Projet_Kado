import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

// 1 point par 100 FCFA (1 point par 10 000 centimes)
const POINTS_PER_CENTIMES = 10_000;

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async getCards(beneficiaryId: string) {
    return this.prisma.loyaltyCard.findMany({
      where: { beneficiaryId },
      include: {
        merchant: { select: { id: true, name: true, category: true, address: true } },
      },
      orderBy: { points: 'desc' },
    });
  }

  async creditPoints(
    beneficiaryId: string,
    merchantId: string,
    amountCentimes: number,
  ) {
    const points = Math.floor(amountCentimes / POINTS_PER_CENTIMES);
    if (points <= 0) return;
    await this.prisma.loyaltyCard.upsert({
      where: { beneficiaryId_merchantId: { beneficiaryId, merchantId } },
      create: { beneficiaryId, merchantId, points, totalSpent: amountCentimes },
      update: {
        points: { increment: points },
        totalSpent: { increment: amountCentimes },
      },
    });
  }
}
