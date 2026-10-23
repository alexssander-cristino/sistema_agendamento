
'use strict';

const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const somenteDev = require('../middleware/dev');

const {
  buscarUltimoPagamentoAprovadoAssinatura,
  buscarPagamentoMercadoPago,
  criarEstornoMercadoPago
} = require('../services/mercadoPago');

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

function validarId(valor) {
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function dinheiroBRL(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return 'valor não informado';
  }

  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function erroMercadoPago(err) {
  // Evita devolver tokens ou dados internos ao navegador.
  const mensagem = String(err?.message || '');

  if (/unauthorized|forbidden|access token|401|403/i.test(mensagem)) {
    return 'Falha de autenticação com o Mercado Pago. Confira a configuração do servidor.';
  }

  return 'Não foi possível confirmar a operação no Mercado Pago. Confira o status antes de tentar novamente.';
}

async function obterPagamentoDoPedido(pedido) {
  if (pedido.refund_payment_id) {
    return buscarPagamentoMercadoPago(pedido.refund_payment_id);
  }

  if (!pedido.mercado_pago_id) {
    throw new Error(
      'A assinatura não possui ID no Mercado Pago.'
    );
  }

  const fatura = await buscarUltimoPagamentoAprovadoAssinatura(
    pedido.mercado_pago_id
  );

  if (!fatura?.payment?.id) {
    throw new Error(
      'Não encontramos o identificador da cobrança aprovada.'
    );
  }

  return buscarPagamentoMercadoPago(fatura.payment.id);
}

// GET /api/admin/solicitacoes-reembolso
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
          sr.refund_payment_id,
          sr.refund_id,
          sr.refund_amount,
          sr.refund_status,
          sr.refunded_at,
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
    console.error('Erro ao listar solicitações de reembolso:', err);

    return res.status(500).json({
      erro: 'Não foi possível carregar as solicitações.'
    });
  }
});

