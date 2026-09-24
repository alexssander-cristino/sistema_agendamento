const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('AVISO: JWT_SECRET não configurado no ambiente.');
}

function autenticar(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).json({
      erro: 'Não autenticado.'
    });
  }

  const partes = authorization.split(' ');

  if (partes.length !== 2 || partes[0] !== 'Bearer') {
    return res.status(401).json({
      erro: 'Token de autenticação inválido.'
    });
  }

  const token = partes[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    req.usuario = payload;

    next();
  } catch (err) {
    return res.status(401).json({
      erro: 'Sessão expirada ou token inválido.'
    });
  }
}

module.exports = autenticar;