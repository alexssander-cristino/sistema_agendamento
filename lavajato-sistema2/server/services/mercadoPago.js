require('dotenv').config();

const MERCADO_PAGO_API =
  'https://api.mercadopago.com';

// ============================================================
// ACCESS TOKEN
// ============================================================

function obterAccessToken() {

  const token =
    process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!token) {
    throw new Error(
      'MERCADO_PAGO_ACCESS_TOKEN não foi configurado.'
    );
  }

  return token;
}

// ============================================================
// REQUEST MERCADO PAGO
// ============================================================

async function mercadoPagoRequest(
  endpoint,
  options = {}
) {

  const token =
    obterAccessToken();

  const response =
    await fetch(
      `${MERCADO_PAGO_API}${endpoint}`,
      {
        ...options,

        headers: {
          'Content-Type':
            'application/json',

          Authorization:
            `Bearer ${token}`,

          ...(options.headers || {})
        }
      }
    );

  let data = null;

  try {

    data =
      await response.json();

  } catch (_) {

    data = null;

  }

  if (!response.ok) {

    console.error(
      'Erro Mercado Pago:',
      {
        status:
          response.status,

        endpoint,

        data
      }
    );

    const mensagem =
      data?.message ||
      data?.error ||
      data?.cause?.[0]?.description ||
      'Erro ao comunicar com o Mercado Pago.';

    const erro =
      new Error(mensagem);

    erro.status =
      response.status;

    erro.data =
      data;

    throw erro;
  }

  return data;
}

// ============================================================
// FREQUÊNCIA DO PLANO
// ============================================================

function obterRecorrencia(
  periodo
) {

  switch (periodo) {

    case 'mensal':

      return {
        frequency: 1,
        frequency_type: 'months'
      };

    case 'trimestral':

      return {
        frequency: 3,
        frequency_type: 'months'
      };

    case 'semestral':

      return {
        frequency: 6,
        frequency_type: 'months'
      };

    case 'anual':

      return {
        frequency: 12,
        frequency_type: 'months'
      };

    default:

      throw new Error(
        'Período de plano inválido.'
      );
  }
}

// ============================================================
// CRIAR PLANO
// ============================================================

async function criarPlano({
  nome,
  descricao,
  valor,
  periodo = 'mensal',
  backUrl
}) {

  if (!nome) {

    throw new Error(
      'Nome do plano é obrigatório.'
    );

  }

  if (
    valor === undefined ||
    valor === null ||
    Number(valor) <= 0
  ) {

    throw new Error(
      'Valor do plano deve ser maior que zero.'
    );

  }

  const recorrencia =
    obterRecorrencia(
      periodo
    );

  const body = {

    reason:
      String(nome).trim(),

    auto_recurring: {

      frequency:
        recorrencia.frequency,

      frequency_type:
        recorrencia.frequency_type,

      transaction_amount:
        Number(valor),

      currency_id:
        'BRL'
    }
  };

  if (backUrl) {

    body.back_url =
      backUrl;

  }

  return mercadoPagoRequest(
    '/preapproval_plan',
    {
      method: 'POST',

      body:
        JSON.stringify(body)
    }
  );
}

// ============================================================
// BUSCAR PLANO
// ============================================================

async function buscarPlano(
  mercadoPagoPlanId
) {

  if (!mercadoPagoPlanId) {

    throw new Error(
      'ID do plano Mercado Pago não informado.'
    );

  }

  return mercadoPagoRequest(
    `/preapproval_plan/${encodeURIComponent(
      mercadoPagoPlanId
    )}`
  );
}

// ============================================================
// ATUALIZAR PLANO
// ============================================================

async function atualizarPlano({
  mercadoPagoPlanId,
  nome,
  descricao,
  valor,
  periodo = 'mensal',
  backUrl
}) {

  if (!mercadoPagoPlanId) {

    throw new Error(
      'ID do plano Mercado Pago não informado.'
    );

  }

  if (!nome) {

    throw new Error(
      'Nome do plano é obrigatório.'
    );

  }

  if (
    valor === undefined ||
    valor === null ||
    Number(valor) <= 0
  ) {

    throw new Error(
      'Valor do plano deve ser maior que zero.'
    );

  }

  const recorrencia =
    obterRecorrencia(
      periodo
    );

  const body = {

    reason:
      String(nome).trim(),

    auto_recurring: {

      frequency:
        recorrencia.frequency,

      frequency_type:
        recorrencia.frequency_type,

      transaction_amount:
        Number(valor),

      currency_id:
        'BRL'
    }
  };

  if (backUrl) {

    body.back_url =
      backUrl;

  }

  /*
   * descricao é armazenada
   * no Orvix.
   *
   * O Mercado Pago não utiliza
   * esse campo como descrição
   * principal do plano.
   */

  return mercadoPagoRequest(
    `/preapproval_plan/${encodeURIComponent(
      mercadoPagoPlanId
    )}`,
    {
      method: 'PUT',

      body:
        JSON.stringify(body)
    }
  );
}

// ============================================================
// CRIAR ASSINATURA
// ============================================================

