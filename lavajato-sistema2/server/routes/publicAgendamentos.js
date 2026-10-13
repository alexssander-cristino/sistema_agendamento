'use strict';

const express = require('express');
const pool = require('../db');

const router = express.Router();

// ============================================================
// VALIDAÇÕES PÚBLICAS
// ============================================================

function validarSlugPublico(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
    String(slug || '')
  );
}

function validarDataPublica(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) {
    return false;
  }

  const [ano, mes, dia] = data.split('-').map(Number);
  const teste = new Date(Date.UTC(ano, mes - 1, dia));

  return (
    teste.getUTCFullYear() === ano &&
    teste.getUTCMonth() === mes - 1 &&
    teste.getUTCDate() === dia
  );
}

function validarIdPublico(valor) {
  return /^[1-9]\d{0,18}$/.test(String(valor || ''));
}

function paraMinutos(hora) {
  const partes = String(hora).split(':').map(Number);
  return partes[0] * 60 + partes[1];
}

// ============================================================
// GET /api/public/agendamentos/:slug
// Carrega os dados públicos da empresa e seus serviços.
// ============================================================

router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  if (!validarSlugPublico(slug)) {
    return res.status(400).json({
      erro: 'Link de agendamento inválido.'
    });
  }

  try {
    const resultado = await pool.query(
      `SELECT
         e.id,
         COALESCE(
           NULLIF(BTRIM(e.nome_exibicao), ''),
           e.nome
         ) AS nome,
         e.logo_url,
         e.cor_primaria,
         e.cor_destaque,
         e.cor_fundo,
         e.mostrar_valores,
         e.agenda_horario_inicio,
         e.agenda_horario_fim,
         e.agenda_intervalo,
         e.fuso_horario
       FROM empresas e
       WHERE e.slug_agendamento = $1
         AND e.ativo = TRUE
       LIMIT 1`,
      [slug]
    );

    if (!resultado.rows.length) {
      return res.status(404).json({
        erro: 'Empresa não encontrada ou indisponível.'
      });
    }

    const empresa = resultado.rows[0];

    const servicosResultado = await pool.query(
      `SELECT
         s.id,
         s.nome,
         s.duracao_min,
         CASE
           WHEN $2::boolean = TRUE THEN s.preco
           ELSE NULL
         END AS preco
       FROM servicos s
       WHERE s.empresa_id = $1
         AND s.ativo = TRUE
       ORDER BY s.nome ASC`,
      [empresa.id, empresa.mostrar_valores]
    );

    return res.status(200).json({
      empresa: {
        id: empresa.id,
        nome: empresa.nome,
        logo_url: empresa.logo_url,
        cor_primaria: empresa.cor_primaria,
        cor_destaque: empresa.cor_destaque,
        cor_fundo: empresa.cor_fundo,
        mostrar_valores: empresa.mostrar_valores,
        agenda_horario_inicio: empresa.agenda_horario_inicio,
        agenda_horario_fim: empresa.agenda_horario_fim,
        agenda_intervalo: empresa.agenda_intervalo,
        fuso_horario: empresa.fuso_horario
      },
      servicos: servicosResultado.rows
    });
  } catch (err) {
    console.error(
      'Erro ao carregar dados públicos de agendamento:',
      err.message
    );

    return res.status(500).json({
      erro: 'Não foi possível carregar os dados para agendamento.'
    });
  }
});

// ============================================================
// GET /api/public/agendamentos/:slug/horarios
// Consulta horários disponíveis para um serviço em uma data.
// ============================================================

