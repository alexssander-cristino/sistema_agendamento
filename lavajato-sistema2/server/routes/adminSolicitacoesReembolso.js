'use strict';

const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const somenteDev = require('../middleware/dev');

const router = express.Router();

router.use(autenticar);
router.use(somenteDev);

const STATUS_VALIDOS = [
  'pendente',
  'em_analise',
  'aprovada',
  'recusada',
  'concluida'
];

// GET /api/admin/solicitacoes-reembolso
// Lista os pedidos e permite filtrar por status.
router.get('/', async (req, res) => {
  const status = String(req.query.status || '').trim();

  if (status && !STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({
      erro: 'Filtro de status inválido.'
    });
  }

  try {
    const valores = [];
    let filtro = '';

    if (status) {
      valores.push(status);
      filtro = `WHERE sr.status = $${valores.length}`;
    }

    const { rows } = await pool.query(
      `
        SELECT
          sr.id,
          sr.empresa_id,
          sr.assinatura_id,
          sr.usuario_id,
          sr.motivo,
          sr.detalhes,
          sr.status,
          sr.resposta,
          sr.criado_em,
          sr.atualizado_em,
          sr.analisada_em,
          e.nome AS empresa_nome,
          u.nome AS solicitante_nome,
          u.email AS solicitante_email,
          a.status AS assinatura_status
        FROM solicitacoes_reembolso sr
        INNER JOIN empresas e
          ON e.id = sr.empresa_id
        INNER JOIN usuarios u
          ON u.id = sr.usuario_id
        INNER JOIN assinaturas a
          ON a.id = sr.assinatura_id
        ${filtro}
        ORDER BY
          CASE sr.status
            WHEN 'pendente' THEN 1
            WHEN 'em_analise' THEN 2
            WHEN 'aprovada' THEN 3
            WHEN 'recusada' THEN 4
            WHEN 'concluida' THEN 5
            ELSE 6
          END,
          sr.criado_em DESC
        LIMIT 500
      `,
      valores
    );

    const contagens = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'pendente'
        )::int AS pendentes,
        COUNT(*) FILTER (
          WHERE status = 'em_analise'
        )::int AS em_analise,
        COUNT(*) FILTER (
          WHERE status = 'aprovada'
        )::int AS aprovadas,
        COUNT(*) FILTER (
          WHERE status = 'recusada'
        )::int AS recusadas,
        COUNT(*) FILTER (
          WHERE status = 'concluida'
        )::int AS concluidas
      FROM solicitacoes_reembolso
    `);

    return res.json({
      ok: true,
      solicitacoes: rows,
      contagens: contagens.rows[0]
    });
  } catch (err) {
    console.error(
      'Erro ao listar solicitações de reembolso:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível carregar as solicitações.'
    });
  }
});

// PATCH /api/admin/solicitacoes-reembolso/:id/status
// Atualiza o andamento da solicitação.
// Não executa o estorno no Mercado Pago.
router.patch('/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '').trim();
  const resposta = typeof req.body?.resposta === 'string'
    ? req.body.resposta.trim().slice(0, 3000)
    : '';

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({
      erro: 'Identificador de solicitação inválido.'
    });
  }

  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({
      erro: 'Status inválido.'
    });
  }

  if (['aprovada', 'recusada'].includes(status) && !resposta) {
    return res.status(400).json({
      erro: 'Informe uma resposta ao aprovar ou recusar o pedido.'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const atualResult = await client.query(
      `
        SELECT id, status
        FROM solicitacoes_reembolso
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );

    if (!atualResult.rows.length) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        erro: 'Solicitação não encontrada.'
      });
    }

    const atual = atualResult.rows[0];

    const transicoes = {
      pendente: ['em_analise', 'aprovada', 'recusada'],
      em_analise: ['aprovada', 'recusada'],
      aprovada: ['concluida'],
      recusada: [],
      concluida: []
    };

    if (!transicoes[atual.status]?.includes(status)) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: `Não é possível alterar de "${atual.status}" para "${status}".`
      });
    }

    const finalizada = [
      'aprovada',
      'recusada',
      'concluida'
    ].includes(status);

    const { rows } = await client.query(
      `
        UPDATE solicitacoes_reembolso
        SET
          status = $2,
          resposta = COALESCE(NULLIF($3, ''), resposta),
          analisada_por = CASE
            WHEN $4 THEN $5
            ELSE analisada_por
          END,
          analisada_em = CASE
            WHEN $4 THEN NOW()
            ELSE analisada_em
          END,
          atualizado_em = NOW()
        WHERE id = $1
        RETURNING
          id,
          status,
          resposta,
          atualizado_em,
          analisada_em
      `,
      [
        id,
        status,
        resposta,
        finalizada,
        req.usuario.id
      ]
    );

    await client.query('COMMIT');

    return res.json({
      ok: true,
      mensagem: 'Solicitação atualizada.',
      solicitacao: rows[0],
      observacao: status === 'aprovada'
        ? 'A aprovação foi registrada. O estorno financeiro ainda precisa ser realizado e confirmado separadamente.'
        : status === 'concluida'
          ? 'O pedido foi marcado como concluído. Confirme que o procedimento de reembolso foi realmente finalizado.'
          : null
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    console.error(
      'Erro ao atualizar solicitação de reembolso:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível atualizar a solicitação.'
    });
  } finally {
    client.release();
  }
});

module.exports = router;