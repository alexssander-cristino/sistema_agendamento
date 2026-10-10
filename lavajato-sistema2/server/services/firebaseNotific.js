'use strict';

const adminApp = require('firebase-admin/app');
const adminMessaging = require('firebase-admin/messaging');
const pool = require('../db');

let firebaseApp = null;

// ============================================================
// ERROS
// ============================================================

function criarErro(codigoDiagnostico, mensagem, causaOriginal = null) {
  const erro = new Error(
    String(mensagem || 'Erro desconhecido no Firebase Admin').slice(0, 300)
  );

  erro.codigoDiagnostico = codigoDiagnostico;

  if (causaOriginal) {
    erro.causaOriginal = causaOriginal;
  }

  return erro;
}

// ============================================================
// CREDENCIAIS
// ============================================================

function obterCredencialFirebase() {
  const valor = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!valor || !valor.trim()) {
    throw criarErro(
      'FIREBASE_CREDENCIAL_AUSENTE',
      'A variável FIREBASE_SERVICE_ACCOUNT_JSON não está configurada.'
    );
  }

  let credencial;

  try {
    credencial = JSON.parse(valor);
  } catch (erro) {
    throw criarErro(
      'FIREBASE_JSON_INVALIDO',
      'FIREBASE_SERVICE_ACCOUNT_JSON não contém um JSON válido.',
      erro
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
      'FIREBASE_CREDENCIAL_INVALIDA',
      'A credencial Firebase é inválida.'
    );
  }

  credencial.private_key = credencial.private_key
    .replace(/\\n/g, '\n')
    .trim();

  if (
    !credencial.private_key.includes('-----BEGIN PRIVATE KEY-----') ||
    !credencial.private_key.includes('-----END PRIVATE KEY-----')
  ) {
    throw criarErro(
      'FIREBASE_CHAVE_PRIVADA_INVALIDA',
      'A chave privada Firebase não possui o formato esperado.'
    );
  }

  return credencial;
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

function obterFirebaseMessaging() {
  try {
    const aplicativos = adminApp.getApps();

    if (firebaseApp) {
      return adminMessaging.getMessaging(firebaseApp);
    }

    if (aplicativos.length > 0) {
      firebaseApp =
        aplicativos.find((app) => app.name === '[DEFAULT]') ||
        aplicativos[0];

      return adminMessaging.getMessaging(firebaseApp);
    }

    const credencial = obterCredencialFirebase();

    firebaseApp = adminApp.initializeApp({
      credential: adminApp.cert(credencial),
      projectId: credencial.project_id
    });

    return adminMessaging.getMessaging(firebaseApp);
  } catch (erro) {
    console.error('[ORVIX FIREBASE] Falha na inicialização:', {
      codigo: erro?.codigoDiagnostico || erro?.code || null,
      mensagem: String(
        erro?.message || 'Falha na inicialização'
      ).slice(0, 200)
    });

    if (erro?.codigoDiagnostico) {
      throw erro;
    }

    throw criarErro(
      'FIREBASE_INICIALIZACAO_FALHOU',
      String(erro?.message || 'Não foi possível inicializar o Firebase.').slice(0, 300),
      erro
    );
  }
}

// ============================================================
// DESATIVAR TOKEN INVÁLIDO
// ============================================================

async function desativarToken(token) {
  if (!token) return;

  try {
    await pool.query(
      `UPDATE public.notificacoes_tokens
       SET ativo = FALSE
       WHERE token = $1`,
      [token]
    );
  } catch (erro) {
    console.error(
      '[ORVIX FIREBASE] Falha ao desativar token:',
      erro.message
    );
  }
}

// ============================================================
// OBTER TOKENS DOS DESENVOLVEDORES
// ============================================================

async function obterTokensDesenvolvedores() {
  const resultado = await pool.query(
    `SELECT DISTINCT nt.token
     FROM public.notificacoes_tokens nt
     INNER JOIN public.usuarios u
       ON u.id = nt.usuario_id
     WHERE nt.ativo = TRUE
       AND u.perfil = 'dev'
       AND u.ativo = TRUE
       AND nt.token IS NOT NULL
       AND BTRIM(nt.token) <> ''`
  );

  return [
    ...new Set(
      resultado.rows
        .map((registro) => registro.token)
        .filter(Boolean)
    )
  ];
}

// ============================================================
// ENVIAR PARA UMA LISTA ESPECÍFICA DE TOKENS
// ============================================================

