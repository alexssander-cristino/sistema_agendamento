const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');
const { criarNotificacao } = require('../services/notificacoes');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);

// ============================================================
// CONSULTA BASE
// ============================================================

const SELECT_BASE = `
  SELECT
    a.*,
    s.nome AS servico_nome
  FROM agendamentos a
  LEFT JOIN servicos s
    ON s.id = a.servico_id
   AND s.empresa_id = a.empresa_id
`;

// ============================================================
// UTILITÁRIOS
// ============================================================

function obterEmpresaId(req) {
  return req.usuario?.empresa_id || null;
}

function validarId(valor) {
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizarTexto(valor) {
  if (valor === undefined || valor === null) {
    return null;
  }

  const texto = String(valor).trim();
  return texto || null;
}

function validarData(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) {
    return false;
  }

  const [ano, mes, dia] = String(data).split('-').map(Number);
  const dataTeste = new Date(Date.UTC(ano, mes - 1, dia));

  return (
    dataTeste.getUTCFullYear() === ano &&
    dataTeste.getUTCMonth() === mes - 1 &&
    dataTeste.getUTCDate() === dia
  );
}

function validarHora(hora) {
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(
    String(hora || '')
  );
}

function validarValor(valor) {
  if (valor === undefined || valor === null || valor === '') {
    return true;
  }

  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0;
}

function validarStatus(status) {
  const permitidos = [
    'agendado',
    'pendente',
    'confirmado',
    'em_andamento',
    'concluido',
    'cancelado',
    'não_compareceu',
    'nao_compareceu'
  ];

  return permitidos.includes(
    String(status || '').trim().toLowerCase()
  );
}

function validarStatusPagamento(status) {
  const permitidos = [
    'pendente',
    'pago',
    'cancelado',
    'estornado',
    'parcial'
  ];

  return permitidos.includes(
    String(status || '').trim().toLowerCase()
  );
}

function validarTamanho(valor, maximo, nome) {
  if (valor !== null && String(valor).length > maximo) {
    return `${nome} deve ter no máximo ${maximo} caracteres.`;
  }

  return null;
}

function validarCamposTexto(body, campos) {
  for (const [nome, maximo] of campos) {
    if (body[nome] === undefined || body[nome] === null) {
      continue;
    }

    const erro = validarTamanho(
      String(body[nome]),
      maximo,
      nome
    );

    if (erro) {
      return erro;
    }
  }

  return null;
}

// ============================================================
// RESOLVE CLIENTE
//
// Quando cliente_id é informado, o cadastro precisa pertencer
// à empresa autenticada e estar ativo.
//
// Quando cliente_id não é informado, preserva compatibilidade
// com agendamentos feitos com nome e telefone livres.
// ============================================================

async function resolverCliente({
  clienteId,
  cliente,
  telefone,
  empresaId
}) {
  const nomeInformado = normalizarTexto(cliente);
  const telefoneInformado = normalizarTexto(telefone);

  const semClienteId =
    clienteId === undefined ||
    clienteId === null ||
    String(clienteId).trim() === '';

  if (semClienteId) {
    if (!nomeInformado) {
      return {
        erro: 'Informe o cliente ou selecione um cadastro.'
      };
    }

    const erroNome = validarTamanho(
      nomeInformado,
      150,
      'Nome do cliente'
    );

    if (erroNome) {
      return { erro: erroNome };
    }

    const erroTelefone = validarTamanho(
      telefoneInformado,
      30,
      'Telefone'
    );

    if (erroTelefone) {
      return { erro: erroTelefone };
    }

    return {
      cliente_id: null,
      cliente: nomeInformado,
      telefone: telefoneInformado
    };
  }

  const id = validarId(clienteId);

  if (!id) {
    return {
      erro: 'Identificador de cliente inválido.'
    };
  }

  const { rows } = await pool.query(
    `
      SELECT id, nome, telefone
      FROM clientes
      WHERE id = $1
        AND empresa_id = $2
        AND ativo = TRUE
      LIMIT 1
    `,
    [id, empresaId]
  );

  if (!rows.length) {
    return {
      erro: 'Cliente não encontrado ou indisponível nesta empresa.'
    };
  }

  const cadastro = rows[0];

  return {
    cliente_id: cadastro.id,
    cliente: cadastro.nome,
    telefone: cadastro.telefone || null
  };
}

