const express = require('express');
const crypto = require('crypto');

const pool = require('../db');

const router = express.Router();

const WEBHOOK_SECRET =
  process.env.MERCADO_PAGO_WEBHOOK_SECRET;

// ============================================================
// VALIDAR ASSINATURA DO WEBHOOK
// ============================================================

function validarAssinaturaWebhook(req) {
  /*
   * A validação utiliza:
   *
   * x-signature
   * x-request-id
   * data.id
   *
   * O Mercado Pago envia algo parecido com:
   *
   * x-signature:
   * ts=1742505638683,v1=HASH
   *
   * O manifest utilizado é:
   *
   * id:<data.id>;
   * request-id:<x-request-id>;
   * ts:<timestamp>;
   */

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

  /*
   * O data.id normalmente vem pela query string.
   *
   * Exemplo:
   *
   * /api/mercado-pago/webhook?data.id=123456&type=payment
   */
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
    String(xSignature).split(',');

  for (const parte of partes) {
    const [chave, ...resto] =
      parte.split('=');

    if (!chave || resto.length === 0) {
      continue;
    }

    const valor =
      resto.join('=').trim();

    if (chave.trim() === 'ts') {
      timestamp = valor;
    }

    if (chave.trim() === 'v1') {
      assinaturaRecebida = valor;
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

  /*
   * O Mercado Pago orienta utilizar data.id em
   * minúsculas na validação.
   */
  const dataIdNormalizado =
    String(dataId).toLowerCase();

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

  /*
   * Comparação segura contra timing attacks.
   */
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
// ATUALIZAR ASSINATURA NO BANCO
// ============================================================

async function atualizarAssinatura(
  mercadoPagoId,
  dados
) {
  /*
   * O ID da assinatura no Mercado Pago
   * corresponde ao campo:
   *
   * assinaturas.mercado_pago_id
   */

  const resultado =
    await pool.query(
      `
      UPDATE assinaturas
      SET
        status = $1,
        inicio_em = COALESCE($2, inicio_em),
        proxima_cobranca_em = $3,
        cancelada_em = $4,
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
        dados.inicio_em,
        dados.proxima_cobranca_em,
        dados.cancelada_em,
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
// CONVERTER STATUS MERCADO PAGO
// ============================================================

function converterStatus(statusMercadoPago) {
  /*
   * Estados utilizados pelo Mercado Pago
   * podem variar conforme o fluxo da assinatura.
   *
   * Nosso sistema trabalha com:
   *
   * pendente
   * ativa
   * pausada
   * cancelada
   * inadimplente
   */

  switch (
    String(statusMercadoPago || '')
      .toLowerCase()
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
// WEBHOOK
// ============================================================

router.post(
  '/webhook',
  async (req, res) => {
    try {
      console.log(
        'Webhook Mercado Pago recebido:',
        {
          type: req.body?.type,
          action: req.body?.action,
          data_id:
            req.body?.data?.id,
          query_data_id:
            req.query['data.id']
        }
      );

      /*
       * ======================================================
       * VALIDAR ORIGEM
       * ======================================================
       */

      const assinaturaValida =
        validarAssinaturaWebhook(req);

      if (!assinaturaValida) {
        console.error(
          'Webhook Mercado Pago rejeitado: assinatura inválida.'
        );

        return res.status(401).json({
          ok: false,
          erro: 'Webhook não autorizado.'
        });
      }

      /*
       * ======================================================
       * TIPO DA NOTIFICAÇÃO
       * ======================================================
       */

      const tipo =
        req.body?.type;

      const action =
        req.body?.action;

      const dataId =
        req.query['data.id'] ||
        req.body?.data?.id;

      /*
       * Se não for um evento relacionado
       * às assinaturas, apenas confirmamos
       * o recebimento.
       */

      if (
        tipo !== 'subscription_preapproval' &&
        tipo !== 'subscription_authorized_payment'
      ) {
        console.log(
          'Webhook ignorado. Tipo:',
          tipo
        );

        return res.status(200).json({
          ok: true,
          ignorado: true
        });
      }

      /*
       * ======================================================
       * VERIFICAR ID
       * ======================================================
       */

      if (!dataId) {
        console.error(
          'Webhook sem data.id.'
        );

        return res.status(400).json({
          ok: false,
          erro: 'ID da notificação não informado.'
        });
      }

      /*
       * ======================================================
       * SUBSCRIPTION PREAPPROVAL
       * ======================================================
       *
       * Esse evento informa alterações na assinatura.
       *
       * Vamos consultar o Mercado Pago diretamente
       * para obter o estado atual.
       */

      if (
        tipo ===
        'subscription_preapproval'
      ) {
        const {
          buscarAssinatura
        } = require(
          '../services/mercadoPago'
        );

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

        /*
         * Se não reconhecermos o status,
         * não alteramos o banco.
         */
        if (!novoStatus) {
          console.log(
            'Status Mercado Pago não mapeado:',
            statusMercadoPago
          );

          return res.status(200).json({
            ok: true,
            processado: false,
            motivo:
              'Status não mapeado.'
          });
        }

        /*
         * Datas da assinatura.
         */
        const inicioEm =
          assinaturaMercadoPago?.date_created ||
          null;

        const proximaCobrancaEm =
          assinaturaMercadoPago
            ?.next_payment_date ||
          assinaturaMercadoPago
            ?.auto_recurring
            ?.end_date ||
          null;

        const canceladaEm =
          novoStatus === 'cancelada'
            ? (
                assinaturaMercadoPago
                  ?.date_created ||
                new Date().toISOString()
              )
            : null;

        const assinaturaAtualizada =
          await atualizarAssinatura(
            dataId,
            {
              status: novoStatus,
              inicio_em: inicioEm,
              proxima_cobranca_em:
                proximaCobrancaEm,
              cancelada_em:
                canceladaEm
            }
          );

        if (!assinaturaAtualizada) {
          console.warn(
            'Assinatura Mercado Pago não encontrada no banco:',
            dataId
          );

          /*
           * Retornamos 200 para evitar que o Mercado Pago
           * fique reenviando indefinidamente uma notificação
           * que não possui correspondência local.
           */
          return res.status(200).json({
            ok: true,
            processado: false,
            motivo:
              'Assinatura não encontrada no banco.'
          });
        }

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

        return res.status(200).json({
          ok: true,
          processado: true,
          tipo,
          action,
          assinatura:
            assinaturaAtualizada
        });
      }

      /*
       * ======================================================
       * PAGAMENTO AUTORIZADO DA ASSINATURA
       * ======================================================
       *
       * Esse evento representa uma cobrança/fatura
       * relacionada à assinatura.
       *
       * Primeiro buscamos os dados da cobrança.
       */

      if (
        tipo ===
        'subscription_authorized_payment'
      ) {
        const {
          buscarPagamentoAutorizado
        } = require(
          '../services/mercadoPago'
        );

        const pagamento =
          await buscarPagamentoAutorizado(
            dataId
          );

        /*
         * O pagamento autorizado possui referência
         * à assinatura.
         *
         * Procuramos primeiro por preapproval_id.
         */

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

          return res.status(200).json({
            ok: true,
            processado: false,
            motivo:
              'Assinatura da cobrança não identificada.'
          });
        }

        /*
         * Status da cobrança.
         */
        const statusPagamento =
          String(
            pagamento?.status ||
            ''
          ).toLowerCase();

        /*
         * Se a cobrança foi aprovada/autorizada,
         * mantemos a assinatura ativa.
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
                status: 'ativa',

                inicio_em:
                  null,

                proxima_cobranca_em:
                  pagamento?.next_payment_date ||
                  pagamento?.date_created ||
                  null,

                cancelada_em:
                  null
              }
            );

          console.log(
            'Cobrança aprovada. Assinatura mantida ativa:',
            {
              pagamento:
                dataId,
              assinatura:
                mercadoPagoSubscriptionId
            }
          );

          return res.status(200).json({
            ok: true,
            processado: true,
            status: 'ativa',
            assinatura:
              assinaturaAtualizada
          });
        }

        /*
         * Se a cobrança foi rejeitada,
         * marcamos como inadimplente.
         */

        if (
          statusPagamento ===
            'rejected' ||
          statusPagamento ===
            'cancelled' ||
          statusPagamento ===
            'canceled'
        ) {
          const assinaturaAtualizada =
            await atualizarAssinatura(
              mercadoPagoSubscriptionId,
              {
                status:
                  'inadimplente',

                inicio_em:
                  null,

                proxima_cobranca_em:
                  pagamento?.next_payment_date ||
                  null,

                cancelada_em:
                  null
              }
            );

          console.warn(
            'Cobrança não aprovada. Assinatura marcada como inadimplente:',
            {
              pagamento:
                dataId,
              assinatura:
                mercadoPagoSubscriptionId,
              status:
                statusPagamento
            }
          );

          return res.status(200).json({
            ok: true,
            processado: true,
            status:
              'inadimplente',
            assinatura:
              assinaturaAtualizada
          });
        }

        /*
         * Outros estados não alteram a assinatura.
         */
        console.log(
          'Pagamento autorizado com status não tratado:',
          statusPagamento
        );

        return res.status(200).json({
          ok: true,
          processado: false,
          motivo:
            'Status do pagamento não tratado.',
          status:
            statusPagamento
        });
      }

      /*
       * ======================================================
       * FALLBACK
       * ======================================================
       */

      return res.status(200).json({
        ok: true,
        processado: false
      });

    } catch (err) {
      console.error(
        'Erro ao processar webhook Mercado Pago:',
        err
      );

      /*
       * Retornamos 500 para que o Mercado Pago possa
       * reenviar a notificação posteriormente.
       */
      return res.status(500).json({
        ok: false,
        erro:
          'Erro ao processar webhook.'
      });
    }
  }
);

module.exports = router;
