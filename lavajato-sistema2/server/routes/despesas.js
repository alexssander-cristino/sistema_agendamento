
const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');
const { criarNotificacao } = require('../services/notificacoes');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);

const STATUS_PAGAMENTO_VALIDOS = [
  'pendente',
  'pago',
  'cancelado'
];

const TAMANHO_MAXIMO_DESCRICAO = 200;
const TAMANHO_MAXIMO_CATEGORIA = 100;
const TAMANHO_MAXIMO_OBSERVACOES = 2000;

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function obterEmpresaId(req) {
  return req.usuario?.empresa_id || null;
}

function validarId(id) {
  return /^\d+$/.test(String(id)) && Number(id) > 0;
}

function validarData(data) {
  if (typeof data !== 'string') {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return false;
  }

  const [ano, mes, dia] = data.split('-').map(Number);
  const dataValidada = new Date(Date.UTC(ano, mes - 1, dia));

  return (
    dataValidada.getUTCFullYear() === ano &&
    dataValidada.getUTCMonth() === mes - 1 &&
    dataValidada.getUTCDate() === dia
  );
}

function validarTexto(valor, tamanhoMaximo, obrigatorio = false) {
  if (valor == null) {
    return !obrigatorio;
  }

  if (typeof valor !== 'string') {
    return false;
  }

  const texto = valor.trim();

  if (obrigatorio && texto.length === 0) {
    return false;
  }

  return texto.length <= tamanhoMaximo;
}

function validarValor(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === '' ||
    typeof valor === 'boolean'
  ) {
    return false;
  }

  const numero = Number(valor);

  return (
    Number.isFinite(numero) &&
    numero >= 0 &&
    numero <= 999999999999.99
  );
}

function normalizarValor(valor) {
  return Number(Number(valor).toFixed(2));
}

function validarStatusPagamento(status) {
  return (
    typeof status === 'string' &&
    STATUS_PAGAMENTO_VALIDOS.includes(status)
  );
}

function validarObservacoes(observacoes) {
  return (
    observacoes == null ||
    (
      typeof observacoes === 'string' &&
      observacoes.length <= TAMANHO_MAXIMO_OBSERVACOES
    )
  );
}

function normalizarTexto(valor) {
  if (typeof valor !== 'string') {
    return null;
  }

  const texto = valor.trim();

  return texto.length > 0 ? texto : null;
}

function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ============================================================
// GET /api/despesas
// Lista despesas da empresa autenticada.
//
// Filtros opcionais:
// ?de=2026-10-01&ate=2026-10-31
// ?status_pagamento=pendente
// ============================================================

router.get('/', async (req, res) => {
  const empresaId = obterEmpresaId(req);

  const { de, ate, status_pagamento } = req.query;

  if (!empresaId) {
    return res.status(400).json({
      erro: 'Não foi possível identificar a empresa.'
    });
  }

  if ((de && !ate) || (!de && ate)) {
    return res.status(400).json({
      erro: 'Informe as datas inicial e final.'
    });
  }

  if (de && (!validarData(de) || !validarData(ate))) {
    return res.status(400).json({
      erro: 'Informe um intervalo de datas válido.'
    });
  }

  if (de && ate && de > ate) {
    return res.status(400).json({
      erro: 'A data inicial não pode ser posterior à data final.'
    });
  }

  if (
    status_pagamento !== undefined &&
    !validarStatusPagamento(status_pagamento)
  ) {
    return res.status(400).json({
      erro: 'Status de pagamento inválido.'
    });
  }

  try {
    const condicoes = ['empresa_id = $1'];
    const parametros = [empresaId];

    if (de && ate) {
      parametros.push(de);
      condicoes.push(`data >= $${parametros.length}`);

      parametros.push(ate);
      condicoes.push(`data <= $${parametros.length}`);
    }

    if (status_pagamento) {
      parametros.push(status_pagamento);
      condicoes.push(
        `status_pagamento = $${parametros.length}`
      );
    }

    const consulta = `
      SELECT *
      FROM despesas
      WHERE ${condicoes.join(' AND ')}
      ORDER BY data DESC, id DESC
    `;

    const { rows } = await pool.query(consulta, parametros);

    return res.json(rows);
  } catch (err) {
    console.error('Erro ao carregar despesas:', err);

    return res.status(500).json({
      erro: 'Não foi possível carregar as despesas.'
    });
  }
});

// ============================================================
// POST /api/despesas
// Registra uma despesa e cria uma notificação.
// ============================================================

