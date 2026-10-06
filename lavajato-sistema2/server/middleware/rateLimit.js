const { rateLimit } = require('express-rate-limit');

// ============================================================
// RATE LIMIT GERAL DA API
// ============================================================
//
// 120 requisições por IP a cada 1 minuto.
//
// Protege a API contra:
// - abuso
// - excesso de requisições
// - scripts automatizados
// - consumo exagerado de recursos
//
// ============================================================

const apiRateLimit = rateLimit({

  windowMs: 60 * 1000,

  limit: 120,

  standardHeaders: 'draft-8',

  legacyHeaders: false,

  handler: (req, res) => {

    console.warn(
      '[RATE LIMIT] Limite geral atingido:',
      {
        ip: req.ip,
        metodo: req.method,
        rota: req.originalUrl
      }
    );

    return res.status(429).json({
      erro:
        'Muitas requisições. Tente novamente em alguns instantes.',

      codigo:
        'RATE_LIMIT_GERAL',

      redirecionar:
        '/429.html'
    });
  }

});

// ============================================================
// RATE LIMIT DE AUTENTICAÇÃO
// ============================================================
//
// 10 requisições por IP a cada 15 minutos.
//
// Aplicado principalmente em:
// POST /api/auth/login
// POST /api/auth/cadastro
//
// ============================================================

const authRateLimit = rateLimit({

  windowMs: 15 * 60 * 1000,

  limit: 10,

  standardHeaders: 'draft-8',

  legacyHeaders: false,

  handler: (req, res) => {

    console.warn(
      '[RATE LIMIT] Limite de autenticação atingido:',
      {
        ip: req.ip,
        metodo: req.method,
        rota: req.originalUrl
      }
    );

    return res.status(429).json({
      erro:
        'Muitas tentativas de autenticação. Aguarde 15 minutos antes de tentar novamente.',

      codigo:
        'RATE_LIMIT_AUTENTICACAO',

      redirecionar:
        '/429.html'
    });
  }

});

// ============================================================
// RATE LIMIT DE RECUPERAÇÃO DE SENHA
// ============================================================
//
// 6 solicitações por IP a cada 15 minutos.
//
// Protege contra abuso do envio de e-mails de recuperação.
//
// ============================================================

const passwordResetRateLimit = rateLimit({

  windowMs: 15 * 60 * 1000,

  limit: 6,

  standardHeaders: 'draft-8',

  legacyHeaders: false,

  handler: (req, res) => {

    console.warn(
      '[RATE LIMIT] Recuperação de senha:',
      {
        ip: req.ip,
        metodo: req.method,
        rota: req.originalUrl
      }
    );

    return res.status(429).json({
      erro:
        'Muitas solicitações de recuperação. Aguarde 15 minutos antes de tentar novamente.',

      codigo:
        'RATE_LIMIT_RECUPERACAO',

      redirecionar:
        '/429.html'
    });
  }

});

// ============================================================
// EXPORTAR
// ============================================================

module.exports = {
  apiRateLimit,
  authRateLimit,
  passwordResetRateLimit
};