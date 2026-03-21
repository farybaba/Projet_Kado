// k6 load test — validation QR 100 VU simultanés
// Objectif: P95 < 300ms sur /api/v1/vouchers/validate

import http from 'k6/http';
import { check, sleep } from 'k6';

const API_URL = __ENV.API_URL ?? 'http://localhost:3001';
const VOUCHER_CODE = __ENV.VOUCHER_CODE ?? '';
const QR_SIG = __ENV.QR_SIG ?? '';
const OTP_CODE = __ENV.OTP_CODE ?? '123456';
const TEST_PHONE = '+221770000001';

export const options = {
  vus: 100,
  duration: '30s',
  thresholds: {
    'http_req_duration': ['p(95)<300'],
    'http_req_failed': ['rate<0.01'],
  },
};

// setup() — s'exécute une seule fois avant le test, retourne un contexte partagé
export function setup() {
  // Étape 1 : envoyer l'OTP
  const sendRes = http.post(
    `${API_URL}/api/v1/auth/otp/send`,
    JSON.stringify({ phone: TEST_PHONE }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(sendRes, {
    'OTP send — status 201 ou 200': (r) => r.status === 200 || r.status === 201,
  });

  // Étape 2 : vérifier l'OTP et récupérer le token JWT
  const verifyRes = http.post(
    `${API_URL}/api/v1/auth/otp/verify`,
    JSON.stringify({ phone: TEST_PHONE, code: OTP_CODE }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(verifyRes, {
    'OTP verify — status 200 ou 201': (r) => r.status === 200 || r.status === 201,
  });

  const body = verifyRes.json();
  const accessToken = body && body.accessToken ? body.accessToken : '';

  if (!accessToken) {
    console.error(
      `setup() — impossible d'obtenir un accessToken. Réponse: ${verifyRes.body}`,
    );
  }

  return { accessToken };
}

// default function — exécutée par chaque VU en boucle
export default function (data) {
  const token = data.accessToken;

  const payload = JSON.stringify({
    code: VOUCHER_CODE,
    qrSignature: QR_SIG,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    tags: { endpoint: 'validate' },
  };

  const res = http.post(`${API_URL}/api/v1/vouchers/validate`, payload, params);

  // 200 = succès, 409 = bon déjà utilisé / solde insuffisant — les deux sont acceptables
  check(res, {
    'validate — status 200 ou 409': (r) => r.status === 200 || r.status === 409,
    'validate — réponse JSON': (r) => {
      try {
        r.json();
        return true;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
