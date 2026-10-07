const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn(
    'AVISO: JWT_SECRET não configurado no ambiente.'
  );
}

/**
 * ============================================================
 * AUTENTICAÇÃO
 * ============================================================
 *
 * Prioridade:
 *
 * 1. Cookie HttpOnly "token"
 * 2. Authorization: Bearer <token>
 *
 * O cookie é o método principal.
 *
 * O Authorization continua sendo aceito para manter
 * compatibilidade com eventuais clientes/API existentes.
 *
 * ============================================================
 */

function autenticar(req, res, next) {
  let token = null;

  // ==========================================================
  // 1. TENTAR COOKIE HTTPONLY
  // ==========================================================

  if (
    req.cookies &&
    typeof req.cookies.token === 'string' &&
    req.cookies.token.trim()
  ) {
    token = req.cookies.token.trim();
  }

  // ==========================================================
  // 2. FALLBACK PARA AUTHORIZATION
  // ==========================================================

  if (!token) {
    const authorization =
      req.headers.authorization;

    if (authorization) {
      const partes =
        authorization.trim().split(/\s+/);

      if (
        partes.length === 2 &&
        partes[0] === 'Bearer' &&
        partes[1]
      ) {
        token = partes[1].trim();
      }
    }
  }

  // ==========================================================
  // TOKEN AUSENTE
  // ==========================================================

  if (!token) {
    return res.status(401).json({
      erro: 'Não autenticado.'
    });
  }

  // ==========================================================
  // VALIDAR JWT
  // ==========================================================

  try {
    const payload =
      jwt.verify(
        token,
        JWT_SECRET
      );

    // ========================================================
    // CAMPOS OBRIGATÓRIOS
    // ========================================================

    if (
      !payload ||
      !payload.id ||
      !payload.perfil
    ) {
      return res.status(401).json({
        erro: 'Token de autenticação inválido.'
      });
    }

    // ========================================================
    // PERFIS PERMITIDOS
    // ========================================================

    const perfisPermitidos = [
      'administrador',
      'funcionario',
      'dev'
    ];

    if (
      !perfisPermitidos.includes(
        payload.perfil
      )
    ) {
      return res.status(401).json({
        erro: 'Token de autenticação inválido.'
      });
    }

    // ========================================================
    // USUÁRIOS COMUNS PRECISAM DE EMPRESA
    // ========================================================

    if (
      payload.perfil !== 'dev' &&
      !payload.empresa_id
    ) {
      return res.status(401).json({
        erro: 'Token de autenticação inválido.'
      });
    }

    // ========================================================
    // DEV
    // ========================================================
    //
    // DEV pode existir sem empresa.
    //
    // Caso futuramente exista um DEV vinculado a uma empresa,
    // o acesso continuará sendo controlado pelo perfil.
    //

    // ========================================================
    // USUÁRIO AUTENTICADO
    // ========================================================

    req.usuario = {
      id: payload.id,

      empresa_id:
        payload.empresa_id ?? null,

      nome:
        payload.nome || null,

      email:
        payload.email || null,

      perfil:
        payload.perfil
    };

    next();

  } catch (err) {
    console.error(
      'Erro ao validar token:',
      err.message
    );

    return res.status(401).json({
      erro: 'Sessão expirada ou token inválido.'
    });
  }
}

module.exports = autenticar;
