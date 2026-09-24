const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn(
    'AVISO: JWT_SECRET não configurado no ambiente.'
  );
}

function autenticar(req, res, next) {
  const authorization = req.headers.authorization;

  // ============================================================
  // VERIFICA SE O TOKEN FOI ENVIADO
  // ============================================================

  if (!authorization) {
    return res.status(401).json({
      erro: 'Não autenticado.'
    });
  }

  // ============================================================
  // VALIDA O FORMATO:
  // Bearer TOKEN
  // ============================================================

  const partes = authorization.split(' ');

  if (
    partes.length !== 2 ||
    partes[0] !== 'Bearer' ||
    !partes[1]
  ) {
    return res.status(401).json({
      erro: 'Token de autenticação inválido.'
    });
  }

  const token = partes[1];

  // ============================================================
  // VALIDA O JWT
  // ============================================================

  try {
    const payload = jwt.verify(
      token,
      JWT_SECRET
    );

    // ==========================================================
    // VALIDA DADOS ESSENCIAIS DO USUÁRIO
    // ==========================================================

    if (
      !payload.id ||
      !payload.empresa_id ||
      !payload.perfil
    ) {
      return res.status(401).json({
        erro: 'Token de autenticação inválido.'
      });
    }

    // ==========================================================
    // DISPONIBILIZA O USUÁRIO PARA AS ROTAS
    // ==========================================================

    req.usuario = {
      id: payload.id,
      empresa_id: payload.empresa_id,
      nome: payload.nome,
      email: payload.email,
      perfil: payload.perfil
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