const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');
const { criarNotificacao } = require('../services/notificacoes');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);

// ============================================================
// CONSULTAS BASE
// ============================================================

const SELECT_BASE = `
  SELECT
    a.*,
    s.nome AS servico_nome,
    s.duracao_min AS duracao_min
  FROM agendamentos a
  LEFT JOIN servicos s
    ON s.id = a.servico_id
   AND s.empresa_id = a.empresa_id
`;

// ============================================================
// HELPERS
// ============================================================

function obterEmpresaId(req) {
  return req.usuario?.empresa_id ?? null;
}

function validarId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizarTexto(valor) {
  if (valor === undefined || valor === null) {
    return '';
  }

  return String(valor).trim();
}

function validarData(valor) {
  if (typeof valor !== 'string') {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }

  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

function validarHora(valor) {
  return (
    typeof valor === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(valor)
  );
}

function minutosDaHora(hora) {
  const partes = String(hora).split(':');

  return (
    Number(partes[0]) * 60 +
    Number(partes[1])
  );
}

function validarValor(valor) {
  if (valor === undefined || valor === null || valor === '') {
    return null;
  }

  const numero = Number(valor);

  if (!Number.isFinite(numero) || numero < 0) {
    return null;
  }

  return numero;
}

// ============================================================
// STATUS DO AGENDAMENTO
// ============================================================

/**
 * O banco aceita somente:
 * agendado, em_andamento, concluido e cancelado.
 *
 * Compatibilidade:
 * "confirmado" é convertido para "agendado".
 *
 * Isso evita a violação da restrição
 * agendamentos_status_check no PostgreSQL.
 */
function normalizarStatusAgendamento(status) {
  const valor = String(status ?? '')
    .trim()
    .toLowerCase();

  const equivalencias = {
    confirmado: 'agendado'
  };

  return equivalencias[valor] || valor;
}

function validarStatus(status) {
  if (status === undefined || status === null || status === '') {
    return true;
  }

  const permitidos = [
    'agendado',
    'em_andamento',
    'concluido',
    'cancelado'
  ];

  return permitidos.includes(
    normalizarStatusAgendamento(status)
  );
}

// ============================================================
// STATUS DO PAGAMENTO
// ============================================================

function validarStatusPagamento(status) {
  const permitidos = [
    'pendente',
    'pago',
    'parcial',
    'cancelado'
  ];

  if (status === undefined || status === null || status === '') {
    return true;
  }

  return permitidos.includes(
    String(status).trim().toLowerCase()
  );
}

// ============================================================
// VALIDAÇÃO DE CAMPOS
// ============================================================

function validarTamanho(valor, maximo) {
  return (
    valor === undefined ||
    valor === null ||
    String(valor).length <= maximo
  );
}

function validarCamposTexto(body) {
  const limites = {
    cliente: 150,
    telefone: 30,
    veiculo: 100,
    placa: 20,
    observacoes: 1000,
    forma_pagamento: 50
  };

  for (const [campo, limite] of Object.entries(limites)) {
    if (!validarTamanho(body[campo], limite)) {
      return `O campo "${campo}" excede o limite de ${limite} caracteres.`;
    }
  }

  return null;
}

// ============================================================
// CLIENTES
// ============================================================

async function resolverCliente({
  clienteId,
  cliente,
  telefone,
  empresaId
}) {
  if (
    clienteId !== undefined &&
    clienteId !== null &&
    clienteId !== ''
  ) {
    const id = validarId(clienteId);

    if (!id) {
      throw new Error('Cliente inválido.');
    }

    const resultado = await pool.query(
      `
        SELECT id, nome, telefone
        FROM clientes
        WHERE id = $1
          AND empresa_id = $2
        LIMIT 1
      `,
      [id, empresaId]
    );

    if (!resultado.rows.length) {
      throw new Error('Cliente não encontrado.');
    }

    const encontrado = resultado.rows[0];

    return {
      cliente_id: encontrado.id,
      cliente: encontrado.nome,
      telefone: telefone !== undefined
        ? normalizarTexto(telefone)
        : encontrado.telefone || ''
    };
  }

  const nome = normalizarTexto(cliente);

  if (!nome) {
    throw new Error('Informe o nome do cliente.');
  }

  return {
    cliente_id: null,
    cliente: nome,
    telefone: normalizarTexto(telefone)
  };
}

// ============================================================
// SERVIÇOS
// ============================================================

async function validarServico(servicoId, empresaId) {
  const id = validarId(servicoId);

  if (!id) {
    throw new Error('Serviço inválido.');
  }

  const resultado = await pool.query(
    `
      SELECT id, nome, preco, duracao_min
      FROM servicos
      WHERE id = $1
        AND empresa_id = $2
        AND ativo = TRUE
      LIMIT 1
    `,
    [id, empresaId]
  );

  if (!resultado.rows.length) {
    throw new Error('Serviço não encontrado ou inativo.');
  }

  const servico = resultado.rows[0];
  const duracao = Number(servico.duracao_min);

  return {
    ...servico,
    duracao_min:
      Number.isFinite(duracao) && duracao > 0
        ? duracao
        : 30
  };
}

// ============================================================
// VERIFICAÇÃO DE CONFLITOS POR DURAÇÃO
// ============================================================

async function buscarConflitoHorario({
  empresaId,
  data,
  hora,
  servicoId,
  ignorarId = null
}) {
  const servicoNovo = await validarServico(
    servicoId,
    empresaId
  );

  const inicioNovo = minutosDaHora(hora);
  const fimNovo = inicioNovo + servicoNovo.duracao_min;

  // Não permite que o serviço ultrapasse o fim do dia.
  if (fimNovo > 24 * 60) {
    return {
      erro: 'DURACAO_EXCEDE_DIA',
      mensagem:
        'O serviço termina depois da meia-noite. Escolha outro horário.'
    };
  }

  const resultado = await pool.query(
    `
      SELECT
        a.id,
        a.cliente,
        a.telefone,
        a.data,
        a.hora,
        a.servico_id,
        a.status,
        s.nome AS servico_nome,
        COALESCE(
          NULLIF(s.duracao_min, 0),
          30
        ) AS duracao_min
      FROM agendamentos a
      LEFT JOIN servicos s
        ON s.id = a.servico_id
       AND s.empresa_id = a.empresa_id
      WHERE a.empresa_id = $1
        AND a.data = $2
        AND LOWER(COALESCE(a.status, 'agendado')) <> 'cancelado'
        AND ($3::integer IS NULL OR a.id <> $3)
      ORDER BY a.hora ASC
    `,
    [empresaId, data, ignorarId]
  );

  for (const existente of resultado.rows) {
    const inicioExistente = minutosDaHora(existente.hora);
    const duracaoExistente =
      Number(existente.duracao_min) || 30;

    const fimExistente =
      inicioExistente + duracaoExistente;

    // Existe conflito se os intervalos de horário se sobrepõem.
    const existeSobreposicao =
      inicioExistente < fimNovo &&
      inicioNovo < fimExistente;

    if (existeSobreposicao) {
      return {
        ...existente,
        duracao_min: duracaoExistente,
        inicio_minutos: inicioExistente,
        fim_minutos: fimExistente,
        novo_inicio_minutos: inicioNovo,
        novo_fim_minutos: fimNovo
      };
    }
  }

  return null;
}

// ============================================================
// TRATAMENTO DE ERROS DE VALIDAÇÃO
// ============================================================

function tratarErroValidacao(res, erro) {
  const errosConhecidos = [
    'Cliente inválido.',
    'Cliente não encontrado.',
    'Informe o nome do cliente.',
    'Serviço inválido.',
    'Serviço não encontrado ou inativo.'
  ];

  if (errosConhecidos.includes(erro.message)) {
    res.status(400).json({
      erro: erro.message
    });

    return true;
  }

  return false;
}

// ============================================================
// GET /api/agendamentos
// LISTAR AGENDAMENTOS
// ============================================================

router.get('/', async (req, res) => {
  try {
    const empresaId = obterEmpresaId(req);

    if (!empresaId) {
      return res.status(403).json({
        erro: 'Empresa não identificada.'
      });
    }

    const { data, de, ate, busca } = req.query;

    const condicoes = ['a.empresa_id = $1'];
    const parametros = [empresaId];

    if (data) {
      if (!validarData(data)) {
        return res.status(400).json({
          erro: 'Data inválida.'
        });
      }

      parametros.push(data);
      condicoes.push(`a.data = $${parametros.length}`);
    } else {
      if (de) {
        if (!validarData(de)) {
          return res.status(400).json({
            erro: 'Data inicial inválida.'
          });
        }

        parametros.push(de);
        condicoes.push(`a.data >= $${parametros.length}`);
      }

      if (ate) {
        if (!validarData(ate)) {
          return res.status(400).json({
            erro: 'Data final inválida.'
          });
        }

        parametros.push(ate);
        condicoes.push(`a.data <= $${parametros.length}`);
      }
    }

    if (busca) {
      parametros.push(
        `%${normalizarTexto(busca)}%`
      );

      condicoes.push(`
        (
          a.cliente ILIKE $${parametros.length}
          OR a.telefone ILIKE $${parametros.length}
          OR a.placa ILIKE $${parametros.length}
          OR s.nome ILIKE $${parametros.length}
        )
      `);
    }

    const resultado = await pool.query(
      `
        ${SELECT_BASE}
        WHERE ${condicoes.join(' AND ')}
        ORDER BY a.data ASC, a.hora ASC
      `,
      parametros
    );

    return res.json(resultado.rows);
  } catch (erro) {
    console.error('Erro ao listar agendamentos:', erro);

    return res.status(500).json({
      erro: 'Erro ao buscar agendamentos.'
    });
  }
});

// ============================================================
// POST /api/agendamentos
// CRIAR AGENDAMENTO
// ============================================================

router.post('/', async (req, res) => {
  try {
    const empresaId = obterEmpresaId(req);

    if (!empresaId) {
      return res.status(403).json({
        erro: 'Empresa não identificada.'
      });
    }

    const body = req.body || {};

    const {
      cliente_id,
      cliente,
      telefone,
      veiculo,
      placa,
      servico_id,
      data,
      hora,
      valor,
      observacoes
    } = body;

    if (!validarData(data)) {
      return res.status(400).json({
        erro: 'Informe uma data válida.'
      });
    }

    if (!validarHora(hora)) {
      return res.status(400).json({
        erro: 'Informe um horário válido.'
      });
    }

    const valorFinal = validarValor(valor);

    if (valorFinal === null) {
      return res.status(400).json({
        erro: 'Informe um valor válido.'
      });
    }

    const erroCampos = validarCamposTexto(body);

    if (erroCampos) {
      return res.status(400).json({
        erro: erroCampos
      });
    }

    // Valida o status, caso tenha sido informado.
    if (!validarStatus(body.status)) {
      return res.status(400).json({
        erro: 'Status do agendamento inválido.'
      });
    }

    const clienteResolvido = await resolverCliente({
      clienteId: cliente_id,
      cliente,
      telefone,
      empresaId
    });

    const servico = await validarServico(
      servico_id,
      empresaId
    );

    // Verifica sobreposição considerando a duração do serviço.
    if (body.forcar_conflito !== true) {
      const conflito = await buscarConflitoHorario({
        empresaId,
        data,
        hora,
        servicoId: servico.id
      });

      if (conflito?.erro === 'DURACAO_EXCEDE_DIA') {
        return res.status(400).json({
          codigo: conflito.erro,
          erro: conflito.mensagem
        });
      }

      if (conflito) {
        return res.status(409).json({
          codigo: 'CONFLITO_HORARIO',
          erro:
            'O horário escolhido se sobrepõe a outro agendamento.',
          conflito
        });
      }
    }

    /*
     * O banco define o status padrão do novo agendamento.
     * Se o cliente enviar um status, normalizamos antes de salvar.
     */
    const statusInicial =
      body.status !== undefined &&
      body.status !== null &&
      body.status !== ''
        ? normalizarStatusAgendamento(body.status)
        : null;

    const colunas = [
      'empresa_id',
      'cliente_id',
      'cliente',
      'telefone',
      'veiculo',
      'placa',
      'servico_id',
      'data',
      'hora',
      'valor',
      'observacoes'
    ];

    const valores = [
      empresaId,
      clienteResolvido.cliente_id,
      clienteResolvido.cliente,
      clienteResolvido.telefone,
      normalizarTexto(veiculo),
      normalizarTexto(placa),
      servico.id,
      data,
      hora,
      valorFinal,
      normalizarTexto(observacoes)
    ];

    if (statusInicial !== null) {
      colunas.push('status');
      valores.push(statusInicial);
    }

    const placeholders = valores
      .map((_, indice) => `$${indice + 1}`)
      .join(', ');

    const resultado = await pool.query(
      `
        INSERT INTO agendamentos (
          ${colunas.join(', ')}
        )
        VALUES (
          ${placeholders}
        )
        RETURNING *
      `,
      valores
    );

    const agendamento = resultado.rows[0];

    try {
      await criarNotificacao({
        empresaId,
        tipo: 'agendamento',
        titulo: 'Novo agendamento',
        mensagem:
          `Agendamento criado para ${agendamento.cliente}.`,
        link: '/agenda'
      });
    } catch (erroNotificacao) {
      console.error(
        'Erro ao criar notificação do agendamento:',
        erroNotificacao
      );
    }


    return res.status(201).json(agendamento);
  } catch (erro) {
    if (tratarErroValidacao(res, erro)) {
      return;
    }

    console.error('Erro ao criar agendamento:', erro);

    return res.status(500).json({
      erro: 'Erro ao criar agendamento.'
    });
  }
});

// ============================================================
// PATCH /api/agendamentos/:id
// EDITAR AGENDAMENTO
// ============================================================

router.patch('/:id', async (req, res) => {
  try {
    const empresaId = obterEmpresaId(req);
    const id = validarId(req.params.id);

    if (!empresaId) {
      return res.status(403).json({
        erro: 'Empresa não identificada.'
      });
    }

    if (!id) {
      return res.status(400).json({
        erro: 'ID do agendamento inválido.'
      });
    }

    const existenteResult = await pool.query(
      `
        SELECT *
        FROM agendamentos
        WHERE id = $1
          AND empresa_id = $2
        LIMIT 1
      `,
      [id, empresaId]
    );

    if (!existenteResult.rows.length) {
      return res.status(404).json({
        erro: 'Agendamento não encontrado.'
      });
    }

    const atual = existenteResult.rows[0];
    const body = req.body || {};

    const novaData = body.data ?? atual.data;
    const novaHora = body.hora ?? atual.hora;
    const novoServicoId =
      body.servico_id ?? atual.servico_id;

    if (!validarData(String(novaData).slice(0, 10))) {
      return res.status(400).json({
        erro: 'Data inválida.'
      });
    }

    if (!validarHora(String(novaHora).slice(0, 8))) {
      return res.status(400).json({
        erro: 'Horário inválido.'
      });
    }

    const erroCampos = validarCamposTexto(body);

    if (erroCampos) {
      return res.status(400).json({
        erro: erroCampos
      });
    }

    if (!validarStatus(body.status)) {
      return res.status(400).json({
        erro: 'Status do agendamento inválido.'
      });
    }

    if (!validarStatusPagamento(body.status_pagamento)) {
      return res.status(400).json({
        erro: 'Status de pagamento inválido.'
      });
    }

    const servico = await validarServico(
      novoServicoId,
      empresaId
    );

    /*
     * Verifica conflitos quando data, hora ou serviço mudar.
     * O próprio agendamento é excluído da busca.
     */
    const alterouAgenda =
      body.data !== undefined ||
      body.hora !== undefined ||
      body.servico_id !== undefined;

    if (
      alterouAgenda &&
      body.forcar_conflito !== true
    ) {
      const conflito = await buscarConflitoHorario({
        empresaId,
        data: String(novaData).slice(0, 10),
        hora: String(novaHora).slice(0, 8),
        servicoId: servico.id,
        ignorarId: id
      });

      if (conflito?.erro === 'DURACAO_EXCEDE_DIA') {
        return res.status(400).json({
          codigo: conflito.erro,
          erro: conflito.mensagem
        });
      }

      if (conflito) {
        return res.status(409).json({
          codigo: 'CONFLITO_HORARIO',
          erro:
            'O horário escolhido se sobrepõe a outro agendamento.',
          conflito
        });
      }
    }

    let clienteResolvido = {
      cliente_id: atual.cliente_id,
      cliente: atual.cliente,
      telefone: atual.telefone
    };

    if (
      body.cliente_id !== undefined ||
      body.cliente !== undefined ||
      body.telefone !== undefined
    ) {
      clienteResolvido = await resolverCliente({
        clienteId: body.cliente_id !== undefined
          ? body.cliente_id
          : atual.cliente_id,
        cliente: body.cliente ?? atual.cliente,
        telefone: body.telefone ?? atual.telefone,
        empresaId
      });
    }

    const valorFinal = body.valor !== undefined
      ? validarValor(body.valor)
      : Number(atual.valor);

    if (
      valorFinal === null ||
      !Number.isFinite(valorFinal)
    ) {
      return res.status(400).json({
        erro: 'Valor inválido.'
      });
    }

    /*
     * Normaliza o status antes do UPDATE.
     *
     * Exemplo:
     * confirmado -> agendado
     *
     * Assim, nenhum UPDATE envia "confirmado"
     * para a restrição agendamentos_status_check.
     */
    const statusFinal =
      body.status !== undefined &&
      body.status !== null &&
      body.status !== ''
        ? normalizarStatusAgendamento(body.status)
        : atual.status;

    const campos = {
      cliente_id: clienteResolvido.cliente_id,
      cliente: clienteResolvido.cliente,
      telefone: clienteResolvido.telefone,
      veiculo: body.veiculo ?? atual.veiculo,
      placa: body.placa ?? atual.placa,
      servico_id: servico.id,
      data: String(novaData).slice(0, 10),
      hora: String(novaHora).slice(0, 8),
      valor: valorFinal,
      observacoes: body.observacoes ?? atual.observacoes,
      status: statusFinal,
      status_pagamento:
        body.status_pagamento ?? atual.status_pagamento,
      forma_pagamento:
        body.forma_pagamento ?? atual.forma_pagamento
    };

    const colunasPermitidas = [
      'cliente_id',
      'cliente',
      'telefone',
      'veiculo',
      'placa',
      'servico_id',
      'data',
      'hora',
      'valor',
      'observacoes',
      'status',
      'status_pagamento',
      'forma_pagamento'
    ];

    const camposSempreAtualizados = [
      'cliente_id',
      'cliente',
      'telefone',
      'servico_id',
      'data',
      'hora',
      'valor'
    ];

    const atribuicoes = [];
    const parametros = [];

    for (const coluna of colunasPermitidas) {
      if (
        body[coluna] !== undefined ||
        camposSempreAtualizados.includes(coluna)
      ) {
        parametros.push(campos[coluna]);

        atribuicoes.push(
          `${coluna} = $${parametros.length}`
        );
      }
    }

    parametros.push(id);
    const idParam = parametros.length;

    parametros.push(empresaId);
    const empresaParam = parametros.length;

    const resultado = await pool.query(
      `
        UPDATE agendamentos
        SET ${atribuicoes.join(', ')}
        WHERE id = $${idParam}
          AND empresa_id = $${empresaParam}
        RETURNING *
      `,
      parametros
    );

    if (!resultado.rows.length) {
      return res.status(404).json({
        erro: 'Agendamento não encontrado.'
      });
    }

    return res.json(resultado.rows[0]);
  } catch (erro) {
    if (tratarErroValidacao(res, erro)) {
      return;
    }

    console.error('Erro ao atualizar agendamento:', erro);

    return res.status(500).json({
      erro: 'Erro ao atualizar agendamento.'
    });
  }
});

// ============================================================
// DELETE /api/agendamentos/:id
// EXCLUIR AGENDAMENTO
// ============================================================

router.delete('/:id', async (req, res) => {
  try {
    const empresaId = obterEmpresaId(req);
    const id = validarId(req.params.id);

    if (!empresaId) {
      return res.status(403).json({
        erro: 'Empresa não identificada.'
      });
    }

    if (!id) {
      return res.status(400).json({
        erro: 'ID do agendamento inválido.'
      });
    }

    const resultado = await pool.query(
      `
        DELETE FROM agendamentos
        WHERE id = $1
          AND empresa_id = $2
        RETURNING id
      `,
      [id, empresaId]
    );

    if (!resultado.rows.length) {
      return res.status(404).json({
        erro: 'Agendamento não encontrado.'
      });
    }

    return res.json({
      mensagem: 'Agendamento excluído com sucesso.'
    });
  } catch (erro) {
    console.error('Erro ao excluir agendamento:', erro);

    return res.status(500).json({
      erro: 'Erro ao excluir agendamento.'
    });
  }
});

module.exports = router;