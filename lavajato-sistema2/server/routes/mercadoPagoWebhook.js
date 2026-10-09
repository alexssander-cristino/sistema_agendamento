
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
// CONFIGURAÇÕES
// ============================================================

const STATUS_ASSINATURA_VALIDOS = new Set([
  'ativa',
  'pendente',
  'pausada',
  'cancelada',
  'inadimplente'
]);

const MAX_ERRO = 2000;

// ============================================================
// RESPOSTAS E NORMALIZAÇÃO
// ============================================================

function normalizarTexto(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }

  return String(valor).trim();
}

function respostaErro(res, status, mensagem) {
  return res.status(status).json({
    ok: false,
    erro: mensagem
  });
}

function extrairDataId(req) {
  return (
    req.query?.['data.id'] ||
    req.query?.data_id ||
    req.body?.data?.id ||
    null
  );
}

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

  const dataId = extrairDataId(req);

  if (
    !xSignature ||
    !xRequestId ||
    !dataId
  ) {
    console.error(
      'Webhook sem os cabeçalhos ou identificadores necessários.'
    );

    return false;
  }

  let timestamp = null;
  let assinaturaRecebida = null;

  for (const parte of String(xSignature).split(',')) {
    const separador = parte.indexOf('=');

    if (separador === -1) {
      continue;
    }

    const chave =
      parte.slice(0, separador).trim();

    const valor =
      parte.slice(separador + 1).trim();

    if (chave === 'ts') {
      timestamp = valor;
    }

    if (chave === 'v1') {
      assinaturaRecebida = valor;
    }
  }

  if (
    !timestamp ||
    !assinaturaRecebida ||
    !/^[a-f0-9]{64}$/i.test(assinaturaRecebida)
  ) {
    return false;
  }

  /*
   * Manifesto de assinatura do Mercado Pago.
   * O data.id deve ser normalizado para minúsculas.
   */

  const dataIdNormalizado =
    String(dataId).toLowerCase();

  const manifest =
    `id:${dataIdNormalizado};` +
    `request-id:${xRequestId};` +
    `ts:${timestamp};`;

  const assinaturaCalculada =
    crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(manifest)
      .digest();

  const assinaturaRecebidaBuffer =
    Buffer.from(assinaturaRecebida, 'hex');

  if (
    assinaturaRecebidaBuffer.length !==
    assinaturaCalculada.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    assinaturaRecebidaBuffer,
    assinaturaCalculada
  );
}

// ============================================================
// REGISTRAR EVENTO E EVITAR REPROCESSAMENTO COMUM
// ============================================================

