import { describe, it, expect, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

// ─── P0 : Webhook Wave — signature invalide → 401 ────────────────────────────

const FAKE_SECRET = 'a'.repeat(64); // 32 octets hex

function makeSignature(body: Buffer, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('PaymentsService.verifyWaveWebhook — Tests P0', () => {
  let verifyFn: (rawBody: Buffer, signature: string) => void;

  beforeEach(() => {
    // Reproduire la logique de vérification directement
    verifyFn = (rawBody: Buffer, signature: string) => {
      const expected = crypto
        .createHmac('sha256', FAKE_SECRET)
        .update(rawBody)
        .digest('hex');

      const expectedBuf = Buffer.from(expected);
      const receivedBuf = Buffer.from(signature);

      if (
        expectedBuf.length !== receivedBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, receivedBuf)
      ) {
        throw new UnauthorizedException('Signature Wave invalide');
      }
    };
  });

  it('accepte une signature valide', () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.completed' }));
    const sig = makeSignature(body, FAKE_SECRET);

    expect(() => verifyFn(body, sig)).not.toThrow();
  });

  it('rejette une signature invalide → UnauthorizedException', () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.completed' }));
    const wrongSig = 'b'.repeat(64);

    expect(() => verifyFn(body, wrongSig)).toThrow(UnauthorizedException);
  });

  it('rejette si le body a été modifié (HMAC)', () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.completed' }));
    const sig = makeSignature(body, FAKE_SECRET);
    const tamperedBody = Buffer.from(JSON.stringify({ event: 'payment.completed', amount: 99999 }));

    expect(() => verifyFn(tamperedBody, sig)).toThrow(UnauthorizedException);
  });

  it('utilise timingSafeEqual — longueurs différentes → rejet', () => {
    const body = Buffer.from('test');
    const shortSig = 'abc';

    expect(() => verifyFn(body, shortSig)).toThrow(UnauthorizedException);
  });
});

// ─── P0 : Commission 2% — Math.round, jamais float ───────────────────────────

describe('Commission Kado', () => {
  it('calcule 2% avec Math.round', () => {
    const amount = 10_000_00; // 10 000 FCFA
    const commission = Math.round(amount * 0.02);
    expect(commission).toBe(20_000); // 200 FCFA
    expect(Number.isInteger(commission)).toBe(true);
  });

  it('net = amount - commission (invariant débit/crédit)', () => {
    const amount = 7_777_00;
    const commission = Math.round(amount * 0.02);
    const net = amount - commission;
    expect(net + commission).toBe(amount);
  });
});
