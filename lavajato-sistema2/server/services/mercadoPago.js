require('dotenv').config();

const MERCADO_PAGO_API =
  'https://api.mercadopago.com';


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


/**
 * Faz uma requisição para a API do Mercado Pago.
 */
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


/**
 * Cria um plano recorrente
 * no Mercado Pago.
 */
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


  let frequency = 1;

  let frequencyType = 'months';


  if (
    periodo === 'mensal'
  ) {

    frequency = 1;

    frequencyType = 'months';

  }


  else if (
    periodo === 'trimestral'
  ) {

    frequency = 3;

    frequencyType = 'months';

  }


  else if (
    periodo === 'semestral'
  ) {

    frequency = 6;

    frequencyType = 'months';

  }


  else if (
    periodo === 'anual'
  ) {

    frequency = 12;

    frequencyType = 'months';

  }


  else {

    throw new Error(
      'Período de plano inválido.'
    );

  }


  const body = {

    reason : nome,

    auto_recurring: {

      frequency,

      frequency_type:
        frequencyType,

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


/**
 * Busca um plano no Mercado Pago.
 */
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


/**
 * Cria uma assinatura no Mercado Pago.
 */
async function criarAssinatura({
  planoMercadoPagoId,
  email,
  nome,
  backUrl
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


  const body = {

    preapproval_plan_id:
      planoMercadoPagoId,

    payer_email:
      email,

    reason:
      nome ||
      'Assinatura NexLava',

    status:
      'pending'

  };


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


/**
 * Busca uma assinatura no Mercado Pago.
 */
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


/**
 * Busca um pagamento autorizado
 * de uma assinatura.
 */
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

/**
 * Testa a comunicação com o Mercado Pago.
 */
async function testarConexao() {

  return mercadoPagoRequest(
    '/v1/payment_methods',
    {
      method: 'GET'
    }
  );

}

module.exports = {

  mercadoPagoRequest,
  testarConexao,

  criarPlano,

  buscarPlano,

  criarAssinatura,

  buscarAssinatura,

  buscarPagamentoAutorizado

};

