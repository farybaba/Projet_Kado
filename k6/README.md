# Tests de charge k6 — KaDo

## Prérequis

Installer k6 : https://k6.io/docs/get-started/installation/

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

---

## load-test-validate.js

**Objectif** : valider la résistance de l'endpoint `/api/v1/vouchers/validate` sous 100 utilisateurs virtuels simultanés.

**Seuils de succès** :
- P95 de la durée des requêtes < 300 ms
- Taux d'échec HTTP < 1 %

### Exécution

```bash
k6 run \
  -e API_URL=https://kado-api.up.railway.app \
  -e VOUCHER_CODE=<code> \
  -e QR_SIG=<sig> \
  k6/load-test-validate.js
```

### Variables d'environnement

| Variable       | Obligatoire | Description                                              |
|----------------|-------------|----------------------------------------------------------|
| `API_URL`      | Oui         | Base URL de l'API (sans slash final)                     |
| `VOUCHER_CODE` | Oui         | Code UUID du bon de test                                 |
| `QR_SIG`       | Oui         | Signature HMAC-SHA256 du QR du bon de test               |
| `OTP_CODE`     | Non         | Code OTP (défaut : `123456` — mode dev uniquement)       |

### Exemple local (dev)

```bash
k6 run \
  -e API_URL=http://localhost:3001 \
  -e VOUCHER_CODE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
  -e QR_SIG=abcdef1234567890 \
  -e OTP_CODE=123456 \
  k6/load-test-validate.js
```

> **Note** : Le compte de test `+221770000001` doit exister en base avec le rôle `MERCHANT`.
> En environnement de staging/production, fournir un `OTP_CODE` valide via les fixtures de test.

### Interprétation des résultats

- `http_req_duration p(95)` — doit rester sous 300 ms
- `http_req_failed` — doit rester sous 1 %
- Les réponses HTTP 409 (`VOUCHER_ALREADY_USED`, `INSUFFICIENT_BALANCE`) sont considérées comme des succès dans ce test car elles indiquent que la logique anti double-dépense fonctionne correctement.
