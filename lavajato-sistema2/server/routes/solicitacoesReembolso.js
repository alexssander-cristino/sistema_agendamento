'use strict';

const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');

const router = express.Router();

router.use(autenticar);

const MOTIVOS_VALIDOS = [
  'arrependimento',
  'cobranca_indevida',
  'duplicidade',
  'falha_servico',
  'outro'
];

function numeroPositivo(valor) {
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero > 0;
}

function texto(valor, limite) {
  return typeof valor === 'string'
    ? valor.trim().slice(0, limite)
    : '';
}

// POST /api/solicitacoes-reembolso
// Registra um pedido de análise. Não realiza estorno automático.
router.post('/', async (req, res) => {
  const empresaId = Number(req.usuario?.empresa_id);
  const usuarioId = Number(req.usuario?.id);

  const motivo = texto(req.body?.motivo, 40);
  const detalhes = texto(req.body?.detalhes, 2000);

  if (!numeroPositivo(empresaId) || !numeroPositivo(usuarioId)) {
    return res.status(400).json({
      erro: 'Sua conta precisa estar vinculada a uma empresa válida.'
    });
  }

  if (!MOTIVOS_VALIDOS.includes(motivo)) {
    return res.status(400).json({
      erro: 'Selecione um motivo válido para a solicitação.'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // A assinatura é obtida pela empresa da sessão autenticada.
    // O cliente não pode escolher outra empresa ou assinatura.
    const assinaturaResult = await client.query(
      `
        SELECT id, status
        FROM assinaturas
        WHERE empresa_id = $1
        ORDER BY
          CASE status
            WHEN 'ativa' THEN 1
            WHEN 'inadimplente' THEN 2
            WHEN 'pausada' THEN 3
            WHEN 'pendente' THEN 4
            ELSE 5
          END,
          id DESC
        LIMIT 1
        FOR UPDATE
      `,
      [empresaId]
    );

    if (!assinaturaResult.rows.length) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        erro: 'Não encontramos uma assinatura vinculada à sua empresa.'
      });
    }

    const assinatura = assinaturaResult.rows[0];

    const abertaResult = await client.query(
      `
        SELECT id, status, criado_em
        FROM solicitacoes_reembolso
        WHERE empresa_id = $1
          AND assinatura_id = $2
          AND status IN ('pendente', 'em_analise')
        ORDER BY id DESC
        LIMIT 1
      `,
      [empresaId, assinatura.id]
    );

    if (abertaResult.rows.length) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'Já existe uma solicitação aberta para esta assinatura.',
        solicitacao: abertaResult.rows[0]
      });
    }

    const criadaResult = await client.query(
      `
        INSERT INTO solicitacoes_reembolso (
          empresa_id,
          assinatura_id,
          usuario_id,
          motivo,
          detalhes,
          status,
          criado_em,
          atualizado_em
        )
        VALUES ($1, $2, $3, $4, $5, 'pendente', NOW(), NOW())
        RETURNING
          id,
          assinatura_id,
          motivo,
          status,
          criado_em
      `,
      [
        empresaId,
        assinatura.id,
        usuarioId,
        motivo,
        detalhes || null
      ]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      ok: true,
      mensagem: 'Sua solicitação foi registrada para análise.',
      observacao:
        'O protocolo não significa que o reembolso foi aprovado ou que o estorno foi realizado.',
      solicitacao: criadaResult.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    if (err?.code === '23505') {
      return res.status(409).json({
        erro: 'Já existe uma solicitação aberta para esta assinatura.'
      });
    }

    console.error(
      'Erro ao registrar solicitação de reembolso:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível registrar a solicitação. Tente novamente.'
    });
  } finally {
    client.release();
  }
});

// GET /api/solicitacoes-reembolso/minhas
// Retorna somente os pedidos da empresa autenticada.
router.get('/minhas', async (req, res) => {
  const empresaId = Number(req.usuario?.empresa_id);

  if (!numeroPositivo(empresaId)) {
    return res.status(400).json({
      erro: 'Sua conta precisa estar vinculada a uma empresa válida.'
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          assinatura_id,
          motivo,
          detalhes,
          status,
          resposta,
          criado_em,
          atualizado_em,
          analisada_em
        FROM solicitacoes_reembolso
        WHERE empresa_id = $1
        ORDER BY criado_em DESC
        LIMIT 50
      `,
      [empresaId]
    );

    return res.json({
      ok: true,
      solicitacoes: result.rows
    });
  } catch (err) {
    console.error(
      'Erro ao consultar solicitações de reembolso:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível consultar suas solicitações.'
    });
  }
});

module.exports = router;