const express = require('express');

const pool = require('../db');
const autenticar = require('../middleware/auth');

const router = express.Router();

// ============================================================
// AUTENTICAÇÃO
// ============================================================

router.use(autenticar);

// ============================================================
// SOMENTE ADMINISTRADOR
// ============================================================

function somenteAdministrador(req, res, next) {
  if (req.usuario.perfil !== 'administrador') {
    return res.status(403).json({
      erro: 'Acesso permitido somente para administradores.'
    });
  }

  if (!req.usuario.empresa_id) {
    return res.status(403).json({
      erro: 'Usuário não possui empresa vinculada.'
    });
  }

  next();
}

router.use(somenteAdministrador);

// ============================================================
// LISTAR SOLICITAÇÕES DA EMPRESA
// GET /api/admin/privacidade
// ============================================================

router.get('/', async (req, res) => {
  const empresaId = req.usuario.empresa_id;

  try {
    const { rows } = await pool.query(
      `
      SELECT
        sp.id,
        sp.usuario_id,
        sp.tipo,
        sp.descricao,
        sp.status,
        sp.resposta,
        sp.criado_em,
        sp.atualizado_em,

        u.nome AS usuario_nome,
        u.email AS usuario_email

      FROM solicitacoes_privacidade sp

      INNER JOIN usuarios u
        ON u.id = sp.usuario_id
       AND u.empresa_id = sp.empresa_id

      WHERE sp.empresa_id = $1

      ORDER BY
        CASE
          WHEN sp.status = 'pendente' THEN 1
          WHEN sp.status = 'em_analise' THEN 2
          WHEN sp.status = 'atendida' THEN 3
          WHEN sp.status = 'recusada' THEN 4
          WHEN sp.status = 'cancelada' THEN 5
          ELSE 6
        END,
        sp.criado_em DESC
      `,
      [empresaId]
    );

    res.json(rows);

  } catch (err) {
    console.error(
      'Erro ao listar solicitações de privacidade:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível carregar as solicitações.'
    });
  }
});

// ============================================================
// CONSULTAR SOLICITAÇÃO
// GET /api/admin/privacidade/:id
// ============================================================

router.get('/:id', async (req, res) => {
  const empresaId = req.usuario.empresa_id;
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      erro: 'ID da solicitação inválido.'
    });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        sp.id,
        sp.usuario_id,
        sp.tipo,
        sp.descricao,
        sp.status,
        sp.resposta,
        sp.criado_em,
        sp.atualizado_em,

        u.nome AS usuario_nome,
        u.email AS usuario_email

      FROM solicitacoes_privacidade sp

      INNER JOIN usuarios u
        ON u.id = sp.usuario_id
       AND u.empresa_id = sp.empresa_id

      WHERE sp.id = $1
        AND sp.empresa_id = $2

      LIMIT 1
      `,
      [id, empresaId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Solicitação não encontrada.'
      });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error(
      'Erro ao consultar solicitação de privacidade:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível consultar a solicitação.'
    });
  }
});

// ============================================================
// ATUALIZAR SOLICITAÇÃO
// PATCH /api/admin/privacidade/:id
// ============================================================

router.patch('/:id', async (req, res) => {
  const empresaId = req.usuario.empresa_id;
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      erro: 'ID da solicitação inválido.'
    });
  }

  const {
    status,
    resposta
  } = req.body;

  const statusPermitidos = [
    'pendente',
    'em_analise',
    'atendida',
    'recusada',
    'cancelada'
  ];

  if (
    !status ||
    !statusPermitidos.includes(status)
  ) {
    return res.status(400).json({
      erro: 'Status inválido.'
    });
  }

  let respostaFinal = null;

  if (resposta !== undefined && resposta !== null) {
    if (typeof resposta !== 'string') {
      return res.status(400).json({
        erro: 'A resposta deve ser um texto.'
      });
    }

    respostaFinal = resposta.trim();

    if (respostaFinal.length > 5000) {
      return res.status(400).json({
        erro:
          'A resposta não pode ultrapassar 5000 caracteres.'
      });
    }
  }

  try {
    const { rows } = await pool.query(
      `
      UPDATE solicitacoes_privacidade

      SET
        status = $1,
        resposta = $2,
        atualizado_em = CURRENT_TIMESTAMP

      WHERE id = $3
        AND empresa_id = $4

      RETURNING
        id,
        usuario_id,
        tipo,
        descricao,
        status,
        resposta,
        criado_em,
        atualizado_em
      `,
      [
        status,
        respostaFinal,
        id,
        empresaId
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Solicitação não encontrada.'
      });
    }

    res.json({
      mensagem:
        'Solicitação atualizada com sucesso.',

      solicitacao: rows[0]
    });

  } catch (err) {
    console.error(
      'Erro ao atualizar solicitação de privacidade:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível atualizar a solicitação.'
    });
  }
});

// ============================================================
// EXPORT
// ============================================================

module.exports = router;

