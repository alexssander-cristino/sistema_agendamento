const pool = require('../db');

function exigirPermissao(codigo) {
  return async (req, res, next) => {
    try {
      // Administrador possui acesso total.
      if (req.usuario.perfil === 'administrador') {
        return next();
      }

      const { rows } = await pool.query(
        `SELECT 1
         FROM usuario_permissoes up

         INNER JOIN permissoes p
           ON p.id = up.permissao_id

         WHERE up.usuario_id = $1
           AND p.codigo = $2

         LIMIT 1`,
        [
          req.usuario.id,
          codigo
        ]
      );

      if (rows.length === 0) {
        return res.status(403).json({
          erro: 'Você não possui permissão para acessar esta função.'
        });
      }

      next();

    } catch (err) {
      console.error('Erro ao verificar permissão:', err);

      return res.status(500).json({
        erro: 'Não foi possível verificar a permissão.'
      });
    }
  };
}

module.exports = exigirPermissao;