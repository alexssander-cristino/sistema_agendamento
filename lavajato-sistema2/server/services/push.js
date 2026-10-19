
'use strict';

const pool = require('../db');

const {
  getApps,
  initializeApp,
  cert
} = require('firebase-admin/app');

const {
  getMessaging
} = require('firebase-admin/messaging');

const TOKENS_INVALIDOS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument'
]);

let firebaseApp = null;
let firebaseTentado = false;

function obterFirebase() {
  if (firebaseTentado) return firebaseApp;

  firebaseTentado = true;

  try {
    const bruto =
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!bruto || !bruto.trim()) {
      console.error(
        '[ORVIX PUSH] Credencial Firebase ausente ou vazia.'
      );
      return null;
    }

    let credencial;

    try {
      credencial = JSON.parse(bruto);
    } catch {
      throw new Error(
        'A variável Firebase não contém JSON válido.'
      );
    }

    if (
      !credencial ||
      credencial.type !== 'service_account' ||
      !credencial.project_id ||
      !credencial.client_email ||
      !credencial.private_key
    ) {
      throw new Error(
        'A credencial não contém os campos obrigatórios de uma conta de serviço.'
      );
    }

    credencial.private_key = credencial.private_key
      .replace(/\\n/g, '\n');

    const apps = getApps();

    firebaseApp =
      apps.find((app) => app.name === '[DEFAULT]') ||
      initializeApp({
        credential: cert(credencial),
        projectId: credencial.project_id
      });

    console.info(
      '[ORVIX PUSH] Firebase Admin inicializado.',
      `Projeto: ${credencial.project_id}`
    );

    return firebaseApp;
  } catch (erro) {
    firebaseApp = null;

    console.error(
      '[ORVIX PUSH] Falha ao iniciar Firebase Admin:',
      erro.message
    );

    return null;
  }
}

async function removerTokensInvalidos(tokens) {
  if (!tokens.length) return;

  try {
    await pool.query(
      `DELETE FROM public.dispositivos
       WHERE token = ANY($1::text[])`,
      [tokens]
    );
  } catch (erro) {
    console.warn(
      '[ORVIX PUSH] Falha ao limpar tokens móveis inválidos:',
      erro.message
    );
  }

  try {
    await pool.query(
      `UPDATE public.notificacoes_tokens
       SET ativo = FALSE
       WHERE token = ANY($1::text[])`,
      [tokens]
    );
  } catch (erro) {
    console.warn(
      '[ORVIX PUSH] Falha ao desativar tokens web inválidos:',
      erro.message
    );
  }
}

async function enviarParaTokens(
  tokens,
  { title, body, route = '/' } = {}
) {
  const app = obterFirebase();

  const lista = [
    ...new Set(
      (tokens || [])
        .filter((token) =>
          typeof token === 'string' && token.trim()
        )
        .map((token) => token.trim())
    )
  ];

  if (!app) {
    return {
      sucesso: false,
      total: lista.length,
      enviados: 0,
      falhas: lista.length,
      motivo: 'FIREBASE_NAO_CONFIGURADO'
    };
  }

  if (!lista.length) {
    return {
      sucesso: true,
      total: 0,
      enviados: 0,
      falhas: 0,
      motivo: 'NENHUM_TOKEN'
    };
  }

  const titulo =
    String(title || 'Orvix').trim().slice(0, 200) || 'Orvix';

  const mensagem =
    String(body || 'Você tem uma nova notificação.')
      .trim()
      .slice(0, 1000);

  const destino = String(route || '/').slice(0, 500);

  const baseUrl = (
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    'https://sistemaagendamento-lavajato-sistema.vercel.app'
  ).replace(/\/$/, '');

  const linkWeb = destino.startsWith('http')
    ? destino
    : `${baseUrl}${destino.startsWith('/') ? destino : `/${destino}`}`;

  let enviados = 0;
  let falhas = 0;
  const invalidos = [];

  try {
    const messaging = getMessaging(app);

    for (let i = 0; i < lista.length; i += 500) {
      const lote = lista.slice(i, i + 500);

      const resposta =
        await messaging.sendEachForMulticast({
          tokens: lote,

          notification: {
            title: titulo,
            body: mensagem
          },

          data: {
            route: destino,
            link: destino,
            title: titulo,
            body: mensagem
          },

          android: {
            priority: 'high',
            notification: {
              channelId: 'orvix_default',
              sound: 'default'
            }
          },

          webpush: {
            headers: {
              Urgency: 'high'
            },

            notification: {
              title: titulo,
              body: mensagem,
              icon: '/favicon.ico',
              data: {
                link: destino
              }
            },

            fcmOptions: {
              link: linkWeb
            }
          }
        });

      enviados += resposta.successCount;
      falhas += resposta.failureCount;

      resposta.responses.forEach((item, index) => {
        if (item.success) return;

        const codigo = item.error?.code || 'erro desconhecido';

        console.warn(
          '[ORVIX PUSH] Envio falhou:',
          codigo
        );

        if (TOKENS_INVALIDOS.has(codigo)) {
          invalidos.push(lote[index]);
        }
      });
    }

    await removerTokensInvalidos(invalidos);

    console.info(
      '[ORVIX PUSH] Resultado do envio:',
      JSON.stringify({
        total: lista.length,
        enviados,
        falhas
      })
    );

    return {
      sucesso: falhas === 0,
      total: lista.length,
      enviados,
      falhas
    };
  } catch (erro) {
    console.error(
      '[ORVIX PUSH] Erro ao enviar notificações:',
      erro.code || erro.message
    );

    return {
      sucesso: false,
      total: lista.length,
      enviados,
      falhas: lista.length - enviados,
      motivo: erro.code || 'ERRO_ENVIO'
    };
  }
}

