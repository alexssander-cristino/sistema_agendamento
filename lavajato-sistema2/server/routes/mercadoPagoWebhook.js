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
    String(xSignature)
      .split(',');

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

  /*
   * Caso o Mercado Pago envie uma notificação
   * sem ID de evento, não conseguimos garantir
   * idempotência por evento.
   *
   * Nesse caso o evento continua podendo ser
   * processado normalmente.
   */

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

      RETURNING
        id,
        evento_id,
        processado,
        erro
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

  /*
   * Evento novo.
   */

  if (
    resultado.rows.length > 0
  ) {

    return {
      novo: true,
      registro:
        resultado.rows[0]
    };
  }

  /*
   * Evento já existente.
   */

  const existente =
    await pool.query(
      `
      SELECT
        id,
        evento_id,
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
// ATUALIZAR ASSINATURA NO BANCO
// ============================================================

async function atualizarAssinatura(
  mercadoPagoId,
  dados
) {

  if (!mercadoPagoId) {
    return null;
  }

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
          CASE
            WHEN $3 IS NOT NULL
              THEN $3
            WHEN $1 IN (
              'cancelada',
              'inadimplente'
            )
              THEN NULL
            ELSE proxima_cobranca_em
          END,

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
        String(mercadoPagoId)
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

    /*
     * Assinatura autorizada/ativa.
     */

    case 'authorized':
      return 'ativa';

    case 'active':
      return 'ativa';

    /*
     * Assinatura aguardando alguma
     * etapa de autorização/processamento.
     */

    case 'pending':
      return 'pendente';

    /*
     * Assinatura pausada.
     */

    case 'paused':
      return 'pausada';

    /*
     * Assinatura cancelada.
     */

    case 'cancelled':
      return 'cancelada';

    case 'canceled':
      return 'cancelada';

    /*
     * Estados finais problemáticos.
     */

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
// OBTER ID DA ASSINATURA A PARTIR DA COBRANÇA
// ============================================================

function obterIdAssinaturaPagamento(
  pagamento
) {

  return (
    pagamento?.preapproval_id ||
    pagamento?.preapproval?.id ||
    pagamento?.subscription_id ||
    null
  );
}

// ============================================================
// SINCRONIZAR ASSINATURA COM MERCADO PAGO
// ============================================================

async function sincronizarAssinaturaMercadoPago(
  mercadoPagoId
) {

  if (!mercadoPagoId) {
    return null;
  }

  const assinaturaMercadoPago =
    await buscarAssinatura(
      mercadoPagoId
    );

  if (
    !assinaturaMercadoPago
  ) {

    return null;
  }

  const statusMercadoPago =
    assinaturaMercadoPago.status;

  const novoStatus =
    converterStatus(
      statusMercadoPago
    );

  /*
   * Se o Mercado Pago enviar um status
   * que ainda não conhecemos, não alteramos
   * o banco local.
   */

  if (!novoStatus) {

    console.warn(
      'Status de assinatura Mercado Pago não mapeado:',
      statusMercadoPago
    );

    return null;
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
      mercadoPagoId,
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

  return {
    mercadoPago:
      assinaturaMercadoPago,

    banco:
      assinaturaAtualizada,

    status:
      novoStatus
  };
}

// ============================================================
// PROCESSAR EVENTO DE ASSINATURA
// ============================================================

async function processarEventoAssinatura(
  dataId
) {

  const sincronizacao =
    await sincronizarAssinaturaMercadoPago(
      dataId
    );

  if (!sincronizacao) {

    return {
      encontrada: false,
      atualizada: null,
      status: null
    };
  }

  return {
    encontrada:
      Boolean(
        sincronizacao.banco
      ),

    atualizada:
      sincronizacao.banco,

    status:
      sincronizacao.status
  };
}

// ============================================================
// PROCESSAR COBRANÇA RECORRENTE
// ============================================================

async function processarCobrancaRecorrente(
  pagamentoId
) {

  const pagamento =
    await buscarPagamentoAutorizado(
      pagamentoId
    );

  if (!pagamento) {

    throw new Error(
      'Pagamento autorizado não encontrado no Mercado Pago.'
    );
  }

  const mercadoPagoSubscriptionId =
    obterIdAssinaturaPagamento(
      pagamento
    );

  if (
    !mercadoPagoSubscriptionId
  ) {

    return {
      processado: false,
      motivo:
        'Assinatura da cobrança não identificada.',
      pagamento,
      assinatura: null
    };
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
    'Status da cobrança Mercado Pago:',
    {
      pagamento:
        pagamentoId,

      assinatura:
        mercadoPagoSubscriptionId,

      fatura:
        statusFatura,

      resumido:
        statusResumido,

      pagamento_status:
        statusPagamento
    }
  );

  // ==========================================================
  // PAGAMENTO APROVADO
  // ==========================================================

  if (
    statusPagamento ===
      'approved' ||
    statusPagamento ===
      'authorized'
  ) {

    /*
     * Não confiamos somente no status da cobrança.
     *
     * Buscamos novamente a assinatura no Mercado Pago
     * e usamos o estado real dela para atualizar o banco.
     */

    const sincronizacao =
      await sincronizarAssinaturaMercadoPago(
        mercadoPagoSubscriptionId
      );

    /*
     * Caso a consulta da assinatura não consiga
     * atualizar o banco, ainda tentamos marcar
     * como ativa somente se a assinatura local existir.
     */

    if (
      !sincronizacao?.banco
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

      return {
        processado: true,

        status:
          'ativa',

        pagamento,

        assinatura:
          assinaturaAtualizada
      };
    }

    return {
      processado: true,

      status:
        sincronizacao.status,

      pagamento,

      assinatura:
        sincronizacao.banco
    };
  }

  // ==========================================================
  // COBRANÇA PENDENTE
  // ==========================================================

  if (
    statusFatura ===
      'scheduled' ||
    statusFatura ===
      'waiting_for_gateway' ||
    statusResumido ===
      'pending' ||
    statusPagamento ===
      'pending' ||
    statusPagamento ===
      'in_process'
  ) {

    /*
     * Não derrubamos a assinatura.
     *
     * A cobrança ainda está sendo processada.
     */

    return {
      processado: true,

      status:
        'aguardando_pagamento',

      pagamento,

      assinatura: null
    };
  }

  // ==========================================================
  // RECYCLING
  // ==========================================================

  if (
    statusFatura ===
    'recycling'
  ) {

    /*
     * O Mercado Pago está tentando novamente
     * realizar a cobrança.
     *
     * Não marcamos a assinatura como
     * inadimplente neste momento.
     */

    console.warn(
      'Cobrança em recycling. Aguardando novas tentativas do Mercado Pago:',
      {
        pagamento:
          pagamentoId,

        assinatura:
          mercadoPagoSubscriptionId
      }
    );

    return {
      processado: true,

      status:
        'aguardando_nova_tentativa',

      pagamento,

      assinatura: null
    };
  }

  // ==========================================================
  // COBRANÇA RECUSADA
  // ==========================================================

  if (
    statusPagamento ===
      'rejected' ||
    statusResumido ===
      'rejected'
  ) {

    /*
     * IMPORTANTE:
     *
     * Uma cobrança recusada isoladamente não
     * significa que a assinatura inteira está
     * inadimplente.
     *
     * O Mercado Pago pode realizar novas tentativas.
     *
     * Por isso consultamos a assinatura real.
     */

    const sincronizacao =
      await sincronizarAssinaturaMercadoPago(
        mercadoPagoSubscriptionId
      );

    if (
      sincronizacao?.banco
    ) {

      console.warn(
        'Cobrança recusada. Assinatura sincronizada com o Mercado Pago:',
        {
          pagamento:
            pagamentoId,

          assinatura:
            mercadoPagoSubscriptionId,

          statusAssinatura:
            sincronizacao.status
        }
      );

      return {
        processado: true,

        status:
          'cobranca_recusada',

        pagamento,

        assinatura:
          sincronizacao.banco
      };
    }

    /*
     * Se a assinatura ainda não estiver
     * no banco, não criamos registro novo.
     */

    return {
      processado: true,

      status:
        'cobranca_recusada',

      pagamento,

      assinatura: null
    };
  }

  // ==========================================================
  // OUTROS ESTADOS
  // ==========================================================

  console.warn(
    'Status de cobrança não tratado:',
    {
      pagamento:
        pagamentoId,

      assinatura:
        mercadoPagoSubscriptionId,

      statusFatura,

      statusResumido,

      statusPagamento
    }
  );

  /*
   * Mesmo sem alteração, o evento foi
   * consultado corretamente.
   */

  return {
    processado: false,

    status:
      statusFatura ||
      statusResumido ||
      statusPagamento ||
      'desconhecido',

    pagamento,

    assinatura: null
  };
}

// ============================================================
// WEBHOOK
// ============================================================

/*
 * IMPORTANTE:
 *
 * O router já é montado no server/index.js assim:
 *
 * app.use(
 *   '/api/mercado-pago/webhook',
 *   mercadoPagoWebhookRouter
 * );
 *
 * Portanto aqui deve ser apenas "/".
 *
 * URL final:
 *
 * POST /api/mercado-pago/webhook
 */

router.post(
  '/',
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
      // VALIDAR DATA.ID
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

      /*
       * Evento já existe.
       *
       * Se ele já foi processado com sucesso,
       * podemos responder 200 imediatamente.
       */

      if (
        !registro.novo &&
        registro.registro?.processado === true
      ) {

        console.log(
          'Webhook duplicado já processado:',
          eventoId
        );

        return res
          .status(200)
          .json({
            ok: true,
            duplicado: true,
            processado_anteriormente: true
          });
      }

      /*
       * Evento existe, mas processado = FALSE.
       *
       * Isso significa que uma tentativa anterior
       * falhou.
       *
       * Portanto devemos processar novamente.
       */

      if (
        !registro.novo &&
        registro.registro?.processado === false
      ) {

        console.warn(
          'Webhook anteriormente falhou. Tentando processar novamente:',
          {
            evento_id:
              eventoId,

            erro_anterior:
              registro.registro?.erro
          }
        );
      }

      // ======================================================
      // SUBSCRIPTION PREAPPROVAL
      // ======================================================

      if (
        tipo ===
        'subscription_preapproval'
      ) {

        const resultado =
          await processarEventoAssinatura(
            dataId
          );

        /*
         * Mesmo que a assinatura não exista
         * localmente, a consulta ao Mercado Pago
         * foi feita com sucesso.
         *
         * Portanto não precisamos deixar o Mercado Pago
         * reenviando indefinidamente o mesmo evento.
         */

        await marcarEventoProcessado(
          eventoId
        );

        if (
          !resultado.encontrada
        ) {

          console.warn(
            'Assinatura Mercado Pago não encontrada no banco:',
            dataId
          );

          return res
            .status(200)
            .json({
              ok: true,
              processado: false,
              motivo:
                'Assinatura não encontrada no banco.',
              status:
                resultado.status
            });
        }

        console.log(
          'Assinatura sincronizada com Mercado Pago:',
          {
            id:
              resultado.atualizada.id,

            mercado_pago_id:
              dataId,

            status:
              resultado.atualizada.status
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
              resultado.atualizada
          });
      }

      // ======================================================
      // COBRANÇA RECORRENTE
      // ======================================================

      if (
        tipo ===
        'subscription_authorized_payment'
      ) {

        const resultado =
          await processarCobrancaRecorrente(
            dataId
          );

        await marcarEventoProcessado(
          eventoId
        );

        console.log(
          'Cobrança recorrente processada:',
          {
            pagamento:
              dataId,

            status:
              resultado.status,

            processado:
              resultado.processado
          }
        );

        return res
          .status(200)
          .json({
            ok: true,

            processado:
              resultado.processado,

            status:
              resultado.status,

            assinatura:
              resultado.assinatura || null
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
       * Mantemos processado = FALSE.
       *
       * Assim, caso o Mercado Pago envie novamente
       * o mesmo evento, o sistema poderá tentar
       * processá-lo novamente.
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