
const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');

const router = express.Router();

router.use(autenticar);

function obterEmpresaId(req) {
  return req.usuario?.empresa_id;
}

function obterUsuarioId(req) {
  return req.usuario?.id;
}

// GET /api/notificacoes
// Lista notificações visíveis para o usuário autenticado.
router.get('/', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const usuarioId = obterUsuarioId(req);

  if (!empresaId || !usuarioId) {
    return res.status(403).json({
      erro: 'Usuário não vinculado a uma empresa.'
    });
  }

  const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
  const limite = Math.min(
    50,
    Math.max(1, Number.parseInt(req.query.limite, 10) || 20)
  );
  const offset = (pagina - 1) * limite;

  try {
    const [lista, contagem] = await Promise.all([
      pool.query(
        `SELECT
           id,
           tipo,
           titulo,
           mensagem,
           link,
           criado_em,
           lida_em
         FROM notificacoes
         WHERE empresa_id = $1
           AND (usuario_id IS NULL OR usuario_id = $2)
         ORDER BY criado_em DESC, id DESC
         LIMIT $3 OFFSET $4`,
        [empresaId, usuarioId, limite, offset]
      ),

      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE lida_em IS NULL)::int AS nao_lidas
         FROM notificacoes
         WHERE empresa_id = $1
           AND (usuario_id IS NULL OR usuario_id = $2)`,
        [empresaId, usuarioId]
      )
    ]);

    return res.json({
      notificacoes: lista.rows,
      total: contagem.rows[0].total,
      nao_lidas: contagem.rows[0].nao_lidas,
      pagina,
      limite
    });
  } catch (err) {
    console.error('Erro ao listar notificações:', err);

    return res.status(500).json({
      erro: 'Não foi possível carregar as notificações.'
    });
  }
});

// GET /api/notificacoes/contador
router.get('/contador', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const usuarioId = obterUsuarioId(req);

  if (!empresaId || !usuarioId) {
    return res.status(403).json({
      erro: 'Usuário não vinculado a uma empresa.'
    });
  }

  try {
    const resultado = await pool.query(
      `SELECT COUNT(*)::int AS nao_lidas
       FROM notificacoes
       WHERE empresa_id = $1
         AND (usuario_id IS NULL OR usuario_id = $2)
         AND lida_em IS NULL`,
      [empresaId, usuarioId]
    );

    return res.json({
      nao_lidas: resultado.rows[0].nao_lidas
    });
  } catch (err) {
    console.error('Erro ao contar notificações:', err);

    return res.status(500).json({
      erro: 'Não foi possível consultar as notificações.'
    });
  }
});

// PATCH /api/notificacoes/lidas/todas
router.patch('/lidas/todas', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const usuarioId = obterUsuarioId(req);

  if (!empresaId || !usuarioId) {
    return res.status(403).json({
      erro: 'Usuário não vinculado a uma empresa.'
    });
  }

  try {
    const resultado = await pool.query(
      `UPDATE notificacoes
       SET lida_em = NOW()
       WHERE empresa_id = $1
         AND (usuario_id IS NULL OR usuario_id = $2)
         AND lida_em IS NULL`,
      [empresaId, usuarioId]
    );

    return res.json({
      mensagem: 'Notificações marcadas como lidas.',
      atualizadas: resultado.rowCount
    });
  } catch (err) {
    console.error('Erro ao marcar notificações como lidas:', err);

    return res.status(500).json({
      erro: 'Não foi possível atualizar as notificações.'
    });
  }
});

// PATCH /api/notificacoes/:id/lida
router.patch('/:id/lida', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const usuarioId = obterUsuarioId(req);
  const id = Number.parseInt(req.params.id, 10);

  if (!empresaId || !usuarioId) {
    return res.status(403).json({
      erro: 'Usuário não vinculado a uma empresa.'
    });
  }

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      erro: 'Identificador de notificação inválido.'
    });
  }

  try {
    const resultado = await pool.query(
      `UPDATE notificacoes
       SET lida_em = COALESCE(lida_em, NOW())
       WHERE id = $1
         AND empresa_id = $2
         AND (usuario_id IS NULL OR usuario_id = $3)
       RETURNING id, lida_em`,
      [id, empresaId, usuarioId]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        erro: 'Notificação não encontrada.'
      });
    }

    return res.json({
      mensagem: 'Notificação marcada como lida.',
      notificacao: resultado.rows[0]
    });
  } catch (err) {
    console.error('Erro ao atualizar notificação:', err);

    return res.status(500).json({
      erro: 'Não foi possível atualizar a notificação.'
    });
  }
});

module.exports = router;