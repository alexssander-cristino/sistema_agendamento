const pool = require('../db');

function obterIp(req) {
  const forwarded = req.headers['x-forwarded-for'];

  if (forwarded) {
    return forwarded
      .split(',')[0]
      .trim();
  }

  return (
    req.headers['x-real-ip'] ||
    req.socket.remoteAddress ||
    null
  );
}

function identificarAcao(req, statusCode) {
  const rota = req.path || '';

  if (
    req.method === 'POST' &&
    (
      rota === '/api/auth/login' ||
      rota === '/api/auth'
    )
  ) {
    if (
      statusCode >= 200 &&
      statusCode < 300
    ) {
      return 'login_sucesso';
    }

    return 'login_falhou';
  }

  if (statusCode >= 500) {
    return 'erro_servidor';
  }

  if (statusCode >= 400) {
    return 'requisicao_falhou';
  }

  return 'requisicao';
}

function descricaoAcao(
  req,
  statusCode,
  acao,
  tempo
) {
  if (acao === 'login_sucesso') {
    return `Login realizado com sucesso em ${tempo} ms.`;
  }

  if (acao === 'login_falhou') {
    return `Tentativa de login recusada em ${tempo} ms.`;
  }

  if (acao === 'erro_servidor') {
    return `Erro interno durante a requisição. Tempo: ${tempo} ms.`;
  }

  if (acao === 'requisicao_falhou') {
    return `Requisição retornou HTTP ${statusCode}. Tempo: ${tempo} ms.`;
  }

  return `Requisição processada em ${tempo} ms.`;
}

function registrarLogs(req, res, next) {
  const inicio = Date.now();

  res.on('finish', async () => {
    try {
      const tempo = Date.now() - inicio;

      const statusCode = res.statusCode;

      const acao =
        identificarAcao(
          req,
          statusCode
        );

      const descricao =
        descricaoAcao(
          req,
          statusCode,
          acao,
          tempo
        );

      const usuario =
        req.usuario || null;

      /*
       * Capturamos somente o e-mail.
       *
       * Nunca salvamos senha,
       * token ou Authorization.
       */
      let emailTentativa = null;

      if (
        req.method === 'POST' &&
        (
          req.path === '/api/auth/login' ||
          req.path === '/api/auth'
        )
      ) {
        emailTentativa =
          typeof req.body?.email === 'string'
            ? req.body.email
                .trim()
                .toLowerCase()
                .slice(0, 255)
            : null;
      }

      const ip =
        obterIp(req);

      await pool.query(
        `
          INSERT INTO logs_sistema (
            usuario_id,
            empresa_id,
            email_tentativa,
            acao,
            descricao,
            metodo,
            rota,
            ip,
            status_http,
            tempo_ms
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10
          )
        `,
        [
          usuario?.id || null,

          usuario?.empresa_id ||
            null,

          emailTentativa,

          acao,

          descricao,

          req.method,

          req.originalUrl
            ?.split('?')[0] ||
            req.path,

          ip,

          statusCode,

          tempo
        ]
      );

    } catch (err) {
      /*
       * Nunca deixamos o sistema parar
       * porque o log falhou.
       */
      console.error(
        'Erro ao registrar log:',
        err.message
      );
    }
  });

  next();
}

module.exports = registrarLogs;