const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn(
    'AVISO: JWT_SECRET não configurado no ambiente.'
  );
}

function autenticar(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).json({
      erro: 'Não autenticado.'
    });
  }

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

  try {
    const payload = jwt.verify(
      token,
      JWT_SECRET
    );

    /*
     * Todo usuário precisa ter:
     * - id
     * - perfil
     *
     * empresa_id é obrigatório para:
     * - administrador
     * - funcionario
     *
     * Para dev, empresa_id pode ser NULL.
     */

    if (
      !payload.id ||
      !payload.perfil
    ) {
      return res.status(401).json({
        erro: 'Token de autenticação inválido.'
      });
    }

    const perfisPermitidos = [
      'administrador',
      'funcionario',
      'dev'
    ];

    if (!perfisPermitidos.includes(payload.perfil)) {
      return res.status(401).json({
        erro: 'Token de autenticação inválido.'
      });
    }

    /*
     * Usuários comuns precisam estar vinculados
     * a uma empresa.
     */
    if (
      payload.perfil !== 'dev' &&
      !payload.empresa_id
    ) {
      return res.status(401).json({
        erro: 'Token de autenticação inválido.'
      });
    }

    /*
     * DEV pode existir sem empresa.
     */
    if (
      payload.perfil === 'dev' &&
      payload.empresa_id !== null &&
      payload.empresa_id !== undefined
    ) {
      /*
       * Não bloqueamos o token caso futuramente
       * um DEV possua uma empresa técnica.
       *
       * O controle de acesso continua sendo feito
       * pelo perfil.
       */
    }

    req.usuario = {
      id: payload.id,
      empresa_id:
        payload.empresa_id ?? null,
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