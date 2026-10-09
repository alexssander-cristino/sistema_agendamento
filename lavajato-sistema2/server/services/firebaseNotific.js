
const admin = require('firebase-admin');
const pool = require('../db');

let firebaseApp = null;

function obterFirebaseMessaging() {
  if (!firebaseApp) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!json) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON não configurado.'
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

    if (credencial.private_key) {
      credencial.private_key =
        credencial.private_key.replace(/\\n/g, '\n');
    }

    firebaseApp = admin.apps.length > 0
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(credencial)
        });
  }

  return admin.messaging(firebaseApp);
}

function obterLinkNotificacao(link) {
  const appUrl = String(process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');

  if (!appUrl) {
    return undefined;
  }

  try {
    const url = new URL(
      link || '/',
      `${appUrl}/`
    );

    const urlBase = new URL(appUrl);

    // Não permitir redirecionamento para outro domínio.
    if (url.origin !== urlBase.origin) {
      return appUrl;
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      return appUrl;
    }

    return url.toString();
  } catch {
    return appUrl;
  }
}

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

  if (!titulo || !mensagem) {
    throw new Error(
      'Título e mensagem são obrigatórios.'
    );
  }

  // Envia somente aos dispositivos do destinatário.
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
    return { enviados, falhas };
  }

  const messaging = obterFirebaseMessaging();
  const linkFinal = obterLinkNotificacao(link);

  for (const dispositivo of rows) {
    try {
      const notificacao = {
        token: dispositivo.token,

        notification: {
          title: String(titulo).slice(0, 100),
          body: String(mensagem).slice(0, 300)
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

      console.error(
        '[Orvix Push] Falha no envio:',
        erro.code || 'erro desconhecido'
      );

      const tokenInvalido = [
        'messaging/registration-token-not-registered',
        'messaging/invalid-registration-token'
      ].includes(erro.code);

      if (tokenInvalido) {
        await pool.query(
          `UPDATE notificacoes_tokens
           SET ativo = FALSE,
               atualizado_em = NOW()
           WHERE id = $1
             AND usuario_id = $2`,
          [dispositivo.id, usuarioId]
        );
      }
    }
  }

  return { enviados, falhas };
}

module.exports = {
  enviarParaDesenvolvedores
};