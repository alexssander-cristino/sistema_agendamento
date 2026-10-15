const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const STATUS = [
  'aguardando',
  'contatado',
  'confirmado',
  'convertido',
  'desistiu'
];

const STATUS_FINAIS = ['convertido', 'desistiu'];

const PERIODOS = ['qualquer', 'manha', 'tarde', 'noite'];

const UM_DIA_MS = 24 * 60 * 60 * 1000;

// ============================================================
// HELPERS
// ============================================================

function empresaDoUsuario(req) {
  return req.usuario?.empresa_id ?? null;
}

function validarId(valor) {
  if (valor === undefined || valor === null || valor === '') {
    return null;
  }

  const id = Number(valor);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function texto(valor, limite = 255) {
  return String(valor ?? '')
    .trim()
    .slice(0, limite);
}

function dataValida(valor) {
  if (valor === undefined || valor === null || valor === '') {
    return true;
  }

  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
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

function horaValida(valor) {
  return (
    valor === undefined ||
    valor === null ||
    valor === '' ||
    (typeof valor === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor))
  );
}

// O driver "pg" devolve colunas DATE como objeto Date do JavaScript.
// Este helper converte para "YYYY-MM-DD" para poder comparar com segurança.
function dataISO(valor) {
  if (!valor) return null;

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;

    return [
      valor.getFullYear(),
      String(valor.getMonth() + 1).padStart(2, '0'),
      String(valor.getDate()).padStart(2, '0')
    ].join('-');
  }

  return String(valor).slice(0, 10);
}

function periodoDaHora(hora) {
  if (!hora) return 'qualquer';

  const [h] = String(hora).slice(0, 5).split(':').map(Number);

  if (h < 12) return 'manha';
  if (h < 18) return 'tarde';

  return 'noite';
}

function dataHojeLocal() {
  const agora = new Date();

  return [
    agora.getFullYear(),
    String(agora.getMonth() + 1).padStart(2, '0'),
    String(agora.getDate()).padStart(2, '0')
  ].join('-');
}

function dataPassada(data) {
  return Boolean(data && data < dataHojeLocal());
}

function normalizarHora(valor) {
  if (!valor) return null;

  return String(valor).slice(0, 5);
}

function calcularDiasEsperando(criadoEm) {
  if (!criadoEm) return 0;

  const timestamp = new Date(criadoEm).getTime();

  if (!Number.isFinite(timestamp)) return 0;

  return Math.max(0, Math.floor((Date.now() - timestamp) / UM_DIA_MS));
}

// ============================================================
// PONTUAÇÃO INTELIGENTE
// ============================================================

function calcularPontuacao(item, data, hora, servicoId) {
  let pontos = 0;

  const diasEsperando = calcularDiasEsperando(item.criado_em);

  // Prioriza quem está esperando há mais tempo.
  pontos += Math.min(diasEsperando, 30) * 2;

  // Compatibilidade com a data solicitada.
  if (data) {
    const dataItem = dataISO(item.data_desejada);

    if (dataItem === data) {
      pontos += 100;
    } else if (!dataItem) {
      pontos += 15;
    }
  }

  // Compatibilidade com o serviço solicitado.
  if (servicoId) {
    if (Number(item.servico_id) === Number(servicoId)) {
      pontos += 60;
    } else if (!item.servico_id) {
      pontos += 10;
    }
  }

  // Compatibilidade com o horário liberado.
  if (hora) {
    const horaSolicitada = normalizarHora(hora);
    const horaInicio = normalizarHora(item.hora_inicio);
    const horaFim = normalizarHora(item.hora_fim);

    if (horaInicio && horaSolicitada < horaInicio) {
      return -1;
    }

    if (horaFim && horaSolicitada >= horaFim) {
      return -1;
    }

    const periodo = periodoDaHora(horaSolicitada);

    if (item.periodo_preferido === periodo) {
      pontos += 50;
    } else if (item.periodo_preferido === 'qualquer') {
      pontos += 10;
    } else {
      pontos -= 20;
    }
  }

  return pontos;
}

// ============================================================
// VALIDAÇÃO DOS CAMPOS
// ============================================================