// GET /api/admin/solicitacoes-reembolso/:id/estorno
// Apenas consulta a cobrança. Não movimenta dinheiro.
router.get('/:id/estorno', async (req, res) => {
  const id = validarId(req.params.id);

  if (!id) {
    return res.status(400).json({
      erro: 'Identificador de solicitação inválido.'
    });
  }

  try {
    const { rows } = await pool.query(
      `
        SELECT
          sr.id,
          sr.status,
          sr.refund_payment_id,
          sr.refund_amount,
          sr.refund_status,
          sr.refund_id,
          a.mercado_pago_id
        FROM solicitacoes_reembolso sr
        INNER JOIN assinaturas a
          ON a.id = sr.assinatura_id
        WHERE sr.id = $1
        LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        erro: 'Solicitação não encontrada.'
      });
    }

    const pedido = rows[0];

    if (pedido.status !== 'aprovada') {
      return res.status(409).json({
        erro: pedido.status === 'concluida'
          ? 'Esta solicitação já foi concluída.'
          : 'A solicitação precisa estar aprovada antes do estorno.'
      });
    }

    if (
      pedido.refund_status === 'approved' &&
      pedido.refund_id
    ) {
      return res.status(409).json({
        erro: 'Este estorno já foi confirmado.',
        estorno_id: pedido.refund_id
      });
    }

    const pagamento = await obterPagamentoDoPedido(pedido);

    if (String(pagamento.status).toLowerCase() !== 'approved') {
      return res.status(409).json({
        erro: 'A cobrança não está aprovada no Mercado Pago.'
      });
    }

    return res.json({
      ok: true,
      solicitacao_id: id,
      pagamento_id: String(pagamento.id),
      valor: Number(pagamento.transaction_amount),
      moeda: pagamento.currency_id || 'BRL',
      data_pagamento: pagamento.date_approved || null,
      tipo: 'integral',
      status_estorno: pedido.refund_status || null
    });
  } catch (err) {
    console.error('Erro ao consultar cobrança para estorno:', err);

    return res.status(502).json({
      erro: erroMercadoPago(err)
    });
  }
});

// POST /api/admin/solicitacoes-reembolso/:id/estornar
// Solicita estorno integral e só conclui após confirmação do provedor.
router.post('/:id/estornar', async (req, res) => {
  const id = validarId(req.params.id);

  if (!id) {
    return res.status(400).json({
      erro: 'Identificador de solicitação inválido.'
    });
  }

  let client;

  try {
    client = await pool.connect();
  } catch (err) {
    console.error('Erro ao conectar ao banco para preparar estorno:', err);

    return res.status(500).json({
      erro: 'Não foi possível preparar o estorno.'
    });
  }

  let pagamentoId;
  let chaveIdempotencia;
  let valorPagamento;

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `
        SELECT
          sr.id,
          sr.status,
          sr.refund_payment_id,
          sr.refund_id,
          sr.refund_status,
          sr.refund_idempotency_key,
          a.mercado_pago_id
        FROM solicitacoes_reembolso sr
        INNER JOIN assinaturas a
          ON a.id = sr.assinatura_id
        WHERE sr.id = $1
        FOR UPDATE OF sr
      `,
      [id]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        erro: 'Solicitação não encontrada.'
      });
    }

    const pedido = rows[0];

    if (pedido.status === 'concluida') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'Esta solicitação já foi concluída.',
        estorno_id: pedido.refund_id
      });
    }

    if (pedido.status !== 'aprovada') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'A solicitação precisa estar aprovada.'
      });
    }

    if (
      pedido.refund_status === 'approved' &&
      pedido.refund_id
    ) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'O Mercado Pago já confirmou este estorno.',
        estorno_id: pedido.refund_id
      });
    }

    // Não dispara duas chamadas simultâneas para o mesmo pedido.
    // Uma falha de comunicação pode ser retentada usando a mesma
    // chave de idempotência persistida no banco.
    if (pedido.refund_status === 'processing') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'Já existe uma tentativa de estorno em processamento. Verifique o Mercado Pago antes de tentar novamente.'
      });
    }

    let pagamento;

    if (pedido.refund_payment_id) {
      pagamento = await buscarPagamentoMercadoPago(
        pedido.refund_payment_id
      );
    } else {
      if (!pedido.mercado_pago_id) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          erro: 'A assinatura não possui ID no Mercado Pago.'
        });
      }

      const fatura = await buscarUltimoPagamentoAprovadoAssinatura(
        pedido.mercado_pago_id
      );

      if (!fatura?.payment?.id) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          erro: 'Não encontramos uma cobrança aprovada para esta assinatura.'
        });
      }

      pagamento = await buscarPagamentoMercadoPago(
        fatura.payment.id
      );
    }

    if (String(pagamento.status).toLowerCase() !== 'approved') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'A cobrança não está aprovada e não pode ser estornada.'
      });
    }

    pagamentoId = String(pagamento.id);
    valorPagamento = Number(pagamento.transaction_amount);

    if (!Number.isFinite(valorPagamento) || valorPagamento <= 0) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'O Mercado Pago retornou um valor de cobrança inválido.'
      });
    }

    chaveIdempotencia =
      pedido.refund_idempotency_key || crypto.randomUUID();

    await client.query(
      `
        UPDATE solicitacoes_reembolso
        SET
          refund_payment_id = $2,
          refund_amount = $3,
          refund_idempotency_key = $4,
          refund_status = 'processing',
          atualizado_em = NOW()
        WHERE id = $1
      `,
      [
        id,
        pagamentoId,
        valorPagamento,
        chaveIdempotencia
      ]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Erro ao preparar estorno:', err);

    return res.status(502).json({
      erro: erroMercadoPago(err)
    });
  } finally {
    client.release();
  }

  // O estorno acontece fora da transação SQL.
  // A mesma chave é reutilizada em uma tentativa segura.
  try {
    const estorno = await criarEstornoMercadoPago({
      pagamentoId,
      chaveIdempotencia
    });

    const statusEstorno = String(
      estorno?.status || ''
    ).toLowerCase();

    if (!estorno?.id) {
      throw new Error(
        'O Mercado Pago não retornou o identificador do estorno.'
      );
    }

    if (!['approved', 'pending'].includes(statusEstorno)) {
      await pool.query(
        `
          UPDATE solicitacoes_reembolso
          SET
            refund_status = 'failed',
            atualizado_em = NOW()
          WHERE id = $1
            AND status = 'aprovada'
        `,
        [id]
      );

      return res.status(502).json({
        erro: 'O Mercado Pago não confirmou o estorno.',
        status_estorno: statusEstorno
      });
    }

    const concluido = statusEstorno === 'approved';
    const valorEstornado = Number(estorno.amount);

    const mensagem = concluido
      ? `Estorno confirmado pelo Mercado Pago. Protocolo: ${estorno.id}. Valor: ${dinheiroBRL(Number.isFinite(valorEstornado) ? valorEstornado : valorPagamento)}.`
      : `Estorno solicitado ao Mercado Pago e aguardando confirmação. Protocolo: ${estorno.id}.`;

    const resultado = await pool.query(
      `
        UPDATE solicitacoes_reembolso
        SET
          refund_id = $2,
          refund_status = $3,
          refunded_at = CASE
            WHEN $4 THEN NOW()
            ELSE refunded_at
          END,
          status = CASE
            WHEN $4 THEN 'concluida'
            ELSE status
          END,
          resposta = CONCAT(
            COALESCE(resposta, ''),
            E'\\n\\n',
            $5
          ),
          atualizado_em = NOW()
        WHERE id = $1
          AND status = 'aprovada'
        RETURNING
          id,
          status,
          resposta,
          refund_id,
          refund_payment_id,
          refund_amount,
          refund_status,
          refunded_at,
          atualizado_em
      `,
      [
        id,
        String(estorno.id),
        statusEstorno,
        concluido,
        mensagem
      ]
    );

    if (!resultado.rows.length) {
      return res.status(409).json({
        erro: 'O estorno foi enviado, mas a solicitação mudou de estado. Confira a operação no Mercado Pago antes de agir novamente.',
        estorno_id: String(estorno.id),
        status_estorno: statusEstorno
      });
    }

    return res.status(concluido ? 200 : 202).json({
      ok: true,
      mensagem: concluido
        ? 'Estorno confirmado pelo Mercado Pago. Solicitação concluída.'
        : 'Estorno enviado ao Mercado Pago. Aguardando confirmação.',
      estorno: resultado.rows[0]
    });
  } catch (err) {
    console.error('Erro ao executar estorno Mercado Pago:', err);

    // Em caso de timeout, o Mercado Pago pode ter recebido o pedido
    // mesmo sem a resposta chegar. A chave é preservada no banco.
    await pool.query(
      `
        UPDATE solicitacoes_reembolso
        SET
          refund_status = 'failed',
          atualizado_em = NOW()
        WHERE id = $1
          AND status = 'aprovada'
      `,
      [id]
    ).catch((dbError) => {
      console.error('Erro ao registrar falha do estorno:', dbError);
    });

    return res.status(502).json({
      erro: erroMercadoPago(err),
      verificar_antes_de_repetir: true
    });
  }
});

// PATCH /api/admin/solicitacoes-reembolso/:id/status
// Atualiza o andamento. Não executa estorno financeiro.
router.patch('/:id/status', async (req, res) => {
  const id = validarId(req.params.id);
  const status = String(req.body?.status || '').trim();

  const resposta = typeof req.body?.resposta === 'string'
    ? req.body.resposta.trim().slice(0, 3000)
    : '';

  if (!id) {
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
        SELECT id, status, refund_status, refund_id
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
      aprovada: [],
      recusada: [],
      concluida: []
    };

    if (!transicoes[atual.status]?.includes(status)) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: atual.status === 'aprovada' && status === 'concluida'
          ? 'Não é possível concluir manualmente. Execute e confirme o estorno pelo Mercado Pago.'
          : `Não é possível alterar de "${atual.status}" para "${status}".`
      });
    }

    const finalizada = ['aprovada', 'recusada'].includes(status);

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
        : status === 'recusada'
          ? 'Solicitação recusada.'
          : null
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    console.error('Erro ao atualizar solicitação de reembolso:', err);

    return res.status(500).json({
      erro: 'Não foi possível atualizar a solicitação.'
    });
  } finally {
    client.release();
  }
});

module.exports = router;
