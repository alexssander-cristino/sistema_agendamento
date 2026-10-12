'use strict';

const pool = require('../db');

// Deve ser igual ao tempo de validade do JWT (TEMPO_JWT_DIAS em routes/auth.js).
const TEMPO_SESSAO_DIAS = 7;

const REGEX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidValido(valor) {
  return typeof valor === 'string' && REGEX_UUID.test(valor);
}

// ============================================================
// NAVEGADOR / SISTEMA (sem dependências externas)
// ============================================================

function interpretarUserAgent(userAgent) {
  const texto = String(userAgent || '').slice(0, 400);

  const pegar = regex => {
    const r = texto.match(regex);
    return r ? r[1] : null;
  };

  let navegador = 'Navegador desconhecido';
  let v;

  if ((v = pegar(/EdgA?\/(\d+)/))) navegador = `Edge ${v}`;
  else if ((v = pegar(/OPR\/(\d+)/))) navegador = `Opera ${v}`;
  else if ((v = pegar(/SamsungBrowser\/(\d+)/))) navegador = `Samsung Internet ${v}`;
  else if ((v = pegar(/(?:Firefox|FxiOS)\/(\d+)/))) navegador = `Firefox ${v}`;
  else if ((v = pegar(/(?:Chrome|CriOS)\/(\d+)/))) navegador = `Chrome ${v}`;
  else if ((v = pegar(/Version\/(\d+).*Safari/))) navegador = `Safari ${v}`;
  else if (/Safari/.test(texto)) navegador = 'Safari';

  let sistema = 'Sistema desconhecido';

  if (/Windows NT/.test(texto)) sistema = 'Windows';
  else if (/Android/.test(texto)) sistema = 'Android';
  else if (/iPhone|iPad|iPod/.test(texto)) sistema = 'iOS';
  else if (/CrOS/.test(texto)) sistema = 'ChromeOS';
  else if (/Mac OS X|Macintosh/.test(texto)) sistema = 'macOS';
  else if (/Linux/.test(texto)) sistema = 'Linux';

  let tipo = 'computador';

  if (/iPad|Tablet/.test(texto) || (/Android/.test(texto) && !/Mobi/.test(texto))) {
    tipo = 'tablet';
  } else if (/Mobi|iPhone/.test(texto)) {
    tipo = 'celular';
  }

  return {
    navegador,
    sistema,
    tipo_dispositivo: tipo,
    user_agent: texto || null
  };
}

function obterIp(req) {
  // Atrás de proxy (Vercel) é preciso app.set('trust proxy', 1) no servidor
  // para que req.ip reflita o IP real do visitante.
  const ip = String(req.ip || req.socket?.remoteAddress || '')
    .replace(/^::ffff:/, '')
    .slice(0, 64);

  return ip || null;
}

// ============================================================
// CRIAR SESSÃO (chamar no login e no cadastro)
// ============================================================

async function criarSessao(req, usuario, executor = pool) {
  const info = interpretarUserAgent(req.headers['user-agent']);

  // Limpeza oportunista de sessões antigas deste usuário.
  try {
    await executor.query(
      `
      DELETE FROM sessoes
      WHERE usuario_id = $1
        AND (
          expira_em < NOW() - INTERVAL '30 days'
          OR revogada_em < NOW() - INTERVAL '30 days'
        )
      `,
      [usuario.id]
    );
  } catch (_) {
    // A limpeza nunca deve impedir o login.
  }

  const expiraEm = new Date(
    Date.now() + TEMPO_SESSAO_DIAS * 24 * 60 * 60 * 1000
  );

  const { rows } = await executor.query(
    `
    INSERT INTO sessoes (
      usuario_id, empresa_id,
      navegador, sistema, tipo_dispositivo, user_agent, ip,
      expira_em
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, expira_em
    `,
    [
      usuario.id,
      usuario.empresa_id ?? null,
      info.navegador,
      info.sistema,
      info.tipo_dispositivo,
      info.user_agent,
      obterIp(req),
      expiraEm
    ]
  );

  return rows[0];
}

// ============================================================
// REVOGAR (o executor pode ser o pool ou um client de transação)
// ============================================================

async function revogarSessao(executor, usuarioId, sessaoId, motivo = 'encerrada_pelo_usuario') {
  if (!uuidValido(sessaoId)) return false;

  const resultado = await executor.query(
    `
    UPDATE sessoes
    SET revogada_em = NOW(), motivo_revogacao = $3
    WHERE id = $1
      AND usuario_id = $2
      AND revogada_em IS NULL
    `,
    [sessaoId, usuarioId, motivo]
  );

  return resultado.rowCount > 0;
}

async function revogarTodasSessoes(executor, usuarioId, { exceto = null, motivo = 'encerradas_em_massa' } = {}) {
  const resultado = await executor.query(
    `
    UPDATE sessoes
    SET revogada_em = NOW(), motivo_revogacao = $3
    WHERE usuario_id = $1
      AND revogada_em IS NULL
      AND ($2::uuid IS NULL OR id <> $2::uuid)
    `,
    [usuarioId, uuidValido(exceto) ? exceto : null, motivo]
  );

  return resultado.rowCount;
}

async function listarSessoesAtivas(usuarioId) {
  const { rows } = await pool.query(
    `
    SELECT
      id, navegador, sistema, tipo_dispositivo, ip,
      criada_em, ultimo_acesso, expira_em
    FROM sessoes
    WHERE usuario_id = $1
      AND revogada_em IS NULL
      AND expira_em > NOW()
    ORDER BY ultimo_acesso DESC
    `,
    [usuarioId]
  );

  return rows;
}

module.exports = {
  TEMPO_SESSAO_DIAS,
  uuidValido,
  interpretarUserAgent,
  criarSessao,
  revogarSessao,
  revogarTodasSessoes,
  listarSessoesAtivas
};