// ============================================================
// VALIDA SERVIÇO
// ============================================================

async function validarServico(servicoId, empresaId) {
  const id = validarId(servicoId);

  if (!id) {
    return false;
  }

  const { rows } = await pool.query(
    `
      SELECT id
      FROM servicos
      WHERE id = $1
        AND empresa_id = $2
        AND ativo = TRUE
      LIMIT 1
    `,
    [id, empresaId]
  );

  return rows.length > 0;
}

// ============================================================
// GET /api/agendamentos
//
// Filtros:
// ?data=AAAA-MM-DD
// ?de=AAAA-MM-DD&ate=AAAA-MM-DD
// ?busca=termo
// ?cliente_id=123
// ============================================================

router.get('/', async (req, res) => {
  const empresaId = obterEmpresaId(req);

  const data = String(req.query.data || '').trim();
  const de = String(req.query.de || '').trim();
  const ate = String(req.query.ate || '').trim();
  const busca = String(req.query.busca || '').trim();
  const clienteIdInformado = req.query.cliente_id;

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

  try {
    const condicoes = ['a.empresa_id = $1'];
    const valores = [empresaId];

    if (
      clienteIdInformado !== undefined &&
      String(clienteIdInformado).trim() !== ''
    ) {
      const clienteId = validarId(clienteIdInformado);

      if (!clienteId) {
        return res.status(400).json({
          erro: 'Identificador de cliente inválido.'
        });
      }

      valores.push(clienteId);
      condicoes.push(`a.cliente_id = $${valores.length}`);
    }

    if (data) {
      if (!validarData(data)) {
        return res.status(400).json({
          erro: 'Data inválida.'
        });
      }

      valores.push(data);
      condicoes.push(`a.data = $${valores.length}`);
    }

    if (de || ate) {
      if (!de || !ate || !validarData(de) || !validarData(ate)) {
        return res.status(400).json({
          erro: 'Informe um período válido.'
        });
      }

      if (de > ate) {
        return res.status(400).json({
          erro: 'A data inicial não pode ser posterior à data final.'
        });
      }

      valores.push(de);
      condicoes.push(`a.data >= $${valores.length}`);

      valores.push(ate);
      condicoes.push(`a.data <= $${valores.length}`);
    }

    if (busca) {
      valores.push(`%${busca}%`);
      const posicao = valores.length;

      condicoes.push(`(
        a.cliente ILIKE $${posicao}
        OR COALESCE(a.telefone, '') ILIKE $${posicao}
        OR COALESCE(a.placa, '') ILIKE $${posicao}
      )`);
    }

    const ordenacao =
      data || busca || clienteIdInformado
        ? 'a.data DESC, a.hora DESC'
        : 'a.data ASC, a.hora ASC';

    const { rows } = await pool.query(
      `
        ${SELECT_BASE}
        WHERE ${condicoes.join(' AND ')}
        ORDER BY ${ordenacao}
      `,
      valores
    );

    return res.json(rows);
  } catch (err) {
    console.error('Erro ao carregar agendamentos:', err);

    return res.status(500).json({
      erro: 'Não foi possível carregar os agendamentos.'
    });
  }
});

// ============================================================
// GET /api/agendamentos/:id
// ============================================================

router.get('/:id', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const id = validarId(req.params.id);

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

  if (!id) {
    return res.status(400).json({
      erro: 'Identificador de agendamento inválido.'
    });
  }

  try {
    const { rows } = await pool.query(
      `
        ${SELECT_BASE}
        WHERE a.id = $1
          AND a.empresa_id = $2
        LIMIT 1
      `,
      [id, empresaId]
    );

    if (!rows.length) {
      return res.status(404).json({
        erro: 'Agendamento não encontrado.'
      });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao consultar agendamento:', err);

    return res.status(500).json({
      erro: 'Não foi possível consultar o agendamento.'
    });
  }
});

// ============================================================
// POST /api/agendamentos
// ============================================================

