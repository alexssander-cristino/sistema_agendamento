require('dotenv').config();

const MERCADO_PAGO_API =
  'https://api.mercadopago.com';

const ACCESS_TOKEN =
  process.env.MERCADO_PAGO_ACCESS_TOKEN;

async function mercadoPagoRequest(
  endpoint,
  options = {}
) {
  if (!ACCESS_TOKEN) {
    throw new Error(
      'MERCADO_PAGO_ACCESS_TOKEN não configurado.'
    );
  }

  const response = await fetch(
    `${MERCADO_PAGO_API}${endpoint}`,
    {
      ...options,

      headers: {
        Authorization:
          `Bearer ${ACCESS_TOKEN}`,

        'Content-Type':
          'application/json',

        ...(options.headers || {})
      }
    }
  );

  const texto =
    await response.text();

  let data = {};

  try {
    data = texto
      ? JSON.parse(texto)
      : {};
  } catch {
    data = {
      resposta: texto
    };
  }

  if (!response.ok) {
    const erro =
      new Error(
        data?.message ||
        data?.error ||
        `Mercado Pago retornou HTTP ${response.status}.`
      );

    erro.status =
      response.status;

    erro.detalhes =
      data;

    throw erro;
  }

  return data;
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
// CRIAR PLANO
// ============================================================

async function criarPlano({
  nome,
  descricao,
  valor,
  periodo = 'mensal',
  backUrl
}) {
  let frequency = 1;
  let frequencyType = 'months';

  if (periodo === 'anual') {
    frequency = 12;
    frequencyType = 'months';
  }

  if (periodo === 'semanal') {
    frequency = 1;
    frequencyType = 'weeks';
  }

  const body = {
    reason: nome,

    auto_recurring: {
      frequency,
      frequency_type: frequencyType,
      transaction_amount:
        Number(valor),
      currency_id: 'BRL'
    },

    payment_methods_allowed: {
      payment_types: [
        {}
      ],
      payment_methods: [
        {}
      ]
    },

    back_url:
      backUrl ||
      process.env.APP_URL
  };

  return mercadoPagoRequest(
    '/preapproval_plan',
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  );
}


// ============================================================
// BUSCAR PLANO
// ============================================================

async function buscarPlano(
  mercadoPagoPlanId
) {
  return mercadoPagoRequest(
    `/preapproval_plan/${encodeURIComponent(
      mercadoPagoPlanId
    )}`,
    {
      method: 'GET'
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
  empresaId,
  backUrl
}) {
  const body = {
    preapproval_plan_id:
      planoMercadoPagoId,

    reason:
      nome ||
      'Assinatura NexLava',

    external_reference:
      String(empresaId),

    payer_email:
      email,

    back_url:
      backUrl ||
      process.env.APP_URL
  };

  return mercadoPagoRequest(
    '/preapproval',
    {
      method: 'POST',
      body: JSON.stringify(body)
    }
  );
}


// ============================================================
// BUSCAR ASSINATURA
// ============================================================

async function buscarAssinatura(
  mercadoPagoId
) {
  return mercadoPagoRequest(
    `/preapproval/${encodeURIComponent(
      mercadoPagoId
    )}`,
    {
      method: 'GET'
    }
  );
}


// ============================================================
// ATUALIZAR ASSINATURA
// ============================================================

async function atualizarAssinatura(
  mercadoPagoId,
  dados
) {
  return mercadoPagoRequest(
    `/preapproval/${encodeURIComponent(
      mercadoPagoId
    )}`,
    {
      method: 'PUT',
      body: JSON.stringify(dados)
    }
  );
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  mercadoPagoRequest,
  testarConexao,
  criarPlano,
  buscarPlano,
  criarAssinatura,
  buscarAssinatura,
  atualizarAssinatura
};
