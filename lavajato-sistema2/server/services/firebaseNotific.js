'use strict';

const admin = require('firebase-admin');
const pool = require('../db');

let firebaseApp = null;

function criarErro(codigoDiagnostico, mensagem) {
  const erro = new Error(mensagem);
  erro.codigoDiagnostico = codigoDiagnostico;
  return erro;
}

// ============================================================
// FIREBASE ADMIN
// ============================================================

function obterFirebaseMessaging() {
  try {
    // Reutiliza a instância já criada por este módulo.
    if (firebaseApp) {
      return admin.messaging(firebaseApp);
    }

    // Compatibilidade com versões do SDK que exportam admin.apps.
    if (Array.isArray(admin.apps)) {
      const existente = admin.apps.find(
        app => app && app.name === '[DEFAULT]'
      );

      if (existente) {
        firebaseApp = existente;
        return admin.messaging(firebaseApp);
      }
    }

    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!json || !json.trim()) {
      throw criarErro(
        'FIREBASE_CREDENCIAL_AUSENTE',
        'Configure FIREBASE_SERVICE_ACCOUNT_JSON na Vercel.'
      );
    }

    let credencial;

    try {
      credencial = JSON.parse(json);
    } catch {
      throw criarErro(
        'FIREBASE_JSON_INVALIDO',
        'O valor de FIREBASE_SERVICE_ACCOUNT_JSON não é um JSON válido.'
      );
    }

    if (
      !credencial ||
      credencial.type !== 'service_account' ||
      !credencial.project_id ||
      !credencial.client_email ||
      !credencial.private_key
    ) {
      throw criarErro(
        'FIREBASE_CREDENCIAL_INCOMPLETA',
        'O JSON não contém uma credencial de conta de serviço completa.'
      );
    }

    const privateKey = String(credencial.private_key)
      .replace(/\\n/g, '\n')
      .trim();

    if (
      !privateKey.includes('-----BEGIN PRIVATE KEY-----') ||
      !privateKey.includes('-----END PRIVATE KEY-----')
    ) {
      throw criarErro(
        'FIREBASE_CHAVE_PRIVADA_INVALIDA',
        'A chave privada não está no formato PEM esperado.'
      );
    }

    credencial.private_key = privateKey;

    try {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(credencial),
        projectId: credencial.project_id
      });

      return admin.messaging(firebaseApp);
    } catch (erro) {
      // Não registrar nem expor a chave privada.
      console.error('[Orvix Push] Erro original do Firebase:', {
        code: erro?.code || null,
        name: erro?.name || null,
        message: erro?.message || null
      });

      throw criarErro(
        'FIREBASE_INICIALIZACAO_FALHOU',
        String(erro?.message || 'Falha ao inicializar Firebase Admin')
          .slice(0, 250)
      );
    }
  } catch (erro) {
    // Preserva os diagnósticos já identificados.
    if (erro?.codigoDiagnostico) {
      throw erro;
    }

    console.error('[Orvix Push] Erro ao preparar Firebase:', {
      code: erro?.code || null,
      name: erro?.name || null,
      message: erro?.message || null
    });

    throw criarErro(
      'FIREBASE_CONFIGURACAO_FALHOU',
      String(erro?.message || 'Falha na configuração do Firebase')
        .slice(0, 250)
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

  let base;

  try {
    base = new URL(appUrl);
  } catch {
    throw criarErro(
      'APP_URL_INVALIDA',
      'APP_URL não contém uma URL válida.'
    );
  }

  if (!['https:', 'http:'].includes(base.protocol)) {
    throw criarErro(
      'APP_URL_INVALIDA',
      'APP_URL deve usar HTTP ou HTTPS.'
    );
  }

  try {
    const destino = new URL(link || '/', base.origin + '/');

    if (
      destino.origin !== base.origin ||
      !['https:', 'http:'].includes(destino.protocol)
    ) {
      return base.origin + '/';
    }

    return destino.toString();
  } catch {
    return base.origin + '/';
  }
}

// ============================================================
// CONSULTAR DISPOSITIVOS
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
    console.error('[Orvix Push] Erro ao consultar dispositivos:', {
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
    console.error('[Orvix Push] Erro ao desativar token:', {
      dispositivoId,
      code: erro?.code || null,
      message: erro?.message || null
    });
  }
}

// ============================================================
// ENVIAR NOTIFICAÇÕES
// ============================================================

async function enviarParaDesenvolvedores({
  usuarioId,
  titulo,
  mensagem,
  link = '/'
}) {
  if (!usuarioId) {
    throw criarErro(
      'USUARIO_INVALIDO',
      'O usuário destinatário é obrigatório.'
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
      'Título e mensagem são obrigatórios.'
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

  const messaging = obterFirebaseMessaging();
  const linkFinal = obterLinkNotificacao(link);

  let enviados = 0;
  let falhas = 0;

  for (const dispositivo of dispositivos) {
    try {
      const payload = {
        token: dispositivo.token,
        notification: {
          title: titulo.trim().slice(0, 100),
          body: mensagem.trim().slice(0, 300)
        }
      };

      if (linkFinal) {
        payload.webpush = {
          fcmOptions: {
            link: linkFinal
          }
        };
      }

      await messaging.send(payload);
      enviados++;
    } catch (erro) {
      falhas++;

      console.error('[Orvix Push] Falha no envio:', {
        dispositivoId: dispositivo.id,
        code: erro?.code || null,
        message: erro?.message || null
      });

      if (
        [
          'messaging/registration-token-not-registered',
          'messaging/invalid-registration-token'
        ].includes(erro?.code)
      ) {
        await desativarToken(usuarioId, dispositivo.id);
      }
    }
  }

  return { enviados, falhas };
}

module.exports = {
  enviarParaDesenvolvedores
};