router.post('/', async (req, res) => {
  const empresaId = obterEmpresaId(req);

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

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
  } = req.body || {};

  if (!data || !hora || !servico_id) {
    return res.status(400).json({
      erro: 'Informe cliente, serviço, data e hora.'
    });
  }

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

  if (!validarValor(valor)) {
    return res.status(400).json({
      erro: 'Informe um valor válido.'
    });
  }

  const erroTexto = validarCamposTexto(req.body || {}, [
    ['veiculo', 120],
    ['placa', 20],
    ['observacoes', 5000]
  ]);

  if (erroTexto) {
    return res.status(400).json({
      erro: erroTexto
    });
  }

  try {
    const dadosCliente = await resolverCliente({
      clienteId: cliente_id,
      cliente,
      telefone,
      empresaId
    });

    if (dadosCliente.erro) {
      return res.status(400).json({
        erro: dadosCliente.erro
      });
    }

    const servicoValido = await validarServico(
      servico_id,
      empresaId
    );

    if (!servicoValido) {
      return res.status(400).json({
        erro: 'Serviço não encontrado para esta empresa.'
      });
    }

    const { rows } = await pool.query(
      `
        INSERT INTO agendamentos (
          empresa_id,
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
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
        RETURNING *
      `,
      [
        empresaId,
        dadosCliente.cliente_id,
        dadosCliente.cliente,
        dadosCliente.telefone,
        normalizarTexto(veiculo),
        normalizarTexto(placa),
        Number(servico_id),
        data,
        hora,
        valor === '' || valor == null ? 0 : Number(valor),
        normalizarTexto(observacoes)
      ]
    );

    const agendamento = rows[0];

    try {
      await criarNotificacao({
        empresaId,
        tipo: 'agendamento',
        titulo: 'Novo agendamento',
        mensagem:
          `Novo agendamento de ${agendamento.cliente}, ` +
          `para ${agendamento.data} às ${agendamento.hora}.`,
        link: '/'
      });
    } catch (erroNotificacao) {
      console.error(
        'Agendamento criado, mas a notificação falhou:',
        erroNotificacao
      );
    }

    return res.status(201).json(agendamento);
  } catch (err) {
    console.error('Erro ao criar agendamento:', err);

    return res.status(500).json({
      erro: 'Não foi possível criar o agendamento.'
    });
  }
});

// ============================================================
// PATCH /api/agendamentos/:id
// ============================================================