router.get('/:slug/horarios', async (req, res) => {
  const { slug } = req.params;
  const data = String(req.query.data || '');
  const servicoId = String(req.query.servico_id || '');

  if (!validarSlugPublico(slug)) {
    return res.status(400).json({
      erro: 'Link de agendamento inválido.'
    });
  }

  if (!validarDataPublica(data)) {
    return res.status(400).json({
      erro: 'Informe uma data válida no formato AAAA-MM-DD.'
    });
  }

  if (!validarIdPublico(servicoId)) {
    return res.status(400).json({
      erro: 'Informe um serviço válido.'
    });
  }

  try {
    const empresaResult = await pool.query(
      `SELECT
         id,
         agenda_horario_inicio,
         agenda_horario_fim,
         agenda_intervalo,
         fuso_horario
       FROM empresas
       WHERE slug_agendamento = $1
         AND ativo = TRUE
       LIMIT 1`,
      [slug]
    );

    if (!empresaResult.rows.length) {
      return res.status(404).json({
        erro: 'Empresa não encontrada ou indisponível.'
      });
    }

    const empresa = empresaResult.rows[0];
    const empresaId = empresa.id;

    const servicoResult = await pool.query(
      `SELECT id, duracao_min
       FROM servicos
       WHERE id = $1
         AND empresa_id = $2
         AND ativo = TRUE
       LIMIT 1`,
      [servicoId, empresaId]
    );

    if (!servicoResult.rows.length) {
      return res.status(404).json({
        erro: 'Serviço não encontrado ou indisponível.'
      });
    }

    const duracao = Number(servicoResult.rows[0].duracao_min);
    const intervalo = Number(empresa.agenda_intervalo);

    if (
      !Number.isFinite(duracao) ||
      duracao <= 0 ||
      !Number.isFinite(intervalo) ||
      intervalo <= 0
    ) {
      return res.status(422).json({
        erro: 'A empresa precisa configurar a duração e o intervalo dos agendamentos.'
      });
    }

    const inicio = String(empresa.agenda_horario_inicio || '');
    const fim = String(empresa.agenda_horario_fim || '');

    if (!inicio || !fim || inicio >= fim) {
      return res.status(422).json({
        erro: 'O horário de funcionamento da empresa está inválido.'
      });
    }

    const inicioMinutos = paraMinutos(inicio);
    const fimMinutos = paraMinutos(fim);

    const ocupadosResult = await pool.query(
      `SELECT
         a.hora,
         COALESCE(s.duracao_min, $3::integer) AS duracao_min
       FROM agendamentos a
       LEFT JOIN servicos s
         ON s.id = a.servico_id
        AND s.empresa_id = a.empresa_id
       WHERE a.empresa_id = $1
         AND a.data = $2::date
         AND LOWER(BTRIM(a.status)) NOT IN (
           'cancelado',
           'cancelada'
         )
       ORDER BY a.hora`,
      [empresaId, data, intervalo]
    );

    const ocupados = ocupadosResult.rows.map((item) => {
      const inicioOcupado = paraMinutos(
        String(item.hora).slice(0, 8)
      );

      const duracaoOcupada = Number(item.duracao_min);

      return {
        inicio: inicioOcupado,
        fim: inicioOcupado + (
          Number.isFinite(duracaoOcupada) && duracaoOcupada > 0
            ? duracaoOcupada
            : intervalo
        )
      };
    });

    const hojeResult = await pool.query(
      `SELECT
         (CURRENT_TIMESTAMP AT TIME ZONE $1)::date::text AS hoje,
         TO_CHAR(
           CURRENT_TIMESTAMP AT TIME ZONE $1,
           'HH24:MI'
         ) AS hora_atual`,
      [empresa.fuso_horario || 'America/Sao_Paulo']
    );

    const hoje = hojeResult.rows[0].hoje;
    const minutosAgora = paraMinutos(
      hojeResult.rows[0].hora_atual
    );

    if (data < hoje) {
      return res.json({
        data,
        servico_id: servicoId,
        horarios: []
      });
    }

    const horarios = [];

    for (
      let minuto = inicioMinutos;
      minuto + duracao <= fimMinutos;
      minuto += intervalo
    ) {
      if (data === hoje && minuto <= minutosAgora) {
        continue;
      }

      const conflito = ocupados.some((ocupado) =>
        minuto < ocupado.fim &&
        minuto + duracao > ocupado.inicio
      );

      if (conflito) {
        continue;
      }

      const horas = String(
        Math.floor(minuto / 60)
      ).padStart(2, '0');

      const minutos = String(
        minuto % 60
      ).padStart(2, '0');

      horarios.push(`${horas}:${minutos}`);
    }

    return res.json({
      data,
      servico_id: servicoId,
      duracao_min: duracao,
      horarios
    });
  } catch (err) {
    console.error(
      'Erro ao consultar horários públicos:',
      err.message
    );

    return res.status(500).json({
      erro: 'Não foi possível consultar os horários disponíveis.'
    });
  }
});

