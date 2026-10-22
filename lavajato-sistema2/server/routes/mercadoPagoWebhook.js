const express = require('express');
const crypto = require('crypto');

const pool = require('../db');

const {
  buscarAssinatura,
  buscarPagamentoAutorizado
} = require('../services/mercadoPago');

const {
  enviarParaDesenvolvedores
} = require('../services/firebaseNotific');

const router = express.Router();

const WEBHOOK_SECRET =
  process.env.MERCADO_PAGO_WEBHOOK_SECRET;

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
// NOTIFICAR DESENVOLVEDORES
// ============================================================

async function notificarDev({
  titulo,
  corpo,
  link = '/admin/logs'
}) {
  try {
    await enviarParaDesenvolvedores({
      titulo,
      corpo,
      link
    });

    console.log('[ORVIX DEV PUSH] Notificação enviada:', {
      titulo,
      link
    });

    return true;
  } catch (erro) {
    /*
     * Uma falha no push não deve impedir a confirmação
     * do processamento financeiro pelo webhook.
     */
    console.error(
      '[ORVIX DEV PUSH] Falha ao enviar notificação:',
      erro?.message || erro
    );

    return false;
  }
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

  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];
  const dataId = extrairDataId(req);

  if (!xSignature || !xRequestId || !dataId) {
    console.error(
      'Webhook sem cabeçalhos ou identificadores necessários.'
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

    const chave = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();

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

  const dataIdNormalizado =
    String(dataId).toLowerCase();

  const manifest =
    `id:${dataIdNormalizado};` +
    `request-id:${xRequestId};` +
    `ts:${timestamp};`;

  const assinaturaCalculada = crypto
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
// REGISTRAR EVENTO E EVITAR REPROCESSAMENTO
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
    RETURNING id, evento_id, processado, erro
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
    SELECT id, evento_id, processado, erro
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
// REGISTRAR ERRO PARA NOVA TENTATIVA
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
    [String(eventoId), mensagem]
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

    default:
      return null;
  }
}

// ============================================================
// NOTIFICAR MUDANÇA REAL DE STATUS DA ASSINATURA
// ============================================================

async function notificarMudancaAssinatura(
  assinatura,
  statusAnterior,
  statusAtual
) {
  if (!assinatura || !statusAtual) {
    return;
  }

  if (statusAnterior === statusAtual) {
    return;
  }

  const identificador =
    assinatura.id || assinatura.mercado_pago_id || 'N/D';

  const notificacoes = {
    ativa: {
      titulo: 'Orvix — Assinatura ativada',
      corpo:
        `A assinatura ${identificador} foi ativada.`,
      link: '/admin/logs'
    },

    pendente: {
      titulo: 'Orvix — Assinatura pendente',
      corpo:
        `A assinatura ${identificador} está pendente.`,
      link: '/admin/logs'
    },

    pausada: {
      titulo: 'Orvix — Assinatura pausada',
      corpo:
        `A assinatura ${identificador} foi pausada.`,
      link: '/admin/logs'
    },

    cancelada: {
      titulo: 'Orvix — Assinatura cancelada',
      corpo:
        `A assinatura ${identificador} foi cancelada.`,
      link: '/admin/logs'
    },

    inadimplente: {
      titulo: 'Orvix — Assinatura inadimplente',
      corpo:
        `A assinatura ${identificador} está inadimplente.`,
      link: '/admin/logs'
    }
  };

  const notificacao = notificacoes[statusAtual];

  if (!notificacao) {
    return;
  }

  await notificarDev(notificacao);
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

  if (!STATUS_ASSINATURA_VALIDOS.has(dados.status)) {
    throw new Error(
      `Status local de assinatura inválido: ${dados.status}`
    );
  }

  /*
   * Consultamos o estado anterior para identificar
   * transições reais de status.
   */
  const anteriorResultado = await pool.query(
    `
    SELECT
      id,
      empresa_id,
      plano_id,
      status,
      mercado_pago_id
    FROM assinaturas
    WHERE mercado_pago_id = $1
    LIMIT 1
    `,
    [String(mercadoPagoId)]
  );

  const anterior = anteriorResultado.rows[0] || null;

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
          THEN COALESCE(cancelada_em, NOW())
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

  const atualizada = resultado.rows[0] || null;

  if (!atualizada) {
    return null;
  }

  atualizada.status_anterior =
    anterior?.status || null;

  atualizada.status_alterado =
    anterior?.status !== atualizada.status;

  return atualizada;
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

  /*
   * Só notificamos quando o estado realmente muda.
   * A falha de envio do push não interrompe o webhook.
   */
  if (banco?.status_alterado) {
    await notificarMudancaAssinatura(
      banco,
      banco.status_anterior,
      banco.status
    );
  }

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
      encontrada: false,
      atualizada: null,
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

    const valor =
      pagamento?.transaction_amount ??
      pagamento?.amount ??
      null;

    const moeda =
      pagamento?.currency_id || 'BRL';

    const valorTexto =
      valor !== null
        ? ` Valor: ${valor} ${moeda}.`
        : '';

    /*
     * A notificação indica pagamento confirmado.
     * Não afirmamos que é uma renovação se o webhook
     * não permitir distinguir a primeira cobrança.
     */
    await notificarDev({
      titulo: 'Orvix — Pagamento confirmado',
      corpo:
        `Pagamento ${pagamentoId} aprovado para a assinatura ${sincronizacao.banco.id}.` +
        valorTexto,
      link: '/admin/logs'
    });

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
    const sincronizacao =
      await sincronizarAssinaturaMercadoPago(
        assinaturaMPId
      );

    await notificarDev({
      titulo: 'Orvix — Cobrança recusada',
      corpo:
        `A cobrança ${pagamentoId} da assinatura ${assinaturaMPId} foi recusada.`,
      link: '/admin/logs'
    });

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

router.post('/', async (req, res) => {
  const eventoId =
    req.body?.id ||
    req.body?.event_id ||
    null;

  const tipo = req.body?.type || null;
  const action = req.body?.action || null;
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

    if (!registro.novo && !registro.registro) {
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

      if (!resultado.encontrada) {
        console.warn(
          'Assinatura não encontrada ou não sincronizada:',
          dataId
        );

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
    // EVENTO NÃO UTILIZADO
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

    try {
      await registrarErroEvento(eventoId, err);
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