router.patch('/:id', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const id = validarId(req.params.id);

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

  if (!id) {
    return res.status(400).json({
      erro: 'Identificador de agendamento inválido.'
    });
  }

  const body = req.body || {};

  try {
    const existente = await pool.query(
      `
        SELECT *
        FROM agendamentos
        WHERE id = $1
          AND empresa_id = $2
        LIMIT 1
      `,
      [id, empresaId]
    );

    if (!existente.rows.length) {
      return res.status(404).json({
        erro: 'Agendamento não encontrado.'
      });
    }

    const atual = existente.rows[0];

    if (
      body.forma_pagamento !== undefined &&
      body.forma_pagamento !== atual.forma_pagamento &&
      body.status_pagamento === undefined &&
      atual.status_pagamento === 'pago'
    ) {
      return res.status(400).json({
        erro:
          'Pagamento já confirmado. Desfaça a confirmação ' +
          'antes de trocar a forma de pagamento.'
      });
    }

    if (body.data !== undefined && !validarData(body.data)) {
      return res.status(400).json({
        erro: 'Informe uma data válida.'
      });
    }

    if (body.hora !== undefined && !validarHora(body.hora)) {
      return res.status(400).json({
        erro: 'Informe um horário válido.'
      });
    }

    if (body.valor !== undefined && !validarValor(body.valor)) {
      return res.status(400).json({
        erro: 'Informe um valor válido.'
      });
    }

    if (
      body.status !== undefined &&
      !validarStatus(body.status)
    ) {
      return res.status(400).json({
        erro: 'Status de agendamento inválido.'
      });
    }

    if (
      body.status_pagamento !== undefined &&
      !validarStatusPagamento(body.status_pagamento)
    ) {
      return res.status(400).json({
        erro: 'Status de pagamento inválido.'
      });
    }

    const erroTexto = validarCamposTexto(body, [
      ['cliente', 150],
      ['telefone', 30],
      ['veiculo', 120],
      ['placa', 20],
      ['forma_pagamento', 50],
      ['observacoes', 5000]
    ]);

    if (erroTexto) {
      return res.status(400).json({
        erro: erroTexto
      });
    }

    if (body.servico_id !== undefined) {
      const servicoValido = await validarServico(
        body.servico_id,
        empresaId
      );

      if (!servicoValido) {
        return res.status(400).json({
          erro: 'Serviço não encontrado para esta empresa.'
        });
      }
    }

    const atualizacoes = { ...body };

    // Só altera o vínculo quando cliente_id estiver presente.
    // Se não vier no corpo, preserva o vínculo existente.
    if (body.cliente_id !== undefined) {
      if (
        body.cliente_id === null ||
        String(body.cliente_id).trim() === ''
      ) {
        atualizacoes.cliente_id = null;

        if (body.cliente === undefined) {
          atualizacoes.cliente = atual.cliente;
        }

        if (body.telefone === undefined) {
          atualizacoes.telefone = atual.telefone;
        }
      } else {
        const dadosCliente = await resolverCliente({
          clienteId: body.cliente_id,
          cliente: body.cliente,
          telefone: body.telefone,
          empresaId
        });

        if (dadosCliente.erro) {
          return res.status(400).json({
            erro: dadosCliente.erro
          });
        }

        atualizacoes.cliente_id = dadosCliente.cliente_id;
        atualizacoes.cliente = dadosCliente.cliente;
        atualizacoes.telefone = dadosCliente.telefone;
      }
    }

    const camposPermitidos = [
      'cliente_id',
      'cliente',
      'telefone',
      'veiculo',
      'placa',
      'servico_id',
      'data',
      'hora',
      'valor',
      'status',
      'status_pagamento',
      'forma_pagamento',
      'observacoes'
    ];

    const sets = [];
    const valores = [];

    for (const campo of camposPermitidos) {
      if (atualizacoes[campo] === undefined) {
        continue;
      }

      let valorCampo = atualizacoes[campo];

      if (
        [
          'cliente',
          'telefone',
          'veiculo',
          'placa',
          'forma_pagamento',
          'observacoes'
        ].includes(campo)
      ) {
        valorCampo = normalizarTexto(valorCampo);
      }

      if (campo === 'valor' && valorCampo !== null) {
        valorCampo = Number(valorCampo);
      }

      if (campo === 'servico_id' && valorCampo !== null) {
        valorCampo = Number(valorCampo);
      }

      if (campo === 'cliente_id' && valorCampo !== null) {
        valorCampo = validarId(valorCampo);

        if (!valorCampo) {
          return res.status(400).json({
            erro: 'Identificador de cliente inválido.'
          });
        }
      }

      sets.push(`${campo} = $${valores.length + 1}`);
      valores.push(valorCampo);
    }

    if (!sets.length) {
      return res.status(400).json({
        erro: 'Nenhum campo para atualizar.'
      });
    }

    valores.push(id);
    valores.push(empresaId);

    const { rows } = await pool.query(
      `
        UPDATE agendamentos
        SET ${sets.join(', ')}
        WHERE id = $${valores.length - 1}
          AND empresa_id = $${valores.length}
        RETURNING *
      `,
      valores
    );

    if (!rows.length) {
      return res.status(404).json({
        erro: 'Agendamento não encontrado.'
      });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar agendamento:', err);

    return res.status(500).json({
      erro: 'Não foi possível atualizar o agendamento.'
    });
  }
});

// ============================================================
// DELETE /api/agendamentos/:id
// ============================================================

router.delete('/:id', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const id = validarId(req.params.id);

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

  if (!id) {
    return res.status(400).json({
      erro: 'Identificador de agendamento inválido.'
    });
  }

  try {
    const resultado = await pool.query(
      `
        DELETE FROM agendamentos
        WHERE id = $1
          AND empresa_id = $2
      `,
      [id, empresaId]
    );

    if (!resultado.rowCount) {
      return res.status(404).json({
        erro: 'Agendamento não encontrado.'
      });
    }

    return res.status(204).end();
  } catch (err) {
    console.error('Erro ao excluir agendamento:', err);

    return res.status(500).json({
      erro: 'Não foi possível remover o agendamento.'
    });
  }
});

module.exports = router;