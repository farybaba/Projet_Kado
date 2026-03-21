import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateFlashOfferDto {
  title: string;
  description?: string;
  discountPct: number;
  validFrom: string;
  validUntil: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  address?: string;  // adresse spécifique pour cette offre
}

@Injectable()
export class FlashOffersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(merchantId: string, dto: CreateFlashOfferDto) {
    return this.prisma.flashOffer.create({
      data: {
        merchantId,
        title: dto.title,
        description: dto.description,
        discountPct: dto.discountPct,
        validFrom: new Date(dto.validFrom),
        validUntil: new Date(dto.validUntil),
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        radius: dto.radius ?? 5000,
        address: dto.address ?? null,
      },
    });
  }

  async getActive(lat?: number, lng?: number) {
    const now = new Date();
    const offers = await this.prisma.flashOffer.findMany({
      where: { isActive: true, validFrom: { lte: now }, validUntil: { gte: now } },
      include: { merchant: { select: { id: true, name: true, category: true, address: true, latitude: true, longitude: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (lat == null || lng == null) return offers;

    // Filtrage géographique (Haversine)
    return offers.filter(o => {
      if (o.latitude == null || o.longitude == null) return true;
      const R = 6371000;
      const dLat = ((o.latitude - lat) * Math.PI) / 180;
      const dLng = ((o.longitude - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((o.latitude * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return dist <= o.radius;
    });
  }

  async getByMerchant(merchantId: string) {
    return this.prisma.flashOffer.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggle(merchantId: string, offerId: string) {
    const offer = await this.prisma.flashOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException('Offre introuvable');
    if (offer.merchantId !== merchantId) throw new ForbiddenException();
    return this.prisma.flashOffer.update({
      where: { id: offerId },
      data: { isActive: !offer.isActive },
    });
  }
}
