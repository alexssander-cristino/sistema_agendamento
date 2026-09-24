const pool = require('../db');

async function buscarPermissoesUsuario(usuarioId) {
  const { rows } = await pool.query(
    `SELECT
        p.id,
        p.codigo,
        p.nome,
        p.descricao
     FROM usuario_permissoes up

     INNER JOIN permissoes p
       ON p.id = up.permissao_id

     WHERE up.usuario_id = $1

     ORDER BY p.nome ASC`,
    [usuarioId]
  );

  return rows;
}

async function buscarCodigosPermissoesUsuario(usuarioId) {
  const { rows } = await pool.query(
    `SELECT
        p.codigo
     FROM usuario_permissoes up

     INNER JOIN permissoes p
       ON p.id = up.permissao_id

     WHERE up.usuario_id = $1

     ORDER BY p.codigo ASC`,
    [usuarioId]
  );

  return rows.map((permissao) => permissao.codigo);
}

async function substituirPermissoesUsuario(
  usuarioId,
  permissoes
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM usuario_permissoes
       WHERE usuario_id = $1`,
      [usuarioId]
    );

    if (permissoes.length > 0) {
      await client.query(
        `INSERT INTO usuario_permissoes
          (
            usuario_id,
            permissao_id
          )
         SELECT
            $1,
            id
         FROM permissoes
         WHERE codigo = ANY($2::varchar[])`,
        [
          usuarioId,
          permissoes
        ]
      );
    }

    await client.query('COMMIT');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;

  } finally {
    client.release();
  }
}

async function buscarTodasPermissoes() {
  const { rows } = await pool.query(
    `SELECT
        id,
        codigo,
        nome,
        descricao
     FROM permissoes
     ORDER BY nome ASC`
  );

  return rows;
}

module.exports = {
  buscarPermissoesUsuario,
  buscarCodigosPermissoesUsuario,
  substituirPermissoesUsuario,
  buscarTodasPermissoes
};