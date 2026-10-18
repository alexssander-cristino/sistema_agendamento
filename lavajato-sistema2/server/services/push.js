// Salve como: server/services/push.js  (CommonJS)
//
// Pré-requisitos:
//   npm install firebase-admin
//   FIREBASE_SERVICE_ACCOUNT no .env e na Vercel = JSON da conta de serviço em UMA linha
//   (Firebase Console > Configurações do projeto > Contas de serviço > Gerar nova chave privada)
//
// Se a variável faltar ou o pacote não estiver instalado, o push fica desativado
// e o servidor continua funcionando normalmente (só registra um aviso no log).

const pool = require('../db');

const TOKENS_INVALIDOS = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
];

let firebaseAdmin = null;
let tentouIniciar = false;

function obterFirebase() {
  if (tentouIniciar) return firebaseAdmin;
  tentouIniciar = true;

  try {
    const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!bruto) {
      console.warn('Push desativado: FIREBASE_SERVICE_ACCOUNT não definida.');
      return null;
    }

    const admin = require('firebase-admin');

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(bruto)),
      });
    }

    firebaseAdmin = admin;
  } catch (erro) {
    console.error('Push desativado: falha ao iniciar o firebase-admin:', erro.message);
    firebaseAdmin = null;
  }

  return firebaseAdmin;
}

/**
 * Envia um push para uma lista de tokens.
 * Retorna { invalidos } com os tokens que o FCM recusou.
 */
async function enviarParaTokens(tokens, { title, body, route }) {
  const admin = obterFirebase();
  const lista = [...new Set((tokens || []).filter(Boolean))];

  if (!admin || lista.length === 0) {
    return { invalidos: [] };
  }

  const resposta = await admin.messaging().sendEachForMulticast({
    tokens: lista,
    notification: { title, body },
    data: { route: route || '' },
    android: {
      priority: 'high',
      notification: { channelId: 'orvix_default' },
    },
  });

  const invalidos = [];

  resposta.responses.forEach((r, i) => {
    if (!r.success && TOKENS_INVALIDOS.includes(r.error && r.error.code)) {
      invalidos.push(lista[i]);
    }
  });

  return { invalidos };
}

/**
 * Envia um push para todos os aparelhos registrados de uma empresa
 * e apaga do banco os tokens que o FCM disser que não existem mais.
 *
 * Use excluirUsuarioId para não avisar quem fez a ação.
 */
async function enviarPushParaEmpresa({
  empresaId,
  title,
  body,
  route,
  excluirUsuarioId = null,
}) {
  if (!empresaId) return;

  const resultado = await pool.query(
    `SELECT token
       FROM dispositivos
      WHERE empresa_id = $1
        AND ($2::bigint IS NULL OR usuario_id <> $2)`,
    [empresaId, excluirUsuarioId]
  );

  const tokens = resultado.rows.map((linha) => linha.token);
  if (tokens.length === 0) return;

  const { invalidos } = await enviarParaTokens(tokens, { title, body, route });

  if (invalidos.length > 0) {
    await pool.query(
      'DELETE FROM dispositivos WHERE token = ANY($1::text[])',
      [invalidos]
    );
  }
}

module.exports = { enviarParaTokens, enviarPushParaEmpresa };