const { rateLimit } = require('express-rate-limit');


// ============================================================
// RATE LIMIT GERAL DA API
// ============================================================
//
// 120 requisições por IP a cada 1 minuto.
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
// 6 tentativas de autenticação inválidas por IP
// a cada 15 minutos.
//
// Login correto NÃO consome tentativa.
//
// Exemplo:
//
// senha errada  -> tentativa 1 de 6
// senha errada  -> tentativa 2 de 6
// senha errada  -> tentativa 3 de 6
// senha errada  -> tentativa 4 de 6
// senha errada  -> tentativa 5 de 6
// senha errada  -> tentativa 6 de 6
//                 ↓
//                 HTTP 429
//                 ↓
//              /429.html
//
// ============================================================

const authRateLimit = rateLimit({

  windowMs: 15 * 60 * 1000,

  limit: 6,

  standardHeaders: 'draft-8',

  legacyHeaders: false,

  // ==========================================================
  // LOGIN BEM-SUCEDIDO NÃO CONSUME O LIMITE
  // ==========================================================

  skipSuccessfulRequests: true,

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
        'Você atingiu o limite de 6 tentativas. Aguarde 15 minutos antes de tentar novamente.',

      codigo:
        'RATE_LIMIT_AUTENTICACAO',

      redirecionar:
        '/429.html',

      limite:
        6,

      tentativas:
        req.rateLimit?.used || 6

    });
  }

});


// ============================================================
// RATE LIMIT DE RECUPERAÇÃO DE SENHA
// ============================================================
//
// 5 solicitações por IP a cada 15 minutos.
//
// ============================================================

const passwordResetRateLimit = rateLimit({

  windowMs: 15 * 60 * 1000,

  limit: 5,

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
        'Muitas solicitações de recuperação. Tente novamente mais tarde.',

      codigo:
        'RATE_LIMIT_RECUPERACAO',

      redirecionar:
        '/429.html'

    });
  }

});


function bloqueadoAte(req, fallbackMs) {
  const reset = req.rateLimit?.resetTime;
  return reset
    ? new Date(reset).getTime()
    : Date.now() + fallbackMs;
}

// ============================================================
// EXPORTAR
// ============================================================

module.exports = {
  apiRateLimit,
  authRateLimit,
  passwordResetRateLimit
};