// ============================================================
// POST /api/public/agendamentos/:slug
// Cria um agendamento sem exigir login.
// Aceita "nome" (formulário público) e "cliente" (compatibilidade).
// ============================================================

router.post('/:slug', async (req, res) => {
  const { slug } = req.params;

  const {
    nome,
    cliente: clienteRecebido,
    telefone,
    servico_id,
    data,
    hora,
    observacoes
  } = req.body || {};

  if (!validarSlugPublico(slug)) {
    return res.status(400).json({
      erro: 'Link de agendamento inválido.'
    });
  }

  // O formulário público envia "nome".
  // Mantemos "cliente" como alternativa para compatibilidade.
  const nomeCliente = String(
    nome ?? clienteRecebido ?? ''
  ).trim();

  const telefoneCliente = String(telefone || '').trim();
  const observacoesCliente = String(observacoes || '').trim();
  const servicoId = String(servico_id || '');
  const dataReserva = String(data || '');
  const horaReserva = String(hora || '');

  if (!nomeCliente || nomeCliente.length > 150) {
    return res.status(400).json({
      erro: 'Informe um nome válido de até 150 caracteres.'
    });
  }

  if (!telefoneCliente || telefoneCliente.length > 30) {
    return res.status(400).json({
      erro: 'Informe um telefone válido de até 30 caracteres.'
    });
  }

  if (observacoesCliente.length > 1000) {
    return res.status(400).json({
      erro: 'As observações devem ter no máximo 1000 caracteres.'
    });
  }

  if (!validarIdPublico(servicoId)) {
    return res.status(400).json({
      erro: 'Selecione um serviço válido.'
    });
  }

  if (!validarDataPublica(dataReserva)) {
    return res.status(400).json({
      erro: 'Informe uma data válida.'
    });
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horaReserva)) {
    return res.status(400).json({
      erro: 'Informe um horário válido no formato HH:MM.'
    });
  }

  let client;

  try {
    client = await pool.connect();

    await client.query('BEGIN');

    // Resolve o slug para o ID interno da empresa.
    const empresaResult = await client.query(
      `SELECT
         id,
         agenda_horario_inicio,
         agenda_horario_fim,
         agenda_intervalo,
         fuso_horario
       FROM empresas
       WHERE slug_agendamento = $1
         AND ativo = TRUE
       LIMIT 1`,
      [slug]
    );

    if (!empresaResult.rows.length) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        erro: 'Empresa não encontrada ou indisponível.'
      });
    }

    const empresa = empresaResult.rows[0];
    const empresaId = empresa.id;

    // Serializa reservas da mesma empresa e data.
    // O bloqueio permanece até COMMIT ou ROLLBACK.
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtext($1),
         hashtext($2)
       )`,
      [String(empresaId), dataReserva]
    );

    const servicoResult = await client.query(
      `SELECT id, nome, preco, duracao_min
       FROM servicos
       WHERE id = $1
         AND empresa_id = $2
         AND ativo = TRUE
       LIMIT 1`,
      [servicoId, empresaId]
    );

    if (!servicoResult.rows.length) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        erro: 'Serviço não encontrado ou indisponível.'
      });
    }

    const servico = servicoResult.rows[0];
    const duracao = Number(servico.duracao_min);
    const intervalo = Number(empresa.agenda_intervalo);

    if (
      !Number.isFinite(duracao) ||
      duracao <= 0 ||
      !Number.isFinite(intervalo) ||
      intervalo <= 0
    ) {
      await client.query('ROLLBACK');

      return res.status(422).json({
        erro: 'A empresa possui configurações de agendamento inválidas.'
      });
    }

    const inicioExpediente = paraMinutos(
      empresa.agenda_horario_inicio
    );

    const fimExpediente = paraMinutos(
      empresa.agenda_horario_fim
    );

    const inicioReserva = paraMinutos(horaReserva);
    const fimReserva = inicioReserva + duracao;

    if (
      inicioReserva < inicioExpediente ||
      fimReserva > fimExpediente ||
      (inicioReserva - inicioExpediente) % intervalo !== 0
    ) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'O horário solicitado não está disponível.'
      });
    }

    const dataHoraResult = await client.query(
      `SELECT
         (CURRENT_TIMESTAMP AT TIME ZONE $1)::date::text AS hoje,
         TO_CHAR(
           CURRENT_TIMESTAMP AT TIME ZONE $1,
           'HH24:MI'
         ) AS hora_atual`,
      [empresa.fuso_horario || 'America/Sao_Paulo']
    );

    const agora = dataHoraResult.rows[0];

    if (
      dataReserva < agora.hoje ||
      (
        dataReserva === agora.hoje &&
        inicioReserva <= paraMinutos(agora.hora_atual)
      )
    ) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'Não é possível reservar um horário no passado.'
      });
    }

    const conflitos = await client.query(
      `SELECT
         a.id,
         a.hora,
         COALESCE(s.duracao_min, $3::integer) AS duracao_min
       FROM agendamentos a
       LEFT JOIN servicos s
         ON s.id = a.servico_id
        AND s.empresa_id = a.empresa_id
       WHERE a.empresa_id = $1
         AND a.data = $2::date
         AND LOWER(BTRIM(a.status)) NOT IN (
           'cancelado',
           'cancelada'
         )
       FOR UPDATE OF a`,
      [empresaId, dataReserva, intervalo]
    );

    const temConflito = conflitos.rows.some((agendamento) => {
      const inicioExistente = paraMinutos(
        String(agendamento.hora).slice(0, 8)
      );

      const duracaoExistente = Number(agendamento.duracao_min);

      const fimExistente = inicioExistente + (
        Number.isFinite(duracaoExistente) && duracaoExistente > 0
          ? duracaoExistente
          : intervalo
      );

      return (
        inicioReserva < fimExistente &&
        fimReserva > inicioExistente
      );
    });

    if (temConflito) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'Esse horário acabou de ficar indisponível. Escolha outro.'
      });
    }

    const insercao = await client.query(
      `INSERT INTO agendamentos (
         empresa_id,
         cliente_id,
         cliente,
         telefone,
         servico_id,
         data,
         hora,
         valor,
         status,
         status_pagamento,
         observacoes
       )
       VALUES (
         $1, NULL, $2, $3, $4, $5::date, $6::time,
         $7, 'agendado', 'pendente', $8
       )
       RETURNING
         id,
         cliente,
         servico_id,
         data,
         hora,
         valor,
         status`,
      [
        empresaId,
        nomeCliente,
        telefoneCliente,
        servico.id,
        dataReserva,
        horaReserva,
        servico.preco,
        observacoesCliente || null
      ]
    );

    await client.query('COMMIT');

    const reserva = insercao.rows[0];

    // Retorna o ID tanto na raiz quanto dentro de "agendamento".
    // O formulário consegue exibir o número da reserva.
    return res.status(201).json({
      mensagem: 'Agendamento registrado com sucesso.',
      id: reserva.id,
      agendamento_id: reserva.id,
      agendamento: {
        id: reserva.id,
        cliente: reserva.cliente,
        servico_id: reserva.servico_id,
        servico_nome: servico.nome,
        data: reserva.data,
        hora: reserva.hora,
        valor: reserva.valor,
        status: reserva.status
      }
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (erroRollback) {
        console.error(
          'Erro ao desfazer transação:',
          erroRollback.message
        );
      }
    }

    console.error(
      'Erro ao criar agendamento público:',
      err.message
    );

    return res.status(500).json({
      erro: 'Não foi possível registrar o agendamento.'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

module.exports = router;
