function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

function stripAccents(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function sanitizeText(value = '', maxLength = 99) {
  return stripAccents(value)
    .toUpperCase()
    .replace(/[^A-Z0-9 $%*+\-./:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function formatEmv(id, value) {
  const stringValue = String(value ?? '');
  const length = String(stringValue.length).padStart(2, '0');
  return `${id}${length}${stringValue}`;
}

function crc16(payload) {
  let crc = 0xffff;

  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;

    for (let j = 0; j < 8; j += 1) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }

      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function formatAmountFromCents(amountCents = 0) {
  const cents = Number(amountCents || 0);
  return (cents / 100).toFixed(2);
}

export function sanitizePixKeyType(value = '') {
  const normalized = String(value || '').trim().toLowerCase();

  if (["cpf", "cnpj", "email", "telefone", "aleatoria"].includes(normalized)) {
    return normalized;
  }

  return 'email';
}

export function sanitizePixKey(value = '', type = 'email') {
  const keyType = sanitizePixKeyType(type);
  const input = String(value || '').trim();

  if (keyType === 'cpf' || keyType === 'cnpj') {
    return onlyDigits(input);
  }

  if (keyType === 'telefone') {
    return input.replace(/\s+/g, '');
  }

  return input;
}

export function generatePixTxId(prefix = 'ORCAFEITO') {
  const safePrefix = sanitizeText(prefix, 10).replace(/\s+/g, '');
  const randomPart = Math.random().toString(36).slice(2, 10).toUpperCase();
  const timestampPart = Date.now().toString(36).toUpperCase().slice(-10);
  return `${safePrefix}${timestampPart}${randomPart}`.replace(/[^A-Z0-9]/g, '').slice(0, 25) || 'ORCAFEITO001';
}

export function buildPixPayload({
  key,
  beneficiaryName,
  city,
  amountCents,
  description = '',
  txid = '***'
}) {
  const sanitizedKey = String(key || '').trim();

  if (!sanitizedKey) {
    throw new Error('A chave PIX não foi configurada.');
  }

  const merchantName = sanitizeText(beneficiaryName || 'ORCA FEITO', 25) || 'ORCA FEITO';
  const merchantCity = sanitizeText(city || 'SAO PAULO', 15) || 'SAO PAULO';
  const merchantDescription = sanitizeText(description || '', 72);
  const safeTxid = sanitizeText(txid || '***', 25).replace(/\s+/g, '') || '***';

  let merchantAccountInfo = formatEmv('00', 'br.gov.bcb.pix') + formatEmv('01', sanitizedKey);

  if (merchantDescription) {
    merchantAccountInfo += formatEmv('02', merchantDescription);
  }

  const amount = formatAmountFromCents(amountCents);

  let payload = '';
  payload += formatEmv('00', '01');
  payload += formatEmv('01', '12');
  payload += formatEmv('26', merchantAccountInfo);
  payload += formatEmv('52', '0000');
  payload += formatEmv('53', '986');
  payload += formatEmv('54', amount);
  payload += formatEmv('58', 'BR');
  payload += formatEmv('59', merchantName);
  payload += formatEmv('60', merchantCity);
  payload += formatEmv('62', formatEmv('05', safeTxid));
  payload += '6304';
  payload += crc16(payload);

  return payload;
}

export function buildPixQrCodeUrl(payload, size = 320) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${Number(size)}x${Number(size)}&data=${encodeURIComponent(payload)}`;
}