function validarCampos(body, permitirClienteVazio = false) {
  const cliente = texto(body.cliente ?? body.nome ?? body.cliente_nome, 150);

  const telefone = texto(body.telefone, 30);
  const observacoes = texto(body.observacoes ?? body.notes, 1000);

  const periodo = texto(
    body.periodo_preferido ?? body.periodo ?? 'qualquer',
    20
  );

  const data = body.data_desejada ?? body.desiredDate ?? body.data ?? null;
  const horaInicio = body.hora_inicio ?? body.startTime ?? null;
  const horaFim = body.hora_fim ?? body.endTime ?? null;

  const dataNormalizada = data === '' ? null : data;
  const horaInicioNormalizada = horaInicio === '' ? null : horaInicio;
  const horaFimNormalizada = horaFim === '' ? null : horaFim;

  if (!permitirClienteVazio && !cliente) {
    return { erro: 'Informe o nome do cliente.' };
  }

  if (!permitirClienteVazio && !telefone) {
    return { erro: 'Informe o telefone do cliente.' };
  }

  if (!dataValida(dataNormalizada)) {
    return { erro: 'A data desejada é inválida.' };
  }

  if (dataPassada(dataNormalizada)) {
    return { erro: 'A data desejada não pode estar no passado.' };
  }

  if (!PERIODOS.includes(periodo)) {
    return { erro: 'Período preferido inválido.' };
  }

  if (!horaValida(horaInicioNormalizada) || !horaValida(horaFimNormalizada)) {
    return { erro: 'Informe horários válidos no formato HH:MM.' };
  }

  if (
    horaInicioNormalizada &&
    horaFimNormalizada &&
    horaInicioNormalizada >= horaFimNormalizada
  ) {
    return { erro: 'A hora final deve ser posterior à hora inicial.' };
  }

  return {
    valores: {
      cliente,
      telefone,
      observacoes,
      periodo,
      data: dataNormalizada,
      horaInicio: horaInicioNormalizada,
      horaFim: horaFimNormalizada
    }
  };
}

// ============================================================
// GET /api/lista-espera
// Lista os registros e, quando solicitado, sugere clientes.
// Query params opcionais: status, data, hora, servico_id
// ============================================================

router.get('/', async (req, res) => {
  const empresaId = empresaDoUsuario(req);

  if (!empresaId) {
    return res.status(403).json({ erro: 'Empresa não identificada.' });
  }

  const status = texto(req.query.status, 20);
  const data = req.query.data || null;
  const hora = req.query.hora || null;
  const servicoId = req.query.servico_id
    ? validarId(req.query.servico_id)
    : null;

  if (status && !STATUS.includes(status)) {
    return res.status(400).json({ erro: 'Status de filtro inválido.' });
  }

  if (data && !dataValida(data)) {
    return res.status(400).json({ erro: 'Data de sugestão inválida.' });
  }

  if (hora && !horaValida(hora)) {
    return res.status(400).json({ erro: 'Hora de sugestão inválida.' });
  }

  if (req.query.servico_id && !servicoId) {
    return res.status(400).json({ erro: 'Serviço de filtro inválido.' });
  }

  try {
    const resultado = await pool.query(
      `
        SELECT
          l.*,
          s.nome AS servico_nome,
          COALESCE(
            NULLIF(l.cliente, ''),
            c.nome
          ) AS nome_exibicao
        FROM lista_espera l
        LEFT JOIN clientes c
          ON c.id = l.cliente_id
         AND c.empresa_id = l.empresa_id
        LEFT JOIN servicos s
          ON s.id = l.servico_id
         AND s.empresa_id = l.empresa_id
        WHERE l.empresa_id = $1
          AND ($2::text IS NULL OR l.status = $2::text)
        ORDER BY l.criado_em ASC
      `,
      [empresaId, status || null]
    );

    const modoSugestao = Boolean(data || hora || servicoId);

    let itens = resultado.rows;

    // Em busca de horário, não sugerir quem já converteu ou desistiu.
    if (modoSugestao) {
      itens = itens.filter((item) => !STATUS_FINAIS.includes(item.status));
    }

    // Data desejada: aceita a data exata ou quem não tem preferência.
    if (data) {
      itens = itens.filter((item) => {
        const dataItem = dataISO(item.data_desejada);

        if (!dataItem) return true;

        return dataItem === data;
      });
    }

    // Serviço: aceita o serviço pedido ou registros sem serviço definido.
    if (servicoId) {
      itens = itens.filter(
        (item) =>
          !item.servico_id || Number(item.servico_id) === Number(servicoId)
      );
    }

    itens = itens
      .map((item) => ({
        ...item,
        pontuacao: calcularPontuacao(item, data, hora, servicoId)
      }))
      .filter((item) => item.pontuacao >= 0)
      .sort((a, b) => {
        if (b.pontuacao !== a.pontuacao) {
          return b.pontuacao - a.pontuacao;
        }

        return (
          new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()
        );
      });

    return res.json({
      sucesso: true,
      total: itens.length,
      sugestao_horario: modoSugestao
        ? { data, hora, servico_id: servicoId }
        : null,
      itens
    });
  } catch (erro) {
    console.error('[Lista de Espera] Erro ao listar:', erro);

    return res.status(500).json({
      erro: 'Não foi possível carregar a lista de espera.'
    });
  }
});

