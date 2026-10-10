
'use strict';

const adminApp = require('firebase-admin/app');
const adminMessaging = require('firebase-admin/messaging');
const pool = require('../db');

let firebaseApp = null;

// ============================================================
// ERROS DO FIREBASE
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
      'A credencial precisa conter type, project_id, client_email e private_key válidos.'
    );
  }

  // Converte os caracteres literais \n em quebras de linha.
  credencial.private_key = credencial.private_key
    .replace(/\\n/g, '\n')
    .trim();

  if (
    !credencial.private_key.includes('-----BEGIN PRIVATE KEY-----') ||
    !credencial.private_key.includes('-----END PRIVATE KEY-----')
  ) {
    throw criarErro(
      'FIREBASE_CHAVE_PRIVADA_INVALIDA',
      'A private_key não possui o formato PEM esperado.'
    );
  }

  return credencial;
}

// ============================================================
// INICIALIZAÇÃO DO FIREBASE ADMIN
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
      nome: erro?.name || 'Error',
      codigo: erro?.code || null,
      mensagem: String(
        erro?.message || 'Erro desconhecido na inicialização'
      ).slice(0, 300)
    });

    if (erro?.codigoDiagnostico) {
      throw erro;
    }

    throw criarErro(
      'FIREBASE_INICIALIZACAO_FALHOU',
      String(
        erro?.message || 'Não foi possível inicializar o Firebase Admin.'
      ).slice(0, 300),
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
      `UPDATE notificacoes_tokens
       SET ativo = FALSE
       WHERE token = $1`,
      [token]
    );
  } catch (erro) {
    console.error(
      '[ORVIX FIREBASE] Não foi possível desativar token:',
      erro.message
    );
  }
}

// ============================================================
// ENVIAR NOTIFICAÇÃO PARA TOKENS ATIVOS
// ============================================================

async function enviarParaTokensAtivos({
  titulo,
  corpo,
  link = '/'
} = {}) {
  if (!titulo || !corpo) {
    throw criarErro(
      'NOTIFICACAO_INVALIDA',
      'O título e o conteúdo da notificação são obrigatórios.'
    );
  }

  const resultadoTokens = await pool.query(
    `SELECT token
     FROM notificacoes_tokens
     WHERE ativo = TRUE
       AND token IS NOT NULL
       AND BTRIM(token) <> ''`
  );

  const tokens = [
    ...new Set(
      resultadoTokens.rows
        .map((registro) => registro.token)
        .filter(Boolean)
    )
  ];

  if (tokens.length === 0) {
    return {
      sucesso: true,
      mensagem: 'Nenhum dispositivo possui token ativo.',
      total: 0,
      enviados: 0,
      falhas: 0
    };
  }

  const messaging = obterFirebaseMessaging();

  let enviados = 0;
  let falhas = 0;

  // O Firebase aceita no máximo 500 tokens por lote.
  for (let inicio = 0; inicio < tokens.length; inicio += 500) {
    const lote = tokens.slice(inicio, inicio + 500);

    const mensagem = {
      tokens: lote,
      notification: {
        title: String(titulo).slice(0, 200),
        body: String(corpo).slice(0, 1000)
      },
      data: {
        link: String(link || '/')
      },
      webpush: {
        fcmOptions: {
          link: String(link || '/')
        }
      }
    };

    let resposta;

    try {
      resposta = await messaging.sendEachForMulticast(mensagem);
    } catch (erro) {
      console.error('[ORVIX FIREBASE] Erro no envio:', {
        codigo: erro?.code || null,
        mensagem: String(erro?.message || 'Falha no envio').slice(0, 300)
      });

      throw criarErro(
        'FIREBASE_ENVIO_FALHOU',
        String(erro?.message || 'Falha ao enviar notificações.').slice(0, 300),
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
          codigo.includes('invalid-argument')
        ) {
          await desativarToken(lote[i]);
        }

        console.error('[ORVIX FIREBASE] Falha em um dispositivo:', {
          codigo: codigo || 'ERRO_DESCONHECIDO',
          mensagem: String(
            item.error?.message || 'Falha no envio'
          ).slice(0, 200)
        });
      }
    }
  }

  return {
    sucesso: falhas === 0,
    total: tokens.length,
    enviados,
    falhas
  };
}

// ============================================================
// NOTIFICAÇÃO DE TESTE PARA DESENVOLVEDORES
// ============================================================

async function enviarParaDesenvolvedores() {
  return enviarParaTokensAtivos({
    titulo: 'Orvix — Notificação de teste',
    corpo: 'O serviço de notificações do Orvix está funcionando.',
    link: '/'
  });
}

module.exports = {
  obterFirebaseMessaging,
  enviarParaTokensAtivos,
  enviarParaDesenvolvedores,
  desativarToken
};