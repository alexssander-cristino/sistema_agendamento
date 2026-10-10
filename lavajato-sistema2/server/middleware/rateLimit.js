'use strict';

const { rateLimit } = require('express-rate-limit');

const monitoramentoSeguranca =
  require('../services/monitoramentoSeguranca');

// ============================================================
// CONFIGURAÇÃO SEGURA DO RATE LIMIT
// ============================================================

function registrarAlerta(req, codigo) {
  try {
    monitoramentoSeguranca.registrarRateLimit(req, codigo);
  } catch (erro) {
    console.error('[ORVIX SEGURANÇA] Falha ao registrar alerta:', {
      codigo,
      mensagem: String(erro?.message || 'Erro desconhecido').slice(0, 200)
    });
  }
}

function criarRespostaRateLimit({
  codigo,
  mensagem,
  limite,
  janelaMs
}) {
  return (req, res) => {
    registrarAlerta(req, codigo);

    res.setHeader('Cache-Control', 'no-store');

    return res.status(429).json({
      erro: mensagem,
      codigo,
      redirecionar: '/429.html',
      ...(limite ? { limite } : {}),
      ...(req.rateLimit?.used
        ? { tentativas: req.rateLimit.used }
        : {}),
      aguardarSegundos: Math.ceil(janelaMs / 1000)
    });
  };
}

// ============================================================
// 1. RATE LIMIT GERAL DA API
// ============================================================
//
// Máximo de 120 requisições por IP a cada minuto.
//
// Ao exceder:
// - Responde HTTP 429.
// - Registra alerta de segurança.
// - Evita cache da resposta.
// - Mantém a API funcionando normalmente.
//
// ============================================================

const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  message: {
    erro: 'Muitas requisições. Tente novamente em alguns instantes.',
    codigo: 'RATE_LIMIT_GERAL'
  },

  handler: criarRespostaRateLimit({
    codigo: 'RATE_LIMIT_GERAL',
    mensagem: 'Muitas requisições. Tente novamente em alguns instantes.',
    limite: 120,
    janelaMs: 60 * 1000
  })
});

// ============================================================
// 2. RATE LIMIT DE AUTENTICAÇÃO
// ============================================================
//
// Máximo de 6 tentativas malsucedidas em 15 minutos.
//
// Tentativas bem-sucedidas não contam para o limite.
//
// ============================================================

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  skipSuccessfulRequests: true,

  handler: criarRespostaRateLimit({
    codigo: 'RATE_LIMIT_AUTENTICACAO',
    mensagem:
      'Você atingiu o limite de tentativas de autenticação. Aguarde 15 minutos antes de tentar novamente.',
    limite: 6,
    janelaMs: 15 * 60 * 1000
  })
});

// ============================================================
// 3. RATE LIMIT DE RECUPERAÇÃO DE SENHA
// ============================================================
//
// Máximo de 5 solicitações por IP a cada 15 minutos.
//
// ============================================================

const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,

  standardHeaders: 'draft-8',
  legacyHeaders: false,

  handler: criarRespostaRateLimit({
    codigo: 'RATE_LIMIT_RECUPERACAO',
    mensagem:
      'Muitas solicitações de recuperação de senha. Tente novamente mais tarde.',
    limite: 5,
    janelaMs: 15 * 60 * 1000
  })
});

// ============================================================
// AUXILIAR PARA CONSULTAR O FIM DO BLOQUEIO
// ============================================================

function bloqueadoAte(req, fallbackMs = 60 * 1000) {
  const reset = req.rateLimit?.resetTime;

  if (reset instanceof Date && Number.isFinite(reset.getTime())) {
    return reset.getTime();
  }

  if (typeof reset === 'number' && Number.isFinite(reset)) {
    return reset;
  }

  return Date.now() + fallbackMs;
}

// ============================================================
// EXPORTAÇÕES
// ============================================================

module.exports = {
  apiRateLimit,
  authRateLimit,
  passwordResetRateLimit,
  bloqueadoAte
};