// ============================================================
// POST /api/lista-espera
// Cadastra um cliente na fila.
// Aceita cliente_id e servico_id opcionais.
// ============================================================

router.post('/', async (req, res) => {
  const empresaId = empresaDoUsuario(req);

  if (!empresaId) {
    return res.status(403).json({ erro: 'Empresa não identificada.' });
  }

  const body = req.body || {};

  const clienteId = body.cliente_id ? validarId(body.cliente_id) : null;

  const servicoBruto = body.servico_id ?? body.serviceId;
  const servicoId = servicoBruto ? validarId(servicoBruto) : null;

  if (body.cliente_id && !clienteId) {
    return res.status(400).json({ erro: 'Cliente inválido.' });
  }

  if (servicoBruto && !servicoId) {
    return res.status(400).json({ erro: 'Serviço inválido.' });
  }

  const validacao = validarCampos(body, Boolean(clienteId));

  if (validacao.erro) {
    return res.status(400).json({ erro: validacao.erro });
  }

  const {
    cliente,
    telefone,
    observacoes,
    periodo,
    data,
    horaInicio,
    horaFim
  } = validacao.valores;

  let client;
  let transacaoAberta = false;

  try {
    client = await pool.connect();

    await client.query('BEGIN');
    transacaoAberta = true;

    let nomeFinal = cliente;
    let telefoneFinal = telefone;

    if (clienteId) {
      const clienteResult = await client.query(
        `
          SELECT id, nome, telefone
          FROM clientes
          WHERE id = $1
            AND empresa_id = $2
          LIMIT 1
        `,
        [clienteId, empresaId]
      );

      if (!clienteResult.rows.length) {
        await client.query('ROLLBACK');
        transacaoAberta = false;

        return res.status(400).json({
          erro: 'Cliente não encontrado nesta empresa.'
        });
      }

      const clienteBanco = clienteResult.rows[0];

      nomeFinal = clienteBanco.nome;
      telefoneFinal = telefone || clienteBanco.telefone || '';

      if (!telefoneFinal) {
        await client.query('ROLLBACK');
        transacaoAberta = false;

        return res.status(400).json({
          erro: 'O cliente selecionado não possui telefone cadastrado.'
        });
      }
    }

    if (!nomeFinal) {
      await client.query('ROLLBACK');
      transacaoAberta = false;

      return res.status(400).json({ erro: 'Informe o nome do cliente.' });
    }

    if (!telefoneFinal) {
      await client.query('ROLLBACK');
      transacaoAberta = false;

      return res.status(400).json({ erro: 'Informe o telefone do cliente.' });
    }

    if (servicoId) {
      const servicoResult = await client.query(
        `
          SELECT id
          FROM servicos
          WHERE id = $1
            AND empresa_id = $2
            AND ativo = TRUE
          LIMIT 1
        `,
        [servicoId, empresaId]
      );

      if (!servicoResult.rows.length) {
        await client.query('ROLLBACK');
        transacaoAberta = false;

        return res.status(400).json({
          erro: 'Serviço não encontrado ou inativo.'
        });
      }
    }

    const inserido = await client.query(
      `
        INSERT INTO lista_espera (
          empresa_id,
          cliente_id,
          servico_id,
          cliente,
          telefone,
          data_desejada,
          periodo_preferido,
          hora_inicio,
          hora_fim,
          observacoes,
          status,
          criado_em,
          atualizado_em
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          'aguardando', NOW(), NOW()
        )
        RETURNING *
      `,
      [
        empresaId,
        clienteId,
        servicoId,
        nomeFinal,
        telefoneFinal,
        data,
        periodo,
        horaInicio,
        horaFim,
        observacoes
      ]
    );

    await client.query('COMMIT');
    transacaoAberta = false;

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Cliente adicionado à lista de espera.',
      item: inserido.rows[0]
    });
  } catch (erro) {
    if (transacaoAberta && client) {
      try {
        await client.query('ROLLBACK');
      } catch (erroRollback) {
        console.error(
          '[Lista de Espera] Erro ao desfazer transação:',
          erroRollback
        );
      }
    }

    console.error('[Lista de Espera] Erro ao cadastrar:', erro);

    return res.status(500).json({
      erro: 'Não foi possível cadastrar o cliente na lista de espera.'
    });
  } finally {
    if (client) client.release();
  }
});

