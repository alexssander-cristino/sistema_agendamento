const jwt = require('jsonwebtoken');

const pool = require('../db');
const { uuidValido } = require('../services/sessoes');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('AVISO: JWT_SECRET não configurado no ambiente.');
}

// Transição: aceita tokens emitidos ANTES das sessões (sem "sid").
// Esses tokens não podem ser listados nem revogados. Deixe desligado
// (padrão) para exigir novo login de todos após a implantação.
const ACEITAR_TOKEN_ANTIGO =
  process.env.SESSOES_ACEITAR_TOKEN_ANTIGO === 'true';

const PERFIS_PERMITIDOS = ['administrador', 'funcionario', 'dev'];

// Mesmo formato usado ao definir o cookie em routes/auth.js
function limparCookieInvalido(res) {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });
  } catch (_) {}
}

/**
 * ============================================================
 * AUTENTICAÇÃO + VALIDAÇÃO DA SESSÃO NO BANCO
 * ============================================================
 *
 * 1. Cookie HttpOnly "token" (principal)
 * 2. Authorization: Bearer <token> (compatibilidade)
 *
 * Além da assinatura do JWT, a sessão (sid) é consultada em
 * toda requisição. Sessão revogada, expirada, usuário inativo
 * ou excluído => 401. É isso que torna a revogação real.
 * ============================================================
 */

async function autenticar(req, res, next) {
  let token = null;

  if (
    req.cookies &&
    typeof req.cookies.token === 'string' &&
    req.cookies.token.trim()
  ) {
    token = req.cookies.token.trim();
  }

  if (!token) {
    const authorization = req.headers.authorization;

    if (authorization) {
      const partes = authorization.trim().split(/\s+/);

      if (partes.length === 2 && partes[0] === 'Bearer' && partes[1]) {
        token = partes[1].trim();
      }
    }
  }

  if (!token) {
    return res.status(401).json({ erro: 'Não autenticado.' });
  }

  // ----------------------------------------------------------
  // 1) ASSINATURA E CAMPOS DO JWT
  // ----------------------------------------------------------

  let payload;

  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.error('Erro ao validar token:', err.message);

    return res.status(401).json({
      erro: 'Sessão expirada ou token inválido.'
    });
  }

  if (
    !payload ||
    !payload.id ||
    !payload.perfil ||
    !PERFIS_PERMITIDOS.includes(payload.perfil) ||
    (payload.perfil !== 'dev' && !payload.empresa_id)
  ) {
    return res.status(401).json({
      erro: 'Token de autenticação inválido.'
    });
  }

  // ----------------------------------------------------------
  // 2) TOKEN ANTIGO (SEM SESSÃO)
  // ----------------------------------------------------------

  if (!payload.sid) {
    if (!ACEITAR_TOKEN_ANTIGO) {
      limparCookieInvalido(res);

      return res.status(401).json({
        erro: 'Sua sessão precisa ser renovada. Entre novamente.',
        codigo: 'SESSAO_DESATUALIZADA'
      });
    }

    req.sessaoId = null;

    req.usuario = {
      id: payload.id,
      empresa_id: payload.empresa_id ?? null,
      nome: payload.nome || null,
      email: payload.email || null,
      perfil: payload.perfil
    };

    return next();
  }

  if (!uuidValido(payload.sid)) {
    return res.status(401).json({
      erro: 'Token de autenticação inválido.'
    });
  }

  // ----------------------------------------------------------
  // 3) SESSÃO NO BANCO
  // ----------------------------------------------------------

  try {
    const { rows } = await pool.query(
      `
      SELECT
        s.id,
        s.ultimo_acesso,
        u.ativo,
        u.perfil,
        u.empresa_id
      FROM sessoes s
      INNER JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.id = $1
        AND s.usuario_id = $2
        AND s.revogada_em IS NULL
        AND s.expira_em > NOW()
      LIMIT 1
      `,
      [payload.sid, payload.id]
    );

    if (rows.length === 0 || !rows[0].ativo) {
      limparCookieInvalido(res);

      return res.status(401).json({
        erro: 'Sua sessão foi encerrada. Entre novamente.',
        codigo: 'SESSAO_REVOGADA'
      });
    }

    const sessao = rows[0];

    // Perfil e empresa vêm do banco: mudanças valem imediatamente.
    if (
      !PERFIS_PERMITIDOS.includes(sessao.perfil) ||
      (sessao.perfil !== 'dev' && !sessao.empresa_id)
    ) {
      return res.status(401).json({
        erro: 'Token de autenticação inválido.'
      });
    }

    // Atualiza o último acesso no máximo uma vez por minuto.
    const parado = Date.now() - new Date(sessao.ultimo_acesso).getTime();

    if (parado > 60 * 1000) {
      try {
        await pool.query(
          'UPDATE sessoes SET ultimo_acesso = NOW() WHERE id = $1',
          [sessao.id]
        );
      } catch (_) {
        // Falha ao registrar o acesso não deve derrubar a requisição.
      }
    }

    req.sessaoId = sessao.id;

    req.usuario = {
      id: payload.id,
      empresa_id: sessao.empresa_id ?? null,
      nome: payload.nome || null,
      email: payload.email || null,
      perfil: sessao.perfil
    };

    return next();
  } catch (err) {
    // Erro de banco NÃO é 401: o front desloga o usuário em 401.
    console.error('Erro ao validar sessão:', err?.message || err);

    return res.status(503).json({
      erro: 'Não foi possível validar sua sessão agora. Tente novamente.'
    });
  }
}

module.exports = autenticar;