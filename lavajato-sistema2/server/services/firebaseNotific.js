'use strict';

const admin = require('firebase-admin');
const pool = require('../db');

// ============================================================
// FIREBASE ADMIN
// ============================================================

let firebaseApp = null;

function criarErro(codigoDiagnostico, mensagem) {
  const erro = new Error(mensagem);
  erro.codigoDiagnostico = codigoDiagnostico;
  return erro;
}

function obterFirebaseMessaging() {
  if (firebaseApp) {
    return admin.messaging(firebaseApp);
  }

  // Reutiliza uma instância padrão caso já exista.
  const appExistente = admin.apps.find(
    (app) => app.name === '[DEFAULT]'
  );

  if (appExistente) {
    firebaseApp = appExistente;
    return admin.messaging(firebaseApp);
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!json || !json.trim()) {
    throw criarErro(
      'FIREBASE_CREDENCIAL_AUSENTE',
      'A variável FIREBASE_SERVICE_ACCOUNT_JSON não está configurada.'
    );
  }

  let credencial;

  try {
    credencial = JSON.parse(json);
  } catch {
    throw criarErro(
      'FIREBASE_JSON_INVALIDO',
      'A variável FIREBASE_SERVICE_ACCOUNT_JSON não contém JSON válido.'
    );
  }

  if (
    !credencial ||
    typeof credencial !== 'object' ||
    !credencial.project_id ||
    !credencial.client_email ||
    !credencial.private_key
  ) {
    throw criarErro(
      'FIREBASE_CREDENCIAL_INCOMPLETA',
      'A credencial precisa conter project_id, client_email e private_key.'
    );
  }

  // Converte os caracteres literais "\n" em quebras de linha.
  if (typeof credencial.private_key !== 'string') {
    throw criarErro(
      'FIREBASE_CHAVE_INVALIDA',
      'A chave privada precisa ser uma string.'
    );
  }

  credencial.private_key = credencial.private_key.replace(
    /\\n/g,
    '\n'
  );

  if (
    !credencial.private_key.includes('-----BEGIN PRIVATE KEY-----') ||
    !credencial.private_key.includes('-----END PRIVATE KEY-----')
  ) {
    throw criarErro(
      'FIREBASE_CHAVE_FORMATO_INVALIDO',
      'A chave privada não possui o formato PEM esperado.'
    );
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(credencial)
    });

    return admin.messaging(firebaseApp);
  } catch (erro) {
    // Não registra nem devolve a chave privada.
    console.error('[Orvix Push] Falha ao inicializar Firebase:', {
      code: erro?.code || null,
      name: erro?.name || null,
      message: erro?.message || null
    });

    throw criarErro(
      'FIREBASE_CREDENCIAL_REJEITADA',
      'O Firebase Admin rejeitou a credencial. Confira a chave e a conta de serviço.'
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
  } catch {
    throw criarErro(
      'APP_URL_INVALIDA',
      'A variável APP_URL não contém uma URL válida.'
    );
  }

  if (!['http:', 'https:'].includes(urlBase.protocol)) {
    throw criarErro(
      'APP_URL_PROTOCOLO_INVALIDO',
      'A variável APP_URL deve usar HTTP ou HTTPS.'
    );
  }

  try {
    const url = new URL(link || '/', urlBase.origin + '/');

    // Impede que a notificação redirecione para outro domínio.
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
// ENVIO DE NOTIFICAÇÕES
// ============================================================

async function enviarParaDesenvolvedores({
  usuarioId,
  titulo,
  mensagem,
  link = '/'
}) {
  if (!usuarioId) {
    throw criarErro(
      'USUARIO_DESTINATARIO_INVALIDO',
      'Informe o ID do desenvolvedor destinatário.'
    );
  }

  if (
    typeof titulo !== 'string' ||
    !titulo.trim() ||
    typeof mensagem !== 'string' ||
    !mensagem.trim()
  ) {
    throw criarErro(
      'NOTIFICACAO_INVALIDA',
      'O título e a mensagem são obrigatórios.'
    );
  }

  let resultadoBanco;

  try {
    resultadoBanco = await pool.query(
      `SELECT id, token
       FROM notificacoes_tokens
       WHERE usuario_id = $1
         AND ativo = TRUE`,
      [usuarioId]
    );
  } catch (erro) {
    console.error('[Orvix Push] Erro ao consultar dispositivos:', {
      code: erro?.code || null,
      message: erro?.message || null
    });

    throw criarErro(
      'FIREBASE_BANCO_CONSULTA_FALHOU',
      'Não foi possível consultar os dispositivos registrados.'
    );
  }

  const dispositivos = resultadoBanco.rows || [];

  if (dispositivos.length === 0) {
    return {
      enviados: 0,
      falhas: 0,
      mensagem: 'Nenhum dispositivo ativo está registrado.'
    };
  }

  // Inicializa o Firebase somente quando há dispositivos.
  const messaging = obterFirebaseMessaging();
  const linkFinal = obterLinkNotificacao(link);

  let enviados = 0;
  let falhas = 0;

  for (const dispositivo of dispositivos) {
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

      console.error('[Orvix Push] Falha no envio:', {
        usuarioId,
        dispositivoId: dispositivo.id,
        code: erro?.code || null,
        message: erro?.message || null
      });

      const tokenInvalido = [
        'messaging/registration-token-not-registered',
        'messaging/invalid-registration-token'
      ].includes(erro?.code);

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
          console.error(
            '[Orvix Push] Erro ao desativar token inválido:',
            {
              code: erroBanco?.code || null,
              message: erroBanco?.message || null
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
