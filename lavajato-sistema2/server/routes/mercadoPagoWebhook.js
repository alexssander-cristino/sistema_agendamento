const express = require('express');
const crypto = require('crypto');

const pool = require('../db');

const {
  buscarAssinatura,
  buscarPagamentoAutorizado
} = require('../services/mercadoPago');

const router = express.Router();

const WEBHOOK_SECRET =
  process.env.MERCADO_PAGO_WEBHOOK_SECRET;

// ============================================================
// VALIDAR ASSINATURA DO WEBHOOK
// ============================================================

function validarAssinaturaWebhook(req) {

  if (!WEBHOOK_SECRET) {

    console.error(
      'MERCADO_PAGO_WEBHOOK_SECRET não configurado.'
    );

    return false;
  }

  const xSignature =
    req.headers['x-signature'];

  const xRequestId =
    req.headers['x-request-id'];

  const dataId =
    req.query['data.id'] ||
    req.query.data_id ||
    req.body?.data?.id ||
    '';

  if (
    !xSignature ||
    !xRequestId ||
    !dataId
  ) {

    console.error(
      'Webhook Mercado Pago sem informações suficientes para validação.'
    );

    return false;
  }

  let timestamp = null;
  let assinaturaRecebida = null;

  const partes =
    String(
      xSignature
    ).split(',');

  for (
    const parte of partes
  ) {

    const [
      chave,
      ...resto
    ] =
      parte.split('=');

    if (
      !chave ||
      resto.length === 0
    ) {
      continue;
    }

    const valor =
      resto
        .join('=')
        .trim();

    if (
      chave.trim() === 'ts'
    ) {

      timestamp =
        valor;

    }

    if (
      chave.trim() === 'v1'
    ) {

      assinaturaRecebida =
        valor;

    }

  }

  if (
    !timestamp ||
    !assinaturaRecebida
  ) {

    console.error(
      'x-signature do Mercado Pago inválido.'
    );

    return false;
  }

  const dataIdNormalizado =
    String(
      dataId
    ).toLowerCase();

  const manifest =
    `id:${dataIdNormalizado};` +
    `request-id:${xRequestId};` +
    `ts:${timestamp};`;

  const assinaturaCalculada =
    crypto
      .createHmac(
        'sha256',
        WEBHOOK_SECRET
      )
      .update(manifest)
      .digest('hex');

  try {

    const recebido =
      Buffer.from(
        assinaturaRecebida,
        'utf8'
      );

    const calculado =
      Buffer.from(
        assinaturaCalculada,
        'utf8'
      );

    if (
      recebido.length !==
      calculado.length
    ) {

      return false;

    }

    return crypto.timingSafeEqual(
      recebido,
      calculado
    );

  } catch (err) {

    console.error(
      'Erro ao comparar assinatura do webhook:',
      err.message
    );

    return false;
  }
}

// ============================================================
// REGISTRAR EVENTO
// ============================================================

async function registrarEventoWebhook({
  eventoId,
  tipo,
  action,
  dataId
}) {

  if (!eventoId) {
    return {
      novo: true,
      registro: null
    };
  }

  const resultado =
    await pool.query(
      `
      INSERT INTO mercado_pago_webhook_eventos (
        evento_id,
        tipo,
        acao,
        data_id
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (evento_id)
      DO NOTHING
      RETURNING id
      `,
      [
        String(eventoId),
        tipo || null,
        action || null,
        dataId
          ? String(dataId)
          : null
      ]
    );

  if (
    resultado.rows.length === 0
  ) {

    const existente =
      await pool.query(
        `
        SELECT
          id,
          processado,
          erro
        FROM mercado_pago_webhook_eventos
        WHERE evento_id = $1
        LIMIT 1
        `,
        [
          String(eventoId)
        ]
      );

    return {
      novo: false,
      registro:
        existente.rows[0] ||
        null
    };
  }

  return {
    novo: true,
    registro:
      resultado.rows[0]
  };
}

// ============================================================
// MARCAR EVENTO COMO PROCESSADO
// ============================================================

