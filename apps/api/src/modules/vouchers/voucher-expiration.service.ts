import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

const BATCH_SIZE = 100;

@Injectable()
export class VoucherExpirationService {
  private readonly logger = new Logger(VoucherExpirationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Cron quotidien à 00h01 UTC — expire les bons arrivés à échéance
  @Cron('1 0 * * *', { timeZone: 'UTC' })
  async expireVouchers(): Promise<void> {
    this.logger.log('Démarrage du job d\'expiration des bons');

    const now = new Date();
    let totalExpired = 0;
    let offset = 0;

    // Traitement par lots de 100 pour éviter les timeouts Prisma
    for (;;) {
      const batch = await this.prisma.voucher.findMany({
        where: {
          expiresAt: { lte: now },
          status: { in: ['ISSUED', 'PARTIAL'] },
        },
        select: {
          id: true,
          companyId: true,
          remainingValue: true,
        },
        take: BATCH_SIZE,
        skip: offset,
        orderBy: { expiresAt: 'asc' },
      });

      if (batch.length === 0) break;

      // Chaque bon est traité individuellement dans sa propre transaction —
      // un échec sur un bon ne bloque pas le reste du lot.
      for (const voucher of batch) {
        try {
          await this.prisma.$transaction(async (tx) => {
            // Mise à jour du statut
            await tx.voucher.update({
              where: { id: voucher.id },
              data: { status: 'EXPIRED' },
            });

            // Écriture ledger EXPIRE : VOUCHER_LIABILITY:{vId} → EXPIRED_FORFEIT
            // Montant = remainingValue (centimes FCFA, toujours positif)
            if (voucher.remainingValue > 0) {
              await tx.ledgerEntry.create({
                data: {
                  type: 'EXPIRE',
                  debitAccount: `VOUCHER_LIABILITY:${voucher.id}`,
                  creditAccount: 'EXPIRED_FORFEIT',
                  amount: voucher.remainingValue,
                  voucherId: voucher.id,
                  companyId: voucher.companyId,
                  reference: crypto.randomUUID(),
                },
              });
            }
          });

          totalExpired++;
        } catch (err: unknown) {
          // Échec silencieux par voucher — le cron continue sur les suivants
          this.logger.error(
            `Échec expiration bon ${voucher.id} : ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Si le lot était plein, il peut y en avoir d'autres ; sinon on s'arrête.
      if (batch.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }

    this.logger.log(`Job expiration terminé — ${totalExpired} bon(s) expiré(s)`);
  }
}