async function obterTokensDaEmpresa(
  empresaId,
  excluirUsuarioId = null
) {
  const [movel, web] = await Promise.all([
    pool.query(
      `SELECT token
       FROM public.dispositivos
       WHERE empresa_id = $1
         AND ($2::bigint IS NULL OR usuario_id <> $2)
         AND token IS NOT NULL
         AND BTRIM(token) <> ''`,
      [empresaId, excluirUsuarioId]
    ),

    pool.query(
      `SELECT DISTINCT nt.token
       FROM public.notificacoes_tokens nt
       INNER JOIN public.usuarios u
         ON u.id = nt.usuario_id
       WHERE nt.ativo = TRUE
         AND u.ativo = TRUE
         AND u.empresa_id = $1
         AND ($2::bigint IS NULL OR u.id <> $2)
         AND nt.token IS NOT NULL
         AND BTRIM(nt.token) <> ''`,
      [empresaId, excluirUsuarioId]
    )
  ]);

  return [
    ...new Set(
      [...movel.rows, ...web.rows]
        .map((row) => row.token)
        .filter(Boolean)
    )
  ];
}

async function obterTokensDoUsuario(usuarioId) {
  const [movel, web] = await Promise.all([
    pool.query(
      `SELECT token
       FROM public.dispositivos
       WHERE usuario_id = $1
         AND token IS NOT NULL`,
      [usuarioId]
    ),

    pool.query(
      `SELECT token
       FROM public.notificacoes_tokens
       WHERE usuario_id = $1
         AND ativo = TRUE
         AND token IS NOT NULL`,
      [usuarioId]
    )
  ]);

  return [
    ...new Set(
      [...movel.rows, ...web.rows]
        .map((row) => row.token)
        .filter(Boolean)
    )
  ];
}

async function enviarPushParaEmpresa({
  empresaId,
  title,
  body,
  route = '/',
  excluirUsuarioId = null
} = {}) {
  if (!empresaId) {
    return {
      sucesso: false,
      total: 0,
      enviados: 0,
      falhas: 0,
      motivo: 'EMPRESA_AUSENTE'
    };
  }

  const tokens = await obterTokensDaEmpresa(
    empresaId,
    excluirUsuarioId
  );

  return enviarParaTokens(tokens, {
    title,
    body,
    route
  });
}

async function enviarPushParaUsuario({
  usuarioId,
  title,
  body,
  route = '/'
} = {}) {
  if (!usuarioId) {
    return {
      sucesso: false,
      total: 0,
      enviados: 0,
      falhas: 0,
      motivo: 'USUARIO_AUSENTE'
    };
  }

  const tokens = await obterTokensDoUsuario(usuarioId);

  return enviarParaTokens(tokens, {
    title,
    body,
    route
  });
}

async function enviarParaTokensAtivos({
  titulo,
  corpo,
  link = '/'
} = {}) {
  const [web, movel] = await Promise.all([
    pool.query(
      `SELECT token
       FROM public.notificacoes_tokens
       WHERE ativo = TRUE
         AND token IS NOT NULL
         AND BTRIM(token) <> ''`
    ),

    pool.query(
      `SELECT token
       FROM public.dispositivos
       WHERE token IS NOT NULL
         AND BTRIM(token) <> ''`
    )
  ]);

  return enviarParaTokens(
    [...web.rows, ...movel.rows].map((row) => row.token),
    {
      title: titulo,
      body: corpo,
      route: link
    }
  );
}

async function enviarParaDesenvolvedores({
  titulo = 'Orvix — Notificação de teste',
  corpo = 'O serviço de notificações está funcionando.',
  link = '/'
} = {}) {
  const [web, movel] = await Promise.all([
    pool.query(
      `SELECT nt.token
       FROM public.notificacoes_tokens nt
       INNER JOIN public.usuarios u
         ON u.id = nt.usuario_id
       WHERE nt.ativo = TRUE
         AND u.perfil = 'dev'
         AND u.ativo = TRUE`
    ),

    pool.query(
      `SELECT d.token
       FROM public.dispositivos d
       INNER JOIN public.usuarios u
         ON u.id = d.usuario_id
       WHERE u.perfil = 'dev'
         AND u.ativo = TRUE`
    )
  ]);

  return enviarParaTokens(
    [...web.rows, ...movel.rows].map((row) => row.token),
    {
      title: titulo,
      body: corpo,
      route: link
    }
  );
}

async function enviarAlertaSeguranca({
  titulo,
  corpo,
  link = '/admin/logs'
} = {}) {
  return enviarParaDesenvolvedores({
    titulo: titulo || 'Orvix — Alerta de segurança',
    corpo: corpo ||
      'Foi detectado um evento que requer verificação.',
    link
  });
}

module.exports = {
  obterFirebase,
  enviarParaTokens,
  enviarPushParaEmpresa,
  enviarPushParaUsuario,
  enviarParaTokensAtivos,
  enviarParaDesenvolvedores,
  enviarAlertaSeguranca
};
