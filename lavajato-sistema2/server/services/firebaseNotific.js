'use strict';

const admin = require('firebase-admin');
const pool = require('../db');

// ============================================================
// INSTÂNCIA DO FIREBASE
// ============================================================

let firebaseApp = null;

// ============================================================
// ERROS COM DIAGNÓSTICO
// ============================================================

function criarErro(codigoDiagnostico, mensagem) {
  const erro = new Error(mensagem);
  erro.codigoDiagnostico = codigoDiagnostico;
  return erro;
}

// ============================================================
// INICIALIZAR FIREBASE ADMIN
// ============================================================

function obterFirebaseMessaging() {
  // Reutiliza a instância criada por este módulo.
  if (firebaseApp) {
    return admin.messaging(firebaseApp);
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (typeof json !== 'string' || !json.trim()) {
    throw criarErro(
      'FIREBASE_CREDENCIAL_AUSENTE',
      'FIREBASE_SERVICE_ACCOUNT_JSON não está configurada.'
    );
  }

  let credencial;

  try {
    credencial = JSON.parse(json);
  } catch {
    throw criarErro(
      'FIREBASE_JSON_INVALIDO',
      'A variável de credenciais não contém um JSON válido.'
    );
  }

  if (
    !credencial ||
    typeof credencial !== 'object' ||
    typeof credencial.project_id !== 'string' ||
    typeof credencial.client_email !== 'string' ||
    typeof credencial.private_key !== 'string' ||
    !credencial.project_id.trim() ||
    !credencial.client_email.trim() ||
    !credencial.private_key.trim()
  ) {
    throw criarErro(
      'FIREBASE_CREDENCIAL_INCOMPLETA',
      'A credencial precisa conter project_id, client_email e private_key.'
    );
  }

  // Corrige quebras de linha escapadas na variável de ambiente.
  credencial.private_key = credencial.private_key.replace(
    /\\n/g,
    '\n'
  );

  if (
    !credencial.private_key.includes(
      '-----BEGIN PRIVATE KEY-----'
    ) ||
    !credencial.private_key.includes(
      '-----END PRIVATE KEY-----'
    )
  ) {
    throw criarErro(
      'FIREBASE_CHAVE_FORMATO_INVALIDO',
      'A chave privada não está no formato esperado.'
    );
  }

  try {
    // Evita depender de admin.apps.find(), que falhou
    // na versão ou exportação utilizada pelo projeto.
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(credencial)
    });

    return admin.messaging(firebaseApp);
  } catch (erro) {
    console.error('[Orvix Push] Falha ao inicializar Firebase:', {
      code: erro?.code || null,
      name: erro?.name || null,
      message: erro?.message || null
    });

    throw criarErro(
      'FIREBASE_CREDENCIAL_REJEITADA',
      'O Firebase Admin não conseguiu inicializar com a credencial fornecida.'
    );
  }
}

// ============================================================
// VALIDAR LINK DA NOTIFICAÇÃO
// ============================================================

function obterLinkNotificacao(link = '/') {
  const appUrl = String(process.env.APP_URL || '').trim();

  // O link é opcional.
  if (!appUrl) {
    return undefined;
  }

  let urlBase;

  try {
    urlBase = new URL(appUrl);
  } catch {
    throw criarErro(
      'APP_URL_INVALIDA',
      'APP_URL não contém uma URL válida.'
    );
  }

  if (!['https:', 'http:'].includes(urlBase.protocol)) {
    throw criarErro(
      'APP_URL_PROTOCOLO_INVALIDO',
      'APP_URL deve utilizar HTTP ou HTTPS.'
    );
  }

  try {
    const url = new URL(link || '/', urlBase.origin + '/');

    // Aceita somente links do próprio sistema.
    if (
      url.origin !== urlBase.origin ||
      !['https:', 'http:'].includes(url.protocol)
    ) {
      return urlBase.origin + '/';
    }

    return url.toString();
  } catch {
    return urlBase.origin + '/';
  }
}

// ============================================================
// CONSULTAR DISPOSITIVOS ATIVOS
// ============================================================

async function obterDispositivos(usuarioId) {
  try {
    const resultado = await pool.query(
      `SELECT id, token
       FROM notificacoes_tokens
       WHERE usuario_id = $1
         AND ativo = TRUE`,
      [usuarioId]
    );

    return resultado.rows || [];
  } catch (erro) {
    console.error('[Orvix Push] Falha ao consultar dispositivos:', {
      code: erro?.code || null,
      message: erro?.message || null
    });

    throw criarErro(
      'FIREBASE_BANCO_CONSULTA_FALHOU',
      'Não foi possível consultar os dispositivos registrados.'
    );
  }
}

// ============================================================
// DESATIVAR TOKEN INVÁLIDO
// ============================================================

async function desativarToken(usuarioId, dispositivoId) {
  try {
    await pool.query(
      `UPDATE notificacoes_tokens
       SET ativo = FALSE,
           atualizado_em = NOW()
       WHERE id = $1
         AND usuario_id = $2`,
      [dispositivoId, usuarioId]
    );
  } catch (erro) {
    console.error('[Orvix Push] Falha ao desativar token:', {
      dispositivoId,
      code: erro?.code || null,
      message: erro?.message || null
    });
  }
}

// ============================================================
// ENVIAR NOTIFICAÇÃO AOS DISPOSITIVOS DO DESENVOLVEDOR
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
      'O ID do desenvolvedor destinatário é obrigatório.'
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
      'O título e a mensagem da notificação são obrigatórios.'
    );
  }

  const dispositivos = await obterDispositivos(usuarioId);

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
      if (
        typeof dispositivo.token !== 'string' ||
        !dispositivo.token.trim()
      ) {
        falhas++;
        await desativarToken(usuarioId, dispositivo.id);
        continue;
      }

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

      console.error('[Orvix Push] Falha ao enviar notificação:', {
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
        await desativarToken(usuarioId, dispositivo.id);
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