async function marcarEventoProcessado(
  eventoId
) {

  if (!eventoId) {
    return;
  }

  await pool.query(
    `
    UPDATE mercado_pago_webhook_eventos
    SET
      processado = TRUE,
      processado_em = NOW(),
      erro = NULL
    WHERE evento_id = $1
    `,
    [
      String(eventoId)
    ]
  );
}

// ============================================================
// REGISTRAR ERRO DO EVENTO
// ============================================================

async function registrarErroEvento(
  eventoId,
  erro
) {

  if (!eventoId) {
    return;
  }

  await pool.query(
    `
    UPDATE mercado_pago_webhook_eventos
    SET
      processado = FALSE,
      erro = $2
    WHERE evento_id = $1
    `,
    [
      String(eventoId),
      String(
        erro?.message ||
        erro ||
        'Erro desconhecido.'
      ).slice(
        0,
        2000
      )
    ]
  );
}

// ============================================================
// ATUALIZAR ASSINATURA
// ============================================================

async function atualizarAssinatura(
  mercadoPagoId,
  dados
) {

  const resultado =
    await pool.query(
      `
      UPDATE assinaturas
      SET
        status = $1,

        inicio_em =
          COALESCE(
            $2,
            inicio_em
          ),

        proxima_cobranca_em =
          COALESCE(
            $3,
            proxima_cobranca_em
          ),

        cancelada_em =
          CASE
            WHEN $4 = TRUE
              THEN COALESCE(
                cancelada_em,
                NOW()
              )
            ELSE NULL
          END,

        atualizado_em = NOW()

      WHERE mercado_pago_id = $5

      RETURNING
        id,
        empresa_id,
        plano_id,
        status,
        mercado_pago_id,
        inicio_em,
        proxima_cobranca_em,
        cancelada_em
      `,
      [
        dados.status,
        dados.inicio_em || null,
        dados.proxima_cobranca_em || null,
        dados.cancelada === true,
        mercadoPagoId
      ]
    );

  if (
    resultado.rows.length === 0
  ) {

    return null;

  }

  return resultado.rows[0];
}

// ============================================================
// CONVERTER STATUS DA ASSINATURA
// ============================================================

function converterStatus(
  statusMercadoPago
) {

  switch (
    String(
      statusMercadoPago || ''
    ).toLowerCase()
  ) {

    case 'authorized':
      return 'ativa';

    case 'active':
      return 'ativa';

    case 'pending':
      return 'pendente';

    case 'paused':
      return 'pausada';

    case 'cancelled':
      return 'cancelada';

    case 'canceled':
      return 'cancelada';

    case 'rejected':
      return 'inadimplente';

    case 'expired':
      return 'inadimplente';

    default:
      return null;
  }
}

// ============================================================
// IDENTIFICAR STATUS DA COBRANÇA
// ============================================================

function obterStatusCobranca(
  pagamento
) {

  /*
   * O endpoint authorized_payments
   * possui o estado da fatura e também
   * o estado do pagamento associado.
   */

  const statusFatura =
    String(
      pagamento?.status ||
      ''
    ).toLowerCase();

  const statusResumido =
    String(
      pagamento?.summarized ||
      ''
    ).toLowerCase();

  const statusPagamento =
    String(
      pagamento?.payment?.status ||
      ''
    ).toLowerCase();

  return {
    statusFatura,
    statusResumido,
    statusPagamento
  };
}

// ============================================================
// WEBHOOK
// ============================================================

