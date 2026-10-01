function somenteDev(req, res, next) {
  if (!req.usuario || req.usuario.perfil !== 'dev') {
    return res.status(403).json({
      erro: 'Acesso permitido somente ao desenvolvedor.'
    });
  }

  next();
}

module.exports = somenteDev;