async function registrarEventoWebhook({
  eventoId,
  tipo,
  action,
  dataId
}) {
  /*
   * Sem um identificador de evento, não é possível
   * garantir idempotência por evento.
   */

  if (!eventoId) {
    return {
      novo: true,
      registro: null
    };
  }

  const resultado = await pool.query(
    `
    INSERT INTO mercado_pago_webhook_eventos (
      evento_id,
      tipo,
      acao,
      data_id,
      processado,
      erro
    )
    VALUES ($1, $2, $3, $4, FALSE, NULL)
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
      dataId ? String(dataId) : null
    ]
  );

  if (resultado.rows.length > 0) {
    return {
      novo: true,
      registro: resultado.rows[0]
    };
  }

  const existente = await pool.query(
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
    [String(eventoId)]
  );

  return {
    novo: false,
    registro: existente.rows[0] || null
  };
}

// ============================================================
// MARCAR EVENTO COMO PROCESSADO
// ============================================================

async function marcarEventoProcessado(eventoId) {
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
    [String(eventoId)]
  );
}

// ============================================================
// REGISTRAR FALHA PARA PERMITIR NOVA TENTATIVA
// ============================================================

async function registrarErroEvento(eventoId, erro) {
  if (!eventoId) {
    return;
  }

  const mensagem = String(
    erro?.message ||
    erro ||
    'Erro desconhecido ao processar webhook.'
  ).slice(0, MAX_ERRO);

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
      mensagem
    ]
  );
}

// ============================================================
// CONVERTER STATUS DO MERCADO PAGO
// ============================================================

function converterStatus(statusMercadoPago) {
  switch (
    normalizarTexto(statusMercadoPago).toLowerCase()
  ) {
    case 'authorized':
    case 'active':
      return 'ativa';

    case 'pending':
      return 'pendente';

    case 'paused':
      return 'pausada';

    case 'cancelled':
    case 'canceled':
      return 'cancelada';

    /*
     * Não convertemos estados desconhecidos
     * automaticamente para inadimplente.
     *
     * Isso evita bloquear uma assinatura
     * por causa de um status inesperado.
     */

    default:
      return null;
  }
}

// ============================================================
// ATUALIZAR ASSINATURA LOCAL
// ============================================================

async function atualizarAssinatura(
  mercadoPagoId,
  dados
) {
  if (!mercadoPagoId || !dados?.status) {
    return null;
  }

  if (
    !STATUS_ASSINATURA_VALIDOS.has(dados.status)
  ) {
    throw new Error(
      `Status local de assinatura inválido: ${dados.status}`
    );
  }

  const resultado = await pool.query(
    `
    UPDATE assinaturas
    SET
      status = $1,

      inicio_em = COALESCE(
        $2,
        inicio_em
      ),

      proxima_cobranca_em = CASE
        WHEN $3 IS NOT NULL
          THEN $3
        WHEN $1 IN (
          'cancelada',
          'inadimplente'
        )
          THEN NULL
        ELSE proxima_cobranca_em
      END,

      cancelada_em = CASE
        WHEN $4 = TRUE
          THEN COALESCE(
            cancelada_em,
            NOW()
          )
        WHEN $1 <> 'cancelada'
          THEN NULL
        ELSE cancelada_em
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

  return resultado.rows[0] || null;
}

// ============================================================
// SINCRONIZAR ASSINATURA COM O MERCADO PAGO
// ============================================================

async function sincronizarAssinaturaMercadoPago(
  mercadoPagoId
) {
  if (!mercadoPagoId) {
    return null;
  }

  /*
   * Erros na API do Mercado Pago devem propagar
   * para que o evento não seja marcado como concluído.
   */

  const assinaturaMP =
    await buscarAssinatura(mercadoPagoId);

  if (!assinaturaMP) {
    throw new Error(
      'A API do Mercado Pago não retornou a assinatura solicitada.'
    );
  }

  const status = converterStatus(
    assinaturaMP.status
  );

  /*
   * Um estado desconhecido não deve sobrescrever
   * o estado que já está armazenado no banco.
   */

  if (!status) {
    console.warn(
      'Status de assinatura não mapeado:',
      assinaturaMP.status
    );

    return {
      mercadoPago: assinaturaMP,
      banco: null,
      status: null,
      ignorada: true
    };
  }

  /*
   * date_created é a data de criação do recurso,
   * não necessariamente o início de um ciclo pago.
   * Por isso não a usamos automaticamente como
   * início efetivo da assinatura local.
   */

  const proximaCobrancaEm =
    assinaturaMP.next_payment_date || null;

  const banco = await atualizarAssinatura(
    mercadoPagoId,
    {
      status,
      inicio_em: null,
      proxima_cobranca_em: proximaCobrancaEm,
      cancelada: status === 'cancelada'
    }
  );

  return {
    mercadoPago: assinaturaMP,
    banco,
    status
  };
}

// ============================================================
// PROCESSAR EVENTO DE ASSINATURA
// ============================================================

async function processarEventoAssinatura(dataId) {
  const sincronizacao =
    await sincronizarAssinaturaMercadoPago(dataId);

  if (!sincronizacao) {
    return {
      encontrada: false,
      atualizada: null,
      status: null
    };
  }

  if (sincronizacao.ignorada) {
    return {
      encontrada: Boolean(sincronizacao.banco),
      atualizada: sincronizacao.banco,
      status: null,
      ignorada: true
    };
  }

  return {
    encontrada: Boolean(sincronizacao.banco),
    atualizada: sincronizacao.banco,
    status: sincronizacao.status
  };
}

// ============================================================
// EXTRAIR ID DA ASSINATURA DE UMA COBRANÇA
// ============================================================

function obterIdAssinaturaPagamento(pagamento) {
  return (
    pagamento?.preapproval_id ||
    pagamento?.preapproval?.id ||
    pagamento?.subscription_id ||
    null
  );
}

// ============================================================
// EXTRAIR STATUS DA COBRANÇA
// ============================================================

function obterStatusCobranca(pagamento) {
  return {
    statusFatura: normalizarTexto(
      pagamento?.status
    ).toLowerCase(),

    statusResumido: normalizarTexto(
      pagamento?.summarized
    ).toLowerCase(),

    statusPagamento: normalizarTexto(
      pagamento?.payment?.status
    ).toLowerCase()
  };
}

// ============================================================
// PROCESSAR COBRANÇA RECORRENTE
// ============================================================

async function processarCobrancaRecorrente(
  pagamentoId
) {
  const pagamento =
    await buscarPagamentoAutorizado(pagamentoId);

  if (!pagamento) {
    throw new Error(
      'Pagamento recorrente não encontrado no Mercado Pago.'
    );
  }

  const assinaturaMPId =
    obterIdAssinaturaPagamento(pagamento);

  if (!assinaturaMPId) {
    /*
     * Não ativamos nem alteramos assinaturas
     * quando não conseguimos identificar a relação.
     */
    console.warn(
      'Não foi possível identificar a assinatura da cobrança:',
      pagamentoId
    );

    return {
      processado: false,
      status: 'assinatura_nao_identificada',
      pagamento,
      assinatura: null
    };
  }

  const {
    statusFatura,
    statusResumido,
    statusPagamento
  } = obterStatusCobranca(pagamento);

  console.log(
    'Status da cobrança recorrente:',
    {
      pagamento: pagamentoId,
      assinatura: assinaturaMPId,
      fatura: statusFatura,
      resumido: statusResumido,
      pagamento_status: statusPagamento
    }
  );

  // ----------------------------------------------------------
  // PAGAMENTO APROVADO
  // ----------------------------------------------------------

  if (
    statusPagamento === 'approved' ||
    statusPagamento === 'authorized'
  ) {
    /*
     * Uma cobrança aprovada não é prova suficiente
     * de que a assinatura continua autorizada.
     *
     * Consultamos a assinatura no Mercado Pago.
     * Se a consulta falhar, lançamos erro e permitimos
     * que o webhook seja tentado novamente.
     */

    const sincronizacao =
      await sincronizarAssinaturaMercadoPago(
        assinaturaMPId
      );

    if (!sincronizacao?.banco) {
      console.warn(
        'Pagamento aprovado, mas a assinatura não foi sincronizada localmente.',
        {
          pagamento: pagamentoId,
          assinatura: assinaturaMPId
        }
      );

      return {
        processado: false,
        status: 'assinatura_nao_sincronizada',
        pagamento,
        assinatura: null
      };
    }

    return {
      processado: true,
      status: sincronizacao.status,
      pagamento,
      assinatura: sincronizacao.banco
    };
  }

  // ----------------------------------------------------------
  // PAGAMENTO PENDENTE
  // ----------------------------------------------------------

  if (
    statusFatura === 'scheduled' ||
    statusFatura === 'waiting_for_gateway' ||
    statusResumido === 'pending' ||
    statusPagamento === 'pending' ||
    statusPagamento === 'in_process'
  ) {
    /*
     * Não alteramos a assinatura por uma cobrança
     * que ainda está sendo processada.
     */

    return {
      processado: true,
      status: 'aguardando_pagamento',
      pagamento,
      assinatura: null
    };
  }

  // ----------------------------------------------------------
  // NOVAS TENTATIVAS DE COBRANÇA
  // ----------------------------------------------------------

  if (statusFatura === 'recycling') {
    console.warn(
      'Cobrança em nova tentativa pelo Mercado Pago:',
      {
        pagamento: pagamentoId,
        assinatura: assinaturaMPId
      }
    );

    return {
      processado: true,
      status: 'aguardando_nova_tentativa',
      pagamento,
      assinatura: null
    };
  }

  // ----------------------------------------------------------
  // COBRANÇA RECUSADA
  // ----------------------------------------------------------

  if (
    statusPagamento === 'rejected' ||
    statusResumido === 'rejected'
  ) {
    /*
     * Uma cobrança recusada isoladamente não cancela
     * nem torna a assinatura inadimplente.
     *
     * O Mercado Pago pode tentar cobrar novamente.
     * Sincronizamos o estado real da assinatura.
     */

    const sincronizacao =
      await sincronizarAssinaturaMercadoPago(
        assinaturaMPId
      );

    return {
      processado: true,
      status: 'cobranca_recusada',
      pagamento,
      assinatura: sincronizacao?.banco || null
    };
  }

  // ----------------------------------------------------------
  // ESTADO NÃO RECONHECIDO
  // ----------------------------------------------------------

  console.warn(
    'Status de cobrança não tratado:',
    {
      pagamento: pagamentoId,
      assinatura: assinaturaMPId,
      statusFatura,
      statusResumido,
      statusPagamento
    }
  );

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
// ROTA DO WEBHOOK
// ============================================================

/*
 * Esta rota é montada no servidor com:
 *
 * app.use(
 *   '/api/mercado-pago/webhook',
 *   mercadoPagoWebhookRouter
 * );
 *
 * URL final:
 *
 * POST /api/mercado-pago/webhook
 */

router.post('/', async (req, res) => {
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

  const dataId = extrairDataId(req);

  try {
    console.log(
      'Webhook Mercado Pago recebido:',
      {
        evento_id: eventoId,
        tipo,
        action,
        data_id: dataId
      }
    );

    // --------------------------------------------------------
    // VALIDAR ASSINATURA CRIPTOGRÁFICA
    // --------------------------------------------------------

    if (!validarAssinaturaWebhook(req)) {
      console.error(
        'Webhook rejeitado: assinatura inválida.'
      );

      return respostaErro(
        res,
        401,
        'Webhook não autorizado.'
      );
    }

    // --------------------------------------------------------
    // VALIDAR IDENTIFICADOR DO RECURSO
    // --------------------------------------------------------

    if (!dataId) {
      return respostaErro(
        res,
        400,
        'ID do recurso não informado.'
      );
    }

    // --------------------------------------------------------
    // REGISTRAR EVENTO
    // --------------------------------------------------------

    const registro = await registrarEventoWebhook({
      eventoId,
      tipo,
      action,
      dataId
    });

    /*
     * Se o evento já foi concluído anteriormente,
     * não repetimos os efeitos.
     *
     * Eventos anteriores que falharam podem ser
     * tentados novamente.
     */

    if (
      !registro.novo &&
      registro.registro?.processado === true
    ) {
      console.log(
        'Webhook duplicado já processado:',
        eventoId
      );

      return res.status(200).json({
        ok: true,
        duplicado: true,
        processado_anteriormente: true
      });
    }

    if (
      !registro.novo &&
      !registro.registro
    ) {
      throw new Error(
        'Não foi possível consultar o registro do evento.'
      );
    }

    if (
      !registro.novo &&
      registro.registro?.processado === false
    ) {
      console.warn(
        'Evento anterior não concluído. Nova tentativa:',
        {
          evento_id: eventoId,
          erro_anterior: registro.registro.erro
        }
      );
    }

    // --------------------------------------------------------
    // EVENTO DE ASSINATURA
    // --------------------------------------------------------

    if (tipo === 'subscription_preapproval') {
      const resultado =
        await processarEventoAssinatura(dataId);

      /*
       * Uma assinatura ausente localmente não deve
       * ser criada automaticamente pelo webhook.
       */

      if (!resultado.encontrada) {
        console.warn(
          'Assinatura não encontrada no banco local:',
          dataId
        );

        /*
         * Status desconhecido ou recurso ainda não
         * vinculado localmente: registramos a notificação
         * para evitar repetições indefinidas.
         */
        await marcarEventoProcessado(eventoId);

        return res.status(200).json({
          ok: true,
          processado: false,
          motivo:
            'Assinatura não encontrada ou não sincronizada.',
          status: resultado.status || null
        });
      }

      if (resultado.ignorada) {
        /*
         * Status desconhecido não modifica a assinatura.
         * O evento foi recebido e tratado sem alteração.
         */
        await marcarEventoProcessado(eventoId);

        return res.status(200).json({
          ok: true,
          processado: false,
          motivo: 'Status de assinatura não mapeado.'
        });
      }

      await marcarEventoProcessado(eventoId);

      console.log(
        'Assinatura sincronizada:',
        {
          assinatura_id: resultado.atualizada.id,
          mercado_pago_id: dataId,
          status: resultado.atualizada.status
        }
      );

      return res.status(200).json({
        ok: true,
        processado: true,
        tipo,
        action,
        assinatura: resultado.atualizada
      });
    }

    // --------------------------------------------------------
    // EVENTO DE PAGAMENTO RECORRENTE
    // --------------------------------------------------------

    if (tipo === 'subscription_authorized_payment') {
      const resultado =
        await processarCobrancaRecorrente(dataId);

      /*
       * Se a assinatura não foi sincronizada ou o
       * estado não pôde ser tratado, devolvemos erro
       * para que a notificação possa ser reenviada.
       */

      if (!resultado.processado) {
        throw new Error(
          `Cobrança não concluída: ${resultado.status || 'estado desconhecido'}`
        );
      }

      await marcarEventoProcessado(eventoId);

      console.log(
        'Cobrança recorrente tratada:',
        {
          pagamento: dataId,
          status: resultado.status
        }
      );

      return res.status(200).json({
        ok: true,
        processado: true,
        status: resultado.status,
        assinatura: resultado.assinatura || null
      });
    }

    // --------------------------------------------------------
    // EVENTO DE PLANO
    // --------------------------------------------------------

    if (tipo === 'subscription_preapproval_plan') {
      console.log(
        'Evento de plano recebido:',
        dataId
      );

      await marcarEventoProcessado(eventoId);

      return res.status(200).json({
        ok: true,
        processado: false,
        motivo: 'Evento de plano recebido.'
      });
    }

    // --------------------------------------------------------
    // EVENTO NÃO UTILIZADO PELO SISTEMA
    // --------------------------------------------------------

    console.log(
      'Evento Mercado Pago não utilizado:',
      {
        tipo,
        action,
        data_id: dataId
      }
    );

    await marcarEventoProcessado(eventoId);

    return res.status(200).json({
      ok: true,
      ignorado: true,
      tipo,
      action
    });
  } catch (err) {
    console.error(
      'Erro ao processar webhook Mercado Pago:',
      err
    );

    /*
     * Se o evento tem ID, deixamos processado = FALSE
     * para permitir uma nova tentativa.
     */

    try {
      await registrarErroEvento(
        eventoId,
        err
      );
    } catch (erroBanco) {
      console.error(
        'Não foi possível registrar o erro do webhook:',
        erroBanco.message
      );
    }

    return res.status(500).json({
      ok: false,
      erro: 'Erro ao processar webhook.'
    });
  }
});

module.exports = router;