async function criarAssinatura({
  planoMercadoPagoId,
  email,
  nome,
  cardTokenId,
  backUrl,
  externalReference
}) {

  if (!planoMercadoPagoId) {

    throw new Error(
      'ID do plano Mercado Pago é obrigatório.'
    );

  }

  if (!email) {

    throw new Error(
      'E-mail do assinante é obrigatório.'
    );

  }

  if (!cardTokenId) {

    throw new Error(
      'Token do cartão é obrigatório.'
    );

  }

  const body = {

    preapproval_plan_id:
      String(planoMercadoPagoId),

    payer_email:
      String(email).trim(),

    reason:
      nome ||
      'Assinatura Orvix',

    card_token_id:
      cardTokenId,

    status:
      'authorized'
  };

  if (externalReference) {

    body.external_reference =
      String(
        externalReference
      );

  }

  if (backUrl) {

    body.back_url =
      backUrl;

  }

  return mercadoPagoRequest(
    '/preapproval',
    {
      method: 'POST',

      body:
        JSON.stringify(body)
    }
  );
}

// ============================================================
// BUSCAR ASSINATURA
// ============================================================

async function buscarAssinatura(
  mercadoPagoId
) {

  if (!mercadoPagoId) {

    throw new Error(
      'ID da assinatura Mercado Pago não informado.'
    );

  }

  return mercadoPagoRequest(
    `/preapproval/${encodeURIComponent(
      mercadoPagoId
    )}`
  );
}

// ============================================================
// ATUALIZAR ASSINATURA
//
// status possíveis utilizados pelo Orvix:
//
// authorized = ativa
// paused     = pausada
// canceled   = cancelada
// ============================================================

async function atualizarAssinatura({
  mercadoPagoId,
  status
}) {

  if (!mercadoPagoId) {

    throw new Error(
      'ID da assinatura Mercado Pago não informado.'
    );

  }

  const statusPermitidos = [
    'authorized',
    'paused',
    'canceled'
  ];

  if (
    !statusPermitidos.includes(
      status
    )
  ) {

    throw new Error(
      'Status de assinatura Mercado Pago inválido.'
    );

  }

  return mercadoPagoRequest(
    `/preapproval/${encodeURIComponent(
      mercadoPagoId
    )}`,
    {
      method: 'PUT',

      body:
        JSON.stringify({
          status
        })
    }
  );
}


// ============================================================
// ALTERAR VALOR DE UMA ASSINATURA EXISTENTE
// ============================================================

async function atualizarValorAssinatura({
  mercadoPagoId,
  valor
}) {
  if (!mercadoPagoId) {
    throw new Error(
      'ID da assinatura Mercado Pago não informado.'
    );
  }

  const novoValor = Number(valor);

  if (!Number.isFinite(novoValor) || novoValor <= 0) {
    throw new Error(
      'O valor da assinatura deve ser maior que zero.'
    );
  }

  return mercadoPagoRequest(
    `/preapproval/${encodeURIComponent(mercadoPagoId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        auto_recurring: {
          transaction_amount: novoValor,
          currency_id: 'BRL'
        }
      })
    }
  );
}

// ============================================================
// BUSCAR PAGAMENTO AUTORIZADO
// ============================================================

async function buscarPagamentoAutorizado(
  pagamentoId
) {

  if (!pagamentoId) {

    throw new Error(
      'ID do pagamento não informado.'
    );

  }

  return mercadoPagoRequest(
    `/authorized_payments/${encodeURIComponent(
      pagamentoId
    )}`
  );
}

// ============================================================
// TESTAR CONEXÃO
// ============================================================

async function testarConexao() {

  return mercadoPagoRequest(
    '/v1/payment_methods',
    {
      method: 'GET'
    }
  );
}

// ============================================================
// CRIAR NOVA ASSINATURA COM AUTORIZAÇÃO PELO CHECKOUT
// Usada quando a empresa muda a periodicidade do plano.
// Não cancela a assinatura anterior.
// ============================================================

async function criarAssinaturaPendente({
  planoMercadoPagoId,
  email,
  nome,
  backUrl,
  externalReference
}) {
  if (!planoMercadoPagoId) {
    throw new Error(
      'ID do plano Mercado Pago é obrigatório.'
    );
  }

  if (!email) {
    throw new Error(
      'E-mail do assinante é obrigatório.'
    );
  }

  if (!backUrl) {
    throw new Error(
      'APP_URL precisa estar configurada para autorizar a assinatura.'
    );
  }

  const body = {
    preapproval_plan_id: String(planoMercadoPagoId),
    payer_email: String(email).trim(),
    reason: nome || 'Assinatura Orvix',
    external_reference: String(externalReference),
    back_url: backUrl,
    status: 'pending'
  };

  return mercadoPagoRequest('/preapproval', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {

  mercadoPagoRequest,

  testarConexao,

  criarPlano,
  buscarPlano,
  atualizarPlano,

  criarAssinatura,
  criarAssinaturaPendente,
  buscarAssinatura,
  atualizarAssinatura,
  atualizarValorAssinatura,

  buscarPagamentoAutorizado

};