// ============================================================
// PATCH /api/lista-espera/:id/status
// Atualiza o status do cliente.
// ============================================================

router.patch('/:id/status', async (req, res) => {
  const empresaId = empresaDoUsuario(req);
  const id = validarId(req.params.id);
  const status = texto(req.body?.status, 20);

  if (!empresaId) {
    return res.status(403).json({ erro: 'Empresa não identificada.' });
  }

  if (!id) {
    return res.status(400).json({ erro: 'ID inválido.' });
  }

  if (!STATUS.includes(status)) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }

  try {
    // CORREÇÃO: casts explícitos evitam o erro 42P08
    // ("inconsistent types deduced for parameter $1").
    const resultado = await pool.query(
      `
        UPDATE lista_espera
        SET
          status = $1::varchar,
          atualizado_em = NOW(),
          contatado_em = CASE
            WHEN $1::text = 'contatado'
              THEN COALESCE(contatado_em, NOW())
            ELSE contatado_em
          END,
          convertido_em = CASE
            WHEN $1::text = 'convertido'
              THEN COALESCE(convertido_em, NOW())
            ELSE convertido_em
          END
        WHERE id = $2
          AND empresa_id = $3
        RETURNING *
      `,
      [status, id, empresaId]
    );

    if (!resultado.rows.length) {
      return res.status(404).json({ erro: 'Registro não encontrado.' });
    }

    return res.json({
      sucesso: true,
      mensagem: 'Status atualizado com sucesso.',
      item: resultado.rows[0]
    });
  } catch (erro) {
    console.error('[Lista de Espera] Erro ao atualizar status:', erro);

    return res.status(500).json({
      erro: 'Não foi possível atualizar o status.'
    });
  }
});

// ============================================================
// DELETE /api/lista-espera/:id
// Remove um registro da fila da empresa autenticada.
// ============================================================

router.delete('/:id', async (req, res) => {
  const empresaId = empresaDoUsuario(req);
  const id = validarId(req.params.id);

  if (!empresaId) {
    return res.status(403).json({ erro: 'Empresa não identificada.' });
  }

  if (!id) {
    return res.status(400).json({ erro: 'ID inválido.' });
  }

  try {
    const resultado = await pool.query(
      `
        DELETE FROM lista_espera
        WHERE id = $1
          AND empresa_id = $2
        RETURNING id
      `,
      [id, empresaId]
    );

    if (!resultado.rows.length) {
      return res.status(404).json({ erro: 'Registro não encontrado.' });
    }

    return res.json({
      sucesso: true,
      mensagem: 'Registro removido da lista de espera.'
    });
  } catch (erro) {
    console.error('[Lista de Espera] Erro ao excluir:', erro);

    return res.status(500).json({
      erro: 'Não foi possível remover o registro.'
    });
  }
});

module.exports = router;