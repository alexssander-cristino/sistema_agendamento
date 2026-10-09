
'use strict';

const admin = require('firebase-admin');
const pool = require('../db');

let firebaseApp = null;

// ============================================================
// FIREBASE ADMIN
// ============================================================

function obterFirebaseMessaging() {
  if (firebaseApp) {
    return admin.messaging(firebaseApp);
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!json) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON não configurado no ambiente.'
    );
  }

  let credencial;

  try {
    credencial = JSON.parse(json);
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON contém JSON inválido.'
    );
  }

  if (
    !credencial.project_id ||
    !credencial.client_email ||
    !credencial.private_key
  ) {
    throw new Error(
      'A conta de serviço Firebase está incompleta.'
    );
  }

  // Corrige quebras de linha escapadas na chave privada.
  credencial.private_key = credencial.private_key.replace(
    /\\n/g,
    '\n'
  );

  try {
    firebaseApp = admin.apps.length > 0
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(credencial)
        });

    return admin.messaging(firebaseApp);
  } catch (erro) {
    console.error('[Orvix Push] Falha ao inicializar Firebase:', {
      code: erro.code || null,
      message: erro.message
    });

    throw new Error(
      'Não foi possível inicializar o Firebase Admin.'
    );
  }
}

// ============================================================
// LINK SEGURO DA NOTIFICAÇÃO
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
      return undefined;
    }
  } catch {
    throw new Error(
      'APP_URL não contém uma URL válida.'
    );
  }

  try {
    const url = new URL(link || '/', `${urlBase.origin}/`);

    // Impede redirecionamentos para domínios externos.
    if (
      url.origin !== urlBase.origin ||
      !['http:', 'https:'].includes(url.protocol)
    ) {
      return `${urlBase.origin}/`;
    }

    return url.toString();
  } catch {
    return `${urlBase.origin}/`;
  }
}

// ============================================================
// IDENTIFICAR TOKENS INVÁLIDOS
// ============================================================

function tokenInvalido(erro) {
  return [
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token'
  ].includes(erro.code);
}

// ============================================================
// ENVIAR NOTIFICAÇÕES AOS DISPOSITIVOS DO DESENVOLVEDOR
// ============================================================

async function enviarParaDesenvolvedores({
  usuarioId,
  titulo,
  mensagem,
  link = '/'
}) {
  if (!usuarioId) {
    throw new Error(
      'Informe o ID do desenvolvedor destinatário.'
    );
  }

  if (
    typeof titulo !== 'string' ||
    !titulo.trim() ||
    typeof mensagem !== 'string' ||
    !mensagem.trim()
  ) {
    throw new Error(
      'Título e mensagem são obrigatórios.'
    );
  }

  // Busca exclusivamente os dispositivos do usuário destinatário.
  const { rows } = await pool.query(
    `SELECT id, token
       FROM notificacoes_tokens
      WHERE usuario_id = $1
        AND ativo = TRUE`,
    [usuarioId]
  );

  let enviados = 0;
  let falhas = 0;

  if (rows.length === 0) {
    return {
      enviados,
      falhas,
      mensagem:
        'Nenhum dispositivo ativo está registrado para este desenvolvedor.'
    };
  }

  const messaging = obterFirebaseMessaging();
  const linkFinal = obterLinkNotificacao(link);

  for (const dispositivo of rows) {
    try {
      const notificacao = {
        token: dispositivo.token,
        notification: {
          title: titulo.trim().slice(0, 100),
          body: mensagem.trim().slice(0, 300)
        }
      };

      // Link de abertura para notificações Web Push.
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

      console.error('[Orvix Push] Falha no envio:', {
        usuarioId,
        dispositivoId: dispositivo.id,
        code: erro.code || null,
        message: erro.message
      });

      // Desativa somente tokens reconhecidamente inválidos.
      if (tokenInvalido(erro)) {
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
          console.error(
            '[Orvix Push] Falha ao desativar token inválido:',
            {
              dispositivoId: dispositivo.id,
              code: erroBanco.code || null,
              message: erroBanco.message
            }
          );
        }
      }
    }
  }

  return {
    enviados,
    falhas
  };
}

// ============================================================
// EXPORTAÇÕES
// ============================================================

module.exports = {
  enviarParaDesenvolvedores
};