async function enviarParaListaDeTokens(tokens, {
  titulo,
  corpo,
  link = '/'
} = {}) {
  if (
    typeof titulo !== 'string' ||
    !titulo.trim() ||
    typeof corpo !== 'string' ||
    !corpo.trim()
  ) {
    throw criarErro(
      'NOTIFICACAO_INVALIDA',
      'O título e o conteúdo da notificação são obrigatórios.'
    );
  }

  const lista = [...new Set(tokens.filter(Boolean))];

  if (lista.length === 0) {
    return {
      sucesso: true,
      mensagem: 'Nenhum dispositivo autorizado possui token ativo.',
      total: 0,
      enviados: 0,
      falhas: 0
    };
  }

  const messaging = obterFirebaseMessaging();

  let enviados = 0;
  let falhas = 0;

  for (let inicio = 0; inicio < lista.length; inicio += 500) {
    const lote = lista.slice(inicio, inicio + 500);

    const mensagem = {
      tokens: lote,

      notification: {
        title: titulo.trim().slice(0, 200),
        body: corpo.trim().slice(0, 1000)
      },

      data: {
        link: String(link || '/').slice(0, 500)
      },

      webpush: {
        fcmOptions: {
          link: String(link || '/').slice(0, 500)
        }
      }
    };

    let resposta;

    try {
      resposta = await messaging.sendEachForMulticast(mensagem);
    } catch (erro) {
      console.error('[ORVIX FIREBASE] Erro no envio:', {
        codigo: erro?.code || null,
        mensagem: String(
          erro?.message || 'Falha no envio'
        ).slice(0, 200)
      });

      throw criarErro(
        'FIREBASE_ENVIO_FALHOU',
        'Não foi possível enviar as notificações Firebase.',
        erro
      );
    }

    enviados += resposta.successCount;
    falhas += resposta.failureCount;

    for (let i = 0; i < resposta.responses.length; i++) {
      const item = resposta.responses[i];

      if (!item.success) {
        const codigo = item.error?.code || '';

        if (
          codigo.includes('registration-token-not-registered') ||
          codigo.includes('invalid-registration-token') ||
          codigo === 'messaging/invalid-argument'
        ) {
          await desativarToken(lote[i]);
        }

        console.error('[ORVIX FIREBASE] Falha em dispositivo:', {
          codigo: codigo || 'ERRO_DESCONHECIDO'
        });
      }
    }
  }

  return {
    sucesso: falhas === 0,
    total: lista.length,
    enviados,
    falhas
  };
}

// ============================================================
// ENVIAR PARA TODOS OS DESENVOLVEDORES ATIVOS
// ============================================================

async function enviarParaDesenvolvedores({
  titulo = 'Orvix — Notificação de teste',
  corpo = 'O serviço de notificações do Orvix está funcionando.',
  link = '/'
} = {}) {
  const tokens = await obterTokensDesenvolvedores();

  return enviarParaListaDeTokens(tokens, {
    titulo,
    corpo,
    link
  });
}

// ============================================================
// ALERTA DE SEGURANÇA PARA DESENVOLVEDORES
// ============================================================

async function enviarAlertaSeguranca({
  titulo,
  corpo,
  link = '/admin/logs'
} = {}) {
  return enviarParaDesenvolvedores({
    titulo: titulo || 'Orvix — Alerta de segurança',
    corpo: corpo || 'Foi detectado um evento que requer verificação.',
    link
  });
}

// ============================================================
// ENVIO GENÉRICO PARA TOKENS ATIVOS
// ============================================================
//
// Mantido para compatibilidade com funcionalidades existentes.
// ATENÇÃO: esta função envia para todos os tokens ativos.
// Não a utilize para alertas exclusivos de segurança.
// ============================================================

async function enviarParaTokensAtivos({
  titulo,
  corpo,
  link = '/'
} = {}) {
  const resultado = await pool.query(
    `SELECT token
     FROM public.notificacoes_tokens
     WHERE ativo = TRUE
       AND token IS NOT NULL
       AND BTRIM(token) <> ''`
  );

  const tokens = resultado.rows
    .map((registro) => registro.token)
    .filter(Boolean);

  return enviarParaListaDeTokens(tokens, {
    titulo,
    corpo,
    link
  });
}

module.exports = {
  obterFirebaseMessaging,
  enviarParaTokensAtivos,
  enviarParaDesenvolvedores,
  enviarAlertaSeguranca,
  desativarToken
};