router.post('/', async (req, res) => {
  const empresaId = obterEmpresaId(req);

  if (!empresaId) {
    return res.status(400).json({
      erro: 'Não foi possível identificar a empresa.'
    });
  }

  const {
    descricao,
    categoria,
    valor,
    data,
    observacoes,
    status_pagamento
  } = req.body || {};

  if (
    !validarTexto(
      descricao,
      TAMANHO_MAXIMO_DESCRICAO,
      true
    ) ||
    !validarValor(valor) ||
    !validarData(data)
  ) {
    return res.status(400).json({
      erro:
        'Informe uma descrição válida, um valor não negativo ' +
        'e uma data válida.'
    });
  }

  if (
    categoria != null &&
    !validarTexto(categoria, TAMANHO_MAXIMO_CATEGORIA)
  ) {
    return res.status(400).json({
      erro: 'A categoria informada é inválida.'
    });
  }

  if (!validarObservacoes(observacoes)) {
    return res.status(400).json({
      erro: 'As observações excedem o limite permitido.'
    });
  }

  const statusFinal = status_pagamento || 'pendente';

  if (!validarStatusPagamento(statusFinal)) {
    return res.status(400).json({
      erro: 'Status de pagamento inválido.'
    });
  }

  const valorFinal = normalizarValor(valor);

  /*
   * Se a despesa for registrada como paga, a data informada
   * será utilizada como data de pagamento inicial.
   *
   * Para despesas pendentes ou canceladas, a data_pagamento
   * fica nula.
   */
  const dataPagamento =
    statusFinal === 'pago' ? data : null;

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO despesas (
        empresa_id,
        descricao,
        categoria,
        valor,
        data,
        observacoes,
        status_pagamento,
        data_pagamento
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        empresaId,
        descricao.trim(),
        normalizarTexto(categoria) || 'Outros',
        valorFinal,
        data,
        normalizarTexto(observacoes),
        statusFinal,
        dataPagamento
      ]
    );

    const despesa = rows[0];

    // A falha na notificação não desfaz o cadastro da despesa.
    try {
      await criarNotificacao({
        empresaId,
        tipo: 'financeiro',
        titulo: 'Nova despesa registrada',
        mensagem:
          `A despesa "${despesa.descricao}" foi registrada ` +
          `no valor de R$ ${formatarMoeda(despesa.valor)}.`,
        link: '/'
      });
    } catch (erroNotificacao) {
      console.error(
        'Erro ao criar notificação da despesa:',
        erroNotificacao
      );
    }

    return res.status(201).json(despesa);
  } catch (err) {
    console.error('Erro ao criar despesa:', err);

    return res.status(500).json({
      erro: 'Não foi possível criar a despesa.'
    });
  }
});

// ============================================================
// PUT /api/despesas/:id
// Atualiza uma despesa pertencente à empresa autenticada.
//
// O status e a data de pagamento são opcionais.
// Se não forem enviados, o status atual é preservado.
// ============================================================

router.put('/:id', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const { id } = req.params;

  if (!empresaId) {
    return res.status(400).json({
      erro: 'Não foi possível identificar a empresa.'
    });
  }

  if (!validarId(id)) {
    return res.status(400).json({
      erro: 'Identificador de despesa inválido.'
    });
  }

  const {
    descricao,
    categoria,
    valor,
    data,
    observacoes,
    status_pagamento,
    data_pagamento
  } = req.body || {};

  if (
    !validarTexto(
      descricao,
      TAMANHO_MAXIMO_DESCRICAO,
      true
    ) ||
    !validarValor(valor) ||
    !validarData(data)
  ) {
    return res.status(400).json({
      erro:
        'Informe uma descrição válida, um valor não negativo ' +
        'e uma data válida.'
    });
  }

  if (
    categoria != null &&
    !validarTexto(categoria, TAMANHO_MAXIMO_CATEGORIA)
  ) {
    return res.status(400).json({
      erro: 'A categoria informada é inválida.'
    });
  }

  if (!validarObservacoes(observacoes)) {
    return res.status(400).json({
      erro: 'As observações excedem o limite permitido.'
    });
  }

  if (
    status_pagamento !== undefined &&
    !validarStatusPagamento(status_pagamento)
  ) {
    return res.status(400).json({
      erro: 'Status de pagamento inválido.'
    });
  }

  if (
    data_pagamento !== undefined &&
    data_pagamento !== null &&
    data_pagamento !== '' &&
    !validarData(data_pagamento)
  ) {
    return res.status(400).json({
      erro: 'A data de pagamento informada é inválida.'
    });
  }

  try {
    /*
     * Busca o estado atual dentro da empresa antes de determinar
     * a data de pagamento. O UPDATE também é limitado por empresa_id.
     */
    const atualResult = await pool.query(
      `
      SELECT *
      FROM despesas
      WHERE id = $1
        AND empresa_id = $2
      LIMIT 1
      `,
      [id, empresaId]
    );

    if (atualResult.rows.length === 0) {
      return res.status(404).json({
        erro: 'Despesa não encontrada.'
      });
    }

    const atual = atualResult.rows[0];

    const novoStatus =
      status_pagamento !== undefined
        ? status_pagamento
        : atual.status_pagamento || 'pendente';

    let novaDataPagamento;

    if (data_pagamento !== undefined) {
      novaDataPagamento =
        data_pagamento === '' ? null : data_pagamento;
    } else if (status_pagamento !== undefined) {
      if (novoStatus === 'pago') {
        novaDataPagamento =
          atual.data_pagamento || data;
      } else {
        novaDataPagamento = null;
      }
    } else {
      novaDataPagamento = atual.data_pagamento || null;
    }

    if (novoStatus === 'pago' && !novaDataPagamento) {
      novaDataPagamento = data;
    }

    if (novoStatus !== 'pago') {
      novaDataPagamento = null;
    }

    const { rows } = await pool.query(
      `
      UPDATE despesas
      SET
        descricao = $1,
        categoria = $2,
        valor = $3,
        data = $4,
        observacoes = $5,
        status_pagamento = $6,
        data_pagamento = $7
      WHERE id = $8
        AND empresa_id = $9
      RETURNING *
      `,
      [
        descricao.trim(),
        normalizarTexto(categoria) || 'Outros',
        normalizarValor(valor),
        data,
        normalizarTexto(observacoes),
        novoStatus,
        novaDataPagamento,
        id,
        empresaId
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Despesa não encontrada.'
      });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar despesa:', err);

    return res.status(500).json({
      erro: 'Não foi possível atualizar a despesa.'
    });
  }
});

