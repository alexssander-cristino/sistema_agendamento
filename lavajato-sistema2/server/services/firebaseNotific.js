
'use strict';

const admin = require('firebase-admin');
const pool = require('../db');

let firebaseApp = null;

function erroDiagnostico(codigo, mensagem) {
  const erro = new Error(mensagem);
  erro.codigoDiagnostico = codigo;
  return erro;
}

// ============================================================
// FIREBASE ADMIN
// ============================================================

function obterFirebaseMessaging() {
  if (firebaseApp) {
    return admin.messaging(firebaseApp);
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!json) {
    throw erroDiagnostico(
      'FIREBASE_ENV_AUSENTE',
      'A variável FIREBASE_SERVICE_ACCOUNT_JSON não está configurada.'
    );
  }

  let credencial;

  try {
    credencial = JSON.parse(json);
  } catch {
    throw erroDiagnostico(
      'FIREBASE_JSON_INVALIDO',
      'O JSON da conta de serviço não é válido.'
    );
  }

  if (
    !credencial.project_id ||
    !credencial.client_email ||
    !credencial.private_key
  ) {
    throw erroDiagnostico(
      'FIREBASE_CREDENCIAL_INCOMPLETA',
      'Faltam campos obrigatórios na conta de serviço.'
    );
  }

  // Corrige as quebras de linha escapadas da chave privada.
  credencial.private_key = credencial.private_key.replace(/\\n/g, '\n');

  try {
    firebaseApp = admin.apps.length > 0
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(credencial)
        });

    return admin.messaging(firebaseApp);
  } catch (erro) {
    console.error('[Orvix Push] Falha na inicialização do Firebase:', {
      code: erro.code || null,
      message: erro.message
    });

    throw erroDiagnostico(
      'FIREBASE_INICIALIZACAO_FALHOU',
      'O Firebase Admin não conseguiu inicializar.'
    );
  }
}

// ============================================================
// LINK DA NOTIFICAÇÃO
// ============================================================

function obterLinkNotificacao(link = '/') {
  const appUrl = String(process.env.APP_URL || '').trim();

  if (!appUrl) {
    return undefined;
  }

  let urlBase;

  try {
    urlBase = new URL(appUrl);

    if (!['http:', 'https:'].includes(urlBase.protocol)) {
      throw new Error('Protocolo inválido.');
    }
  } catch {
    throw erroDiagnostico(
      'APP_URL_INVALIDA',
      'A variável APP_URL não contém uma URL válida.'
    );
  }

  try {
    const url = new URL(link || '/', urlBase.origin + '/');

    if (
      url.origin !== urlBase.origin ||
      !['http:', 'https:'].includes(url.protocol)
    ) {
      return urlBase.origin + '/';
    }

    return url.toString();
  } catch {
    return urlBase.origin + '/';
  }
}

// ============================================================
// ENVIO
// ============================================================

async function enviarParaDesenvolvedores({
  usuarioId,
  titulo,
  mensagem,
  link = '/'
}) {
  if (!usuarioId) {
    throw erroDiagnostico(
      'USUARIO_DESTINATARIO_INVALIDO',
      'O ID do destinatário é obrigatório.'
    );
  }

  if (
    typeof titulo !== 'string' ||
    !titulo.trim() ||
    typeof mensagem !== 'string' ||
    !mensagem.trim()
  ) {
    throw erroDiagnostico(
      'NOTIFICACAO_INVALIDA',
      'Título e mensagem são obrigatórios.'
    );
  }

  let rows;

  try {
    const resultado = await pool.query(
      `SELECT id, token
         FROM notificacoes_tokens
        WHERE usuario_id = $1
          AND ativo = TRUE`,
      [usuarioId]
    );

    rows = resultado.rows;
  } catch (erro) {
    console.error('[Orvix Push] Falha ao consultar dispositivos:', {
      code: erro.code || null,
      message: erro.message
    });

    throw erroDiagnostico(
      'BANCO_CONSULTA_TOKENS_FALHOU',
      'Não foi possível consultar os dispositivos registrados.'
    );
  }

  if (rows.length === 0) {
    return {
      enviados: 0,
      falhas: 0,
      diagnostico: 'NENHUM_DISPOSITIVO_ATIVO'
    };
  }

  const messaging = obterFirebaseMessaging();
  const linkFinal = obterLinkNotificacao(link);

  let enviados = 0;
  let falhas = 0;
  const codigosErro = [];

  for (const dispositivo of rows) {
    try {
      const notificacao = {
        token: dispositivo.token,
        notification: {
          title: titulo.trim().slice(0, 100),
          body: mensagem.trim().slice(0, 300)
        }
      };

      if (linkFinal) {
        notificacao.webpush = {
          fcmOptions: {
            link: linkFinal
          }
        };
      }

      await messaging.send(notificacao);
      enviados++;
    } catch (erro) {
      falhas++;

      const codigo = erro.code || 'ERRO_DESCONHECIDO';

      if (!codigosErro.includes(codigo)) {
        codigosErro.push(codigo);
      }

      console.error('[Orvix Push] Falha no envio:', {
        dispositivoId: dispositivo.id,
        code: codigo,
        message: erro.message
      });

      const tokenInvalido = [
        'messaging/registration-token-not-registered',
        'messaging/invalid-registration-token'
      ].includes(codigo);

      if (tokenInvalido) {
        try {
          await pool.query(
            `UPDATE notificacoes_tokens
                SET ativo = FALSE,
                    atualizado_em = NOW()
              WHERE id = $1
                AND usuario_id = $2`,
            [dispositivo.id, usuarioId]
          );
        } catch (erroBanco) {
          console.error('[Orvix Push] Falha ao desativar token:', {
            code: erroBanco.code || null,
            message: erroBanco.message
          });
        }
      }
    }
  }

  return {
    enviados,
    falhas,
    codigosErro
  };
}

module.exports = {
  enviarParaDesenvolvedores
};