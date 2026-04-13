import net from 'node:net';
import tls from 'node:tls';

function base64(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64');
}

function normalizeBoolean(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'sim', 'on'].includes(normalized);
}

function getSmtpConfig() {
  return {
    host: String(process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT || 465),
    secure: normalizeBoolean(process.env.SMTP_SECURE, Number(process.env.SMTP_PORT || 465) === 465),
    user: String(process.env.SMTP_USER || '').trim(),
    pass: String(process.env.SMTP_PASS || '').trim(),
    fromName: String(process.env.SMTP_FROM_NAME || 'Orça Feito').trim(),
    fromEmail: String(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '').trim(),
    rejectUnauthorized: normalizeBoolean(process.env.SMTP_REJECT_UNAUTHORIZED, false)
  };
}

function escapeHeader(value = '') {
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

function dotStuff(value = '') {
  return String(value).replace(/(^|\r\n)\./g, '$1..');
}

function buildMessage({ fromName, fromEmail, to, subject, text }) {
  const lines = [
    `From: ${escapeHeader(fromName)} <${escapeHeader(fromEmail)}>`,
    `To: <${escapeHeader(to)}>`,
    `Subject: ${escapeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    dotStuff(text || '')
  ];

  return `${lines.join('\r\n')}\r\n`;
}

class SmtpConnection {
  constructor(socket) {
    this.socket = socket;
    this.buffer = '';
    this.pending = [];

    socket.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      this.flush();
    });

    socket.on('error', (error) => {
      while (this.pending.length) {
        const item = this.pending.shift();
        item.reject(error);
      }
    });

    socket.on('close', () => {
      while (this.pending.length) {
        const item = this.pending.shift();
        item.reject(new Error('Conexão SMTP encerrada.'));
      }
    });
  }

  flush() {
    while (this.pending.length) {
      const response = this.extractResponse();
      if (!response) {
        return;
      }

      const item = this.pending.shift();
      item.resolve(response);
    }
  }

  extractResponse() {
    const lines = this.buffer.split(/\r?\n/);

    if (lines.length < 2) {
      return null;
    }

    const responseLines = [];
    let consumedLineCount = 0;
    let expectedCode = null;

    for (let index = 0; index < lines.length - 1; index += 1) {
      const line = lines[index];
      const match = /^(\d{3})([ -])/.exec(line);

      if (!match) {
        return null;
      }

      expectedCode = expectedCode || match[1];
      responseLines.push(line);
      consumedLineCount += 1;

      if (match[1] === expectedCode && match[2] === ' ') {
        this.buffer = lines.slice(consumedLineCount).join('\r\n');
        return {
          code: Number(expectedCode),
          text: responseLines.join('\n')
        };
      }
    }

    return null;
  }

  waitResponse() {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.flush();
    });
  }

  async send(command, expectedCodes = []) {
    if (command != null) {
      this.socket.write(`${command}\r\n`);
    }

    const response = await this.waitResponse();

    if (expectedCodes.length > 0 && !expectedCodes.includes(response.code)) {
      throw new Error(`SMTP respondeu ${response.code}: ${response.text}`);
    }

    return response;
  }
}

function openPlainConnection(config) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: config.host,
      port: config.port
    });

    socket.once('error', reject);
    socket.once('connect', () => {
      socket.removeListener('error', reject);
      resolve(socket);
    });
  });
}

function openTlsConnection(config, socket = null) {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({
      host: config.host,
      port: config.port,
      socket: socket || undefined,
      servername: config.host,
      rejectUnauthorized: config.rejectUnauthorized
    });

    tlsSocket.once('error', reject);
    tlsSocket.once('secureConnect', () => {
      tlsSocket.removeListener('error', reject);
      resolve(tlsSocket);
    });
  });
}

async function authenticate(connection, config) {
  if (!config.user) {
    return;
  }

  await connection.send('AUTH LOGIN', [334]);
  await connection.send(base64(config.user), [334]);
  await connection.send(base64(config.pass), [235]);
}

export async function sendEmail({ to, subject, text }) {
  const config = getSmtpConfig();

  if (!config.host || !config.port || !config.fromEmail) {
    throw new Error('Configure SMTP_HOST, SMTP_PORT e SMTP_FROM_EMAIL para enviar os acessos por e-mail.');
  }

  if (config.user && !config.pass) {
    throw new Error('SMTP_PASS não foi configurado.');
  }

  let socket;

  try {
    socket = config.secure
      ? await openTlsConnection(config)
      : await openPlainConnection(config);

    let connection = new SmtpConnection(socket);

    await connection.send(null, [220]);
    await connection.send(`EHLO ${config.host}`, [250]);

    if (!config.secure) {
      await connection.send('STARTTLS', [220]);
      socket = await openTlsConnection(config, socket);
      connection = new SmtpConnection(socket);
      await connection.send(`EHLO ${config.host}`, [250]);
    }

    await authenticate(connection, config);
    await connection.send(`MAIL FROM:<${config.fromEmail}>`, [250]);
    await connection.send(`RCPT TO:<${to}>`, [250, 251]);
    await connection.send('DATA', [354]);

    const message = buildMessage({
      fromName: config.fromName,
      fromEmail: config.fromEmail,
      to,
      subject,
      text
    });

    socket.write(`${message}\r\n.\r\n`);
    await connection.waitResponse().then((response) => {
      if (![250].includes(response.code)) {
        throw new Error(`SMTP respondeu ${response.code}: ${response.text}`);
      }
    });

    await connection.send('QUIT', [221]);
  } finally {
    if (socket && !socket.destroyed) {
      socket.end();
    }
  }
}

export async function sendWelcomeAccessEmail({ to, password, appLink }) {
  const safeAppLink = String(appLink || 'https://app.orcafeito.com.br').trim();
  const subject = 'Seu acesso ao Orça Feito foi liberado';
  const text = [
    'Olá!',
    '',
    'Recebemos e aprovamos o seu pagamento no Orça Feito.',
    '',
    'Seus dados de acesso:',
    `E-mail: ${to}`,
    `Senha inicial: ${password}`,
    `Link do app: ${safeAppLink}`,
    '',
    'Recomendamos alterar a senha depois do primeiro acesso.',
    '',
    'Obrigado por escolher o Orça Feito.'
  ].join('\n');

  return sendEmail({ to, subject, text });
}