// ============================================================
// PATCH /api/despesas/:id/pagamento
// Atualiza somente o status de pagamento e a data correspondente.
// ============================================================

router.patch('/:id/pagamento', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const { id } = req.params;

  const {
    status_pagamento,
    data_pagamento
  } = req.body || {};

  if (!empresaId) {
    return res.status(400).json({
      erro: 'Não foi possível identificar a empresa.'
    });
  }

  if (!validarId(id)) {
    return res.status(400).json({
      erro: 'Identificador de despesa inválido.'
    });
  }

  if (!validarStatusPagamento(status_pagamento)) {
    return res.status(400).json({
      erro: 'Informe um status de pagamento válido.'
    });
  }

  if (
    data_pagamento !== undefined &&
    data_pagamento !== null &&
    data_pagamento !== '' &&
    !validarData(data_pagamento)
  ) {
    return res.status(400).json({
      erro: 'A data de pagamento informada é inválida.'
    });
  }

  try {
    const atualResult = await pool.query(
      `
      SELECT id, data, data_pagamento
      FROM despesas
      WHERE id = $1
        AND empresa_id = $2
      LIMIT 1
      `,
      [id, empresaId]
    );

    if (atualResult.rows.length === 0) {
      return res.status(404).json({
        erro: 'Despesa não encontrada.'
      });
    }

    const atual = atualResult.rows[0];

    let dataFinal = null;

    if (status_pagamento === 'pago') {
      dataFinal =
        data_pagamento ||
        atual.data_pagamento ||
        atual.data;
    }

    const { rows } = await pool.query(
      `
      UPDATE despesas
      SET
        status_pagamento = $1,
        data_pagamento = $2
      WHERE id = $3
        AND empresa_id = $4
      RETURNING *
      `,
      [
        status_pagamento,
        dataFinal,
        id,
        empresaId
      ]
    );

    return res.json(rows[0]);
  } catch (err) {
    console.error(
      'Erro ao atualizar pagamento da despesa:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível atualizar o pagamento da despesa.'
    });
  }
});

// ============================================================
// DELETE /api/despesas/:id
// Remove uma despesa da empresa autenticada.
// ============================================================

router.delete('/:id', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const { id } = req.params;

  if (!empresaId) {
    return res.status(400).json({
      erro: 'Não foi possível identificar a empresa.'
    });
  }

  if (!validarId(id)) {
    return res.status(400).json({
      erro: 'Identificador de despesa inválido.'
    });
  }

  try {
    const resultado = await pool.query(
      `
      DELETE FROM despesas
      WHERE id = $1
        AND empresa_id = $2
      `,
      [id, empresaId]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        erro: 'Despesa não encontrada.'
      });
    }

    return res.status(204).end();
  } catch (err) {
    console.error('Erro ao remover despesa:', err);

    return res.status(500).json({
      erro: 'Não foi possível remover a despesa.'
    });
  }
});

module.exports = router;
