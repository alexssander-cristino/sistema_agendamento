const { rateLimit } = require('express-rate-limit');


// ============================================================
// RATE LIMIT GERAL DA API
// ============================================================
//
// 120 requisições por IP a cada 1 minuto.
//
// Esse limite protege as rotas da API contra:
// - abuso
// - excesso de requisições
// - scripts automatizados
// - consumo exagerado de recursos
//
// Não é aplicado ao frontend/public.
// ============================================================

const apiRateLimit = rateLimit({

  windowMs: 60 * 1000,

  limit: 120,

  standardHeaders: 'draft-8',

  legacyHeaders: false,

  message: {
    erro: 'Muitas requisições. Tente novamente em alguns instantes.'
  },

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
        'Muitas requisições. Tente novamente em alguns instantes.'
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
// O objetivo é dificultar:
// - brute force
// - tentativa automatizada de senhas
// - criação abusiva de contas
// ============================================================

const authRateLimit = rateLimit({

  windowMs: 15 * 60 * 1000,

  limit: 10,

  standardHeaders: 'draft-8',

  legacyHeaders: false,

  message: {
    erro:
      'Muitas tentativas de autenticação. Tente novamente mais tarde.'
  },

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
        'Muitas tentativas de autenticação. Tente novamente mais tarde.'
    });
  }

  

});

const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,

  message: {
    erro:
      'Muitas solicitações de recuperação. Tente novamente mais tarde.'
  },

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
        'Muitas solicitações de recuperação. Tente novamente mais tarde.'
    });
  }
});


module.exports = {
  apiRateLimit,
  authRateLimit,
  passwordResetRateLimit
};

