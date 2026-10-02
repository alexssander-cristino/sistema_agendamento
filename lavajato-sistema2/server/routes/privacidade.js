const express = require('express');

const pool = require('../db');
const autenticar = require('../middleware/auth');

const router = express.Router();

// ============================================================
// AUTENTICAÇÃO
// ============================================================

router.use(autenticar);

// ============================================================
// FUNÇÃO AUXILIAR
// ============================================================

function verificarEmpresa(req, res) {
  if (
    req.usuario.perfil === 'dev' ||
    !req.usuario.empresa_id
  ) {
    res.status(403).json({
      erro: 'Acesso não disponível para este usuário.'
    });

    return false;
  }

  return true;
}

// ============================================================
// LISTAR SOLICITAÇÕES DO USUÁRIO
// GET /api/privacidade
// ============================================================

router.get('/', async (req, res) => {
  if (!verificarEmpresa(req, res)) {
    return;
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        tipo,
        descricao,
        status,
        resposta,
        criado_em,
        atualizado_em
      FROM solicitacoes_privacidade
      WHERE empresa_id = $1
        AND usuario_id = $2
      ORDER BY criado_em DESC
      `,
      [
        req.usuario.empresa_id,
        req.usuario.id
      ]
    );

    res.json(rows);
  } catch (err) {
    console.error(
      'Erro ao listar solicitações de privacidade:',
      err.message
    );

    res.status(500).json({
      erro: 'Erro ao consultar solicitações de privacidade.'
    });
  }
});

// ============================================================
// CRIAR SOLICITAÇÃO
// POST /api/privacidade/solicitacoes
// ============================================================

router.post('/solicitacoes', async (req, res) => {
  if (!verificarEmpresa(req, res)) {
    return;
  }

  try {
    const {
      tipo,
      descricao
    } = req.body;

    const tiposPermitidos = [
      'acesso',
      'correcao',
      'exclusao',
      'informacoes',
      'revogacao',
      'outro'
    ];

    if (!tipo || !tiposPermitidos.includes(tipo)) {
      return res.status(400).json({
        erro: 'Tipo de solicitação inválido.'
      });
    }

    const descricaoFinal =
      typeof descricao === 'string'
        ? descricao.trim()
        : '';

    if (descricaoFinal.length > 5000) {
      return res.status(400).json({
        erro:
          'A descrição não pode ultrapassar 5000 caracteres.'
      });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO solicitacoes_privacidade (
        empresa_id,
        usuario_id,
        tipo,
        descricao,
        status
      )
      VALUES ($1, $2, $3, $4, 'pendente')
      RETURNING
        id,
        tipo,
        descricao,
        status,
        resposta,
        criado_em,
        atualizado_em
      `,
      [
        req.usuario.empresa_id,
        req.usuario.id,
        tipo,
        descricaoFinal || null
      ]
    );

    res.status(201).json({
      mensagem:
        'Solicitação de privacidade registrada com sucesso.',
      solicitacao: rows[0]
    });
  } catch (err) {
    console.error(
      'Erro ao criar solicitação de privacidade:',
      err.message
    );

    res.status(500).json({
      erro: 'Erro ao registrar solicitação de privacidade.'
    });
  }
});

// ============================================================
// CONSULTAR UMA SOLICITAÇÃO
// GET /api/privacidade/solicitacoes/:id
// ============================================================

router.get('/solicitacoes/:id', async (req, res) => {
  if (!verificarEmpresa(req, res)) {
    return;
  }

  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        erro: 'ID da solicitação inválido.'
      });
    }

    const { rows } = await pool.query(
      `
      SELECT
        id,
        tipo,
        descricao,
        status,
        resposta,
        criado_em,
        atualizado_em
      FROM solicitacoes_privacidade
      WHERE id = $1
        AND empresa_id = $2
        AND usuario_id = $3
      LIMIT 1
      `,
      [
        id,
        req.usuario.empresa_id,
        req.usuario.id
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Solicitação de privacidade não encontrada.'
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(
      'Erro ao consultar solicitação de privacidade:',
      err.message
    );

    res.status(500).json({
      erro: 'Erro ao consultar solicitação de privacidade.'
    });
  }
});

// ============================================================
// CANCELAR SOLICITAÇÃO
// PATCH /api/privacidade/solicitacoes/:id/cancelar
// ============================================================

router.patch(
  '/solicitacoes/:id/cancelar',
  async (req, res) => {
    if (!verificarEmpresa(req, res)) {
      return;
    }

    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          erro: 'ID da solicitação inválido.'
        });
      }

      const { rows } = await pool.query(
        `
        UPDATE solicitacoes_privacidade
        SET
          status = 'cancelada',
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $1
          AND empresa_id = $2
          AND usuario_id = $3
          AND status = 'pendente'
        RETURNING
          id,
          tipo,
          descricao,
          status,
          resposta,
          criado_em,
          atualizado_em
        `,
        [
          id,
          req.usuario.empresa_id,
          req.usuario.id
        ]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          erro:
            'Solicitação não encontrada ou não pode mais ser cancelada.'
        });
      }

      res.json({
        mensagem: 'Solicitação cancelada com sucesso.',
        solicitacao: rows[0]
      });
    } catch (err) {
      console.error(
        'Erro ao cancelar solicitação de privacidade:',
        err.message
      );

      res.status(500).json({
        erro: 'Erro ao cancelar solicitação de privacidade.'
      });
    }
  }
);

// ============================================================
// EXPORT
// ============================================================

module.exports = router;