router.post(
  '/webhook',
  async (req, res) => {

    const eventoId =
      req.body?.id ||
      req.body?.event_id ||
      null;

    const tipo =
      req.body?.type ||
      null;

    const action =
      req.body?.action ||
      null;

    const dataId =
      req.query['data.id'] ||
      req.query.data_id ||
      req.body?.data?.id ||
      null;

    try {

      console.log(
        'Webhook Mercado Pago recebido:',
        {
          evento_id:
            eventoId,

          type:
            tipo,

          action,

          data_id:
            dataId
        }
      );

      // ======================================================
      // VALIDAR ASSINATURA
      // ======================================================

      const assinaturaValida =
        validarAssinaturaWebhook(
          req
        );

      if (!assinaturaValida) {

        console.error(
          'Webhook Mercado Pago rejeitado: assinatura inválida.'
        );

        return res
          .status(401)
          .json({
            ok: false,
            erro:
              'Webhook não autorizado.'
          });

      }

      // ======================================================
      // EVENTOS SEM ID
      // ======================================================

      if (!dataId) {

        console.error(
          'Webhook sem data.id.'
        );

        return res
          .status(400)
          .json({
            ok: false,
            erro:
              'ID da notificação não informado.'
          });

      }

      // ======================================================
      // IDEMPOTÊNCIA
      // ======================================================

      const registro =
        await registrarEventoWebhook({
          eventoId,
          tipo,
          action,
          dataId
        });

      if (
        !registro.novo
      ) {

        console.log(
          'Webhook duplicado ignorado:',
          eventoId
        );

        return res
          .status(200)
          .json({
            ok: true,
            duplicado: true
          });

      }

      // ======================================================
      // EVENTOS DE ASSINATURA
      // ======================================================

      if (
        tipo ===
        'subscription_preapproval'
      ) {

        const assinaturaMercadoPago =
          await buscarAssinatura(
            dataId
          );

        const statusMercadoPago =
          assinaturaMercadoPago?.status;

        const novoStatus =
          converterStatus(
            statusMercadoPago
          );

        if (!novoStatus) {

          console.log(
            'Status Mercado Pago não mapeado:',
            statusMercadoPago
          );

          await marcarEventoProcessado(
            eventoId
          );

          return res
            .status(200)
            .json({
              ok: true,
              processado: false,
              motivo:
                'Status não mapeado.',
              status:
                statusMercadoPago
            });

        }

        const inicioEm =
          assinaturaMercadoPago
            ?.date_created ||
          null;

        const proximaCobrancaEm =
          assinaturaMercadoPago
            ?.next_payment_date ||
          null;

        const cancelada =
          novoStatus ===
          'cancelada';

        const assinaturaAtualizada =
          await atualizarAssinatura(
            dataId,
            {
              status:
                novoStatus,

              inicio_em:
                inicioEm,

              proxima_cobranca_em:
                proximaCobrancaEm,

              cancelada
            }
          );

        if (
          !assinaturaAtualizada
        ) {

          console.warn(
            'Assinatura Mercado Pago não encontrada no banco:',
            dataId
          );

          /*
           * O evento foi validado e consultado
           * corretamente. Não há motivo para
           * ficar recebendo o mesmo evento.
           */

          await marcarEventoProcessado(
            eventoId
          );

          return res
            .status(200)
            .json({
              ok: true,
              processado: false,
              motivo:
                'Assinatura não encontrada no banco.'
            });

        }

        await marcarEventoProcessado(
          eventoId
        );

        console.log(
          'Assinatura atualizada:',
          {
            id:
              assinaturaAtualizada.id,

            mercado_pago_id:
              dataId,

            status:
              assinaturaAtualizada.status
          }
        );

        return res
          .status(200)
          .json({
            ok: true,
            processado: true,
            tipo,
            action,
            assinatura:
              assinaturaAtualizada
          });

      }

      // ======================================================
      // COBRANÇA RECORRENTE
      // ======================================================

      if (
        tipo ===
        'subscription_authorized_payment'
      ) {

        const pagamento =
          await buscarPagamentoAutorizado(
            dataId
          );

        const mercadoPagoSubscriptionId =
          pagamento?.preapproval_id ||
          pagamento?.preapproval?.id ||
          pagamento?.subscription_id ||
          null;

        if (
          !mercadoPagoSubscriptionId
        ) {

          console.warn(
            'Pagamento autorizado sem preapproval_id:',
            dataId
          );

          await marcarEventoProcessado(
            eventoId
          );

          return res
            .status(200)
            .json({
              ok: true,
              processado: false,
              motivo:
                'Assinatura da cobrança não identificada.'
            });

        }

        const {
          statusFatura,
          statusResumido,
          statusPagamento
        } =
          obterStatusCobranca(
            pagamento
          );

        console.log(
          'Status da cobrança:',
          {
            fatura:
              statusFatura,

            resumido:
              statusResumido,

            pagamento:
              statusPagamento
          }
        );

        /*
         * Pagamento aprovado.
         */

        if (
          statusPagamento ===
            'approved' ||
          statusPagamento ===
            'authorized'
        ) {

          const assinaturaAtualizada =
            await atualizarAssinatura(
              mercadoPagoSubscriptionId,
              {
                status:
                  'ativa',

                inicio_em:
                  null,

                proxima_cobranca_em:
                  pagamento?.debit_date ||
                  null,

                cancelada:
                  false
              }
            );

          await marcarEventoProcessado(
            eventoId
          );

          console.log(
            'Cobrança aprovada. Assinatura ativa:',
            {
              pagamento:
                dataId,

              assinatura:
                mercadoPagoSubscriptionId
            }
          );

          return res
            .status(200)
            .json({
              ok: true,
              processado: true,
              status:
                'ativa',

              assinatura:
                assinaturaAtualizada
            });

        }

        /*
         * Cobrança em processamento
         * ou em nova tentativa.
         *
         * NÃO derrubamos a assinatura.
         */

        if (
          statusFatura ===
            'scheduled' ||
          statusFatura ===
            'recycling' ||
          statusFatura ===
            'waiting_for_gateway' ||
          statusResumido ===
            'pending' ||
          statusPagamento ===
            'pending' ||
          statusPagamento ===
            'in_process'
        ) {

          await marcarEventoProcessado(
            eventoId
          );

          console.log(
            'Cobrança pendente/em processamento. Assinatura mantida:',
            {
              pagamento:
                dataId,

              assinatura:
                mercadoPagoSubscriptionId
            }
          );

          return res
            .status(200)
            .json({
              ok: true,
              processado: true,
              status:
                'aguardando_pagamento'
            });

        }

        /*
         * Uma cobrança individual rejeitada
         * não significa automaticamente que
         * a assinatura inteira está inadimplente.
         *
         * O Mercado Pago pode tentar novamente.
         */

        if (
          statusPagamento ===
            'rejected' ||
          statusResumido ===
            'rejected' ||
          statusFatura ===
            'recycling'
        ) {

          await marcarEventoProcessado(
            eventoId
          );

          console.warn(
            'Cobrança recusada. Aguardando novas tentativas do Mercado Pago:',
            {
              pagamento:
                dataId,

              assinatura:
                mercadoPagoSubscriptionId,

              statusPagamento,

              statusFatura
            }
          );

          return res
            .status(200)
            .json({
              ok: true,
              processado: true,
              status:
                'cobranca_recusada',
              assinatura:
                mercadoPagoSubscriptionId
            });

        }

        /*
         * Outros estados.
         */

        await marcarEventoProcessado(
          eventoId
        );

        return res
          .status(200)
          .json({
            ok: true,
            processado: false,
            motivo:
              'Status da cobrança não tratado.',
            status:
              statusFatura ||
              statusResumido ||
              statusPagamento
          });

      }

      // ======================================================
      // PLANO ATUALIZADO
      // ======================================================

      if (
        tipo ===
        'subscription_preapproval_plan'
      ) {

        console.log(
          'Evento de plano recebido:',
          dataId
        );

        await marcarEventoProcessado(
          eventoId
        );

        return res
          .status(200)
          .json({
            ok: true,
            processado: false,
            motivo:
              'Evento de plano recebido.'
          });

      }

      // ======================================================
      // OUTROS EVENTOS
      // ======================================================

      console.log(
        'Webhook ignorado. Tipo:',
        tipo
      );

      await marcarEventoProcessado(
        eventoId
      );

      return res
        .status(200)
        .json({
          ok: true,
          ignorado: true,
          tipo
        });

    } catch (err) {

      console.error(
        'Erro ao processar webhook Mercado Pago:',
        err
      );

      /*
       * Se já registramos o evento,
       * guardamos o erro.
       *
       * Como processado continua FALSE,
       * o evento poderá ser identificado
       * posteriormente.
       */

      try {

        await registrarErroEvento(
          eventoId,
          err
        );

      } catch (erroBanco) {

        console.error(
          'Erro ao registrar falha do webhook:',
          erroBanco.message
        );

      }

      return res
        .status(500)
        .json({
          ok: false,
          erro:
            'Erro ao processar webhook.'
        });

    }
  }
);

module.exports = router;