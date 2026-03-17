import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DevService {
  constructor(private readonly prisma: PrismaService) {}

  async confirmAllPendingVouchers(): Promise<{ confirmed: number }> {
    const result = await this.prisma.voucher.updateMany({
      where: { status: 'PENDING', emeConfirmedAt: null },
      data: {
        status: 'ISSUED',
        emeConfirmedAt: new Date(),
      },
    });
    return { confirmed: result.count };
  }
}
