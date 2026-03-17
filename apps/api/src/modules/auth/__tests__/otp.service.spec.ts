import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException } from '@nestjs/common';
import { OtpService } from '../otp.service';

// ─── P0 : OTP TTL 5min + blocage 30min après 3 échecs ────────────────────────

const mockRedis = {
  get: vi.fn(),
  setex: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  del: vi.fn(),
  incrWithExpire: vi.fn(),
};

describe('OtpService — Tests P0', () => {
  let service: OtpService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OtpService(mockRedis as any);
  });

  describe('send()', () => {
    it('refuse si le numéro est bloqué', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('otp_blocked:')) return '1';
        return null;
      });

      await expect(service.send('+221771234567')).rejects.toThrow(
        HttpException,
      );
    });

    it('refuse après 3 envois dans la même heure', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('otp_blocked:')) return null;
        if (key.startsWith('otp_tries:')) return '3';
        return null;
      });

      await expect(service.send('+221771234567')).rejects.toThrow(
        HttpException,
      );
    });

    it('génère et stocke un code 6 chiffres avec TTL 5 min', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incrWithExpire.mockResolvedValue(1);
      mockRedis.setex.mockResolvedValue('OK');

      await service.send('+221771234567');

      // Vérifie TTL = 300s (5 minutes)
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'otp:+221771234567',
        300,
        expect.stringMatching(/^[0-9]{6}$/),
      );
    });
  });

  describe('verify()', () => {
    it('retourne false si le code est expiré (clé Redis absente)', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.verify('+221771234567', '123456');
      expect(result).toBe(false);
    });

    it('bloque le compte après 3 échecs consécutifs', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'otp:+221771234567') return '999999';
        return null;
      });
      mockRedis.incr.mockResolvedValue(3); // 3e échec
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);

      await expect(service.verify('+221771234567', '000000')).rejects.toThrow(
        HttpException,
      );

      // Vérifie que le blocage dure 30 min (1800s)
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'otp_blocked:+221771234567',
        1800,
        '1',
      );
    });

    it('retourne true et nettoie les clés si code correct', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'otp:+221771234567') return '123456';
        return null;
      });
      mockRedis.del.mockResolvedValue(1);

      const result = await service.verify('+221771234567', '123456');
      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith(
        'otp:+221771234567',
        'otp_fails:+221771234567',
      );
    });
  });
});
