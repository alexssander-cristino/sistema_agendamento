'use strict';

// Mantém compatibilidade com as rotas existentes de teste de push.
const push = require('./push');

function obterFirebaseMessaging() {
  const admin = push.obterFirebase();
  if (!admin) {
    const erro = new Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON nas variáveis de ambiente.');
    erro.codigoDiagnostico = 'FIREBASE_CREDENCIAL_AUSENTE_OU_INVALIDA';
    throw erro;
  }
  return admin.messaging();
}

async function enviarParaTokensAtivos({ titulo, corpo, link = '/' } = {}) {
  return push.enviarParaTokensAtivos({ titulo, corpo, link });
}
async function enviarParaDesenvolvedores({ titulo, corpo, link = '/' } = {}) {
  return push.enviarParaDesenvolvedores({ titulo, corpo, link });
}
async function enviarAlertaSeguranca({ titulo, corpo, link = '/admin/logs' } = {}) {
  return push.enviarAlertaSeguranca({ titulo, corpo, link });
}
async function desativarToken(token) {
  const pool = require('../db');
  await Promise.all([
    pool.query('UPDATE public.notificacoes_tokens SET ativo = FALSE WHERE token = $1', [token]),
    pool.query('DELETE FROM public.dispositivos WHERE token = $1', [token])
  ]);
}

module.exports = { obterFirebaseMessaging, enviarParaTokensAtivos, enviarParaDesenvolvedores, enviarAlertaSeguranca, desativarToken };
