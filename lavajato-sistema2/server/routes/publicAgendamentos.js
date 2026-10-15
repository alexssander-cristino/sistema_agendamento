
'use strict';

const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

const router = express.Router();

// ============================================================
// CONFIGURAÇÕES E HELPERS
// ============================================================

const STATUS_CANCELADOS = ['cancelado', 'cancelada'];

function validarSlugPublico(slug) {
  return (
    typeof slug === 'string' &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

function validarDataPublica(data) {
  if (
    typeof data !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data)
  ) {
    return false;
  }

  const [ano, mes, dia] = data.split('-').map(Number);
  const dataUTC = new Date(Date.UTC(ano, mes - 1, dia));

  return (
    dataUTC.getUTCFullYear() === ano &&
    dataUTC.getUTCMonth() === mes - 1 &&
    dataUTC.getUTCDate() === dia
  );
}

function validarIdPublico(valor) {
  return (
    (typeof valor === 'string' || typeof valor === 'number') &&
    /^[1-9]\d{0,18}$/.test(String(valor))
  );
}

function paraMinutos(hora) {
  if (typeof hora !== 'string') {
    return null;
  }

  const partes = hora.split(':');
  const horas = Number(partes[0]);
  const minutos = Number(partes[1]);

  if (
    partes.length < 2 ||
    !Number.isInteger(horas) ||
    !Number.isInteger(minutos) ||
    horas < 0 ||
    horas > 23 ||
    minutos < 0 ||
    minutos > 59
  ) {
    return null;
  }

  return horas * 60 + minutos;
}

function formatarHora(minutos) {
  const horas = Math.floor(minutos / 60);
  const restante = minutos % 60;

  return (
    String(horas).padStart(2, '0') +
    ':' +
    String(restante).padStart(2, '0')
  );
}

function normalizarHora(hora) {
  if (typeof hora !== 'string') {
    return null;
  }

  const resultado = hora.match(/^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);

  if (!resultado) {
    return null;
  }

  const horas = Number(resultado[1]);
  const minutos = Number(resultado[2]);

  if (horas > 23 || minutos > 59) {
    return null;
  }

  return `${resultado[1]}:${resultado[2]}`;
}

function obterDataHoraLocal(timeZone) {
  try {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date());

    const valores = {};

    for (const parte of partes) {
      if (parte.type !== 'literal') {
        valores[parte.type] = parte.value;
      }
    }

    return {
      data: `${valores.year}-${valores.month}-${valores.day}`,
      hora: `${valores.hour}:${valores.minute}`
    };
  } catch {
    const agora = new Date();

    return {
      data: agora.toISOString().slice(0, 10),
      hora: agora.toISOString().slice(11, 16)
    };
  }
}

function gerarTokenCancelamento() {
  return crypto.randomBytes(32).toString('hex');
}

function gerarHashToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

function validarTokenCancelamento(token) {
  return (
    typeof token === 'string' &&
    /^[a-f0-9]{64}$/i.test(token)
  );
}

function validarTexto(valor, maximo) {
  return (
    typeof valor === 'string' &&
    valor.trim().length > 0 &&
    valor.trim().length <= maximo
  );
}

function mensagemErro(res, status, mensagem) {
  return res.status(status).json({
    sucesso: false,
    mensagem
  });
}

function estaCancelado(status) {
  return STATUS_CANCELADOS.includes(
    String(status || '').trim().toLowerCase()
  );
}

// ============================================================
// GET - DADOS PÚBLICOS DA EMPRESA E SERVIÇOS
// GET /api/public/agendamentos/:slug
// ============================================================

router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    if (!validarSlugPublico(slug)) {
      return mensagemErro(
        res,
        400,
        'Endereço de agendamento inválido.'
      );
    }

    const empresaResult = await pool.query(
      `
      SELECT *
      FROM empresas
      WHERE slug_agendamento = $1
        AND ativo = TRUE
      LIMIT 1
      `,
      [slug]
    );

    if (empresaResult.rows.length === 0) {
      return mensagemErro(
        res,
        404,
        'Página de agendamento não encontrada ou indisponível.'
      );
    }

    const empresa = empresaResult.rows[0];

    const servicosResult = await pool.query(
      `
      SELECT
        id,
        nome,
        descricao,
        duracao_min,
        preco
      FROM servicos
      WHERE empresa_id = $1
        AND ativo = TRUE
      ORDER BY nome ASC
      `,
      [empresa.id]
    );

    return res.json({
      sucesso: true,
      empresa: {
        id: empresa.id,
        nome: empresa.nome,
        slug_agendamento: empresa.slug_agendamento,
        logo: empresa.logo_url || empresa.logo || null,
        cor_primaria: empresa.cor_primaria || null,
        cor_destaque: empresa.cor_destaque || null,
        cor_fundo: empresa.cor_fundo || null,
        agenda_horario_inicio:
          empresa.agenda_horario_inicio || '08:00',
        agenda_horario_fim:
          empresa.agenda_horario_fim || '18:00',
        agenda_intervalo:
          Number(empresa.agenda_intervalo) || 30,
        fuso_horario:
          empresa.fuso_horario || 'America/Sao_Paulo'
      },
      servicos: servicosResult.rows
    });
  } catch (erro) {
    console.error(
      '[AGENDAMENTO PUBLICO] Erro ao carregar página:',
      erro
    );

    return mensagemErro(
      res,
      500,
      'Não foi possível carregar a página de agendamento.'
    );
  }
});

// ============================================================
// GET - HORÁRIOS DISPONÍVEIS
// GET /api/public/agendamentos/:slug/horarios
// ============================================================

router.get('/:slug/horarios', async (req, res) => {
  try {
    const { slug } = req.params;
    const { data, servico_id } = req.query;

    if (!validarSlugPublico(slug)) {
      return mensagemErro(
        res,
        400,
        'Endereço de agendamento inválido.'
      );
    }

    if (!validarDataPublica(data)) {
      return mensagemErro(
        res,
        400,
        'Informe uma data válida no formato AAAA-MM-DD.'
      );
    }

    if (!validarIdPublico(servico_id)) {
      return mensagemErro(
        res,
        400,
        'Selecione um serviço válido.'
      );
    }

    const empresaResult = await pool.query(
      `
      SELECT *
      FROM empresas
      WHERE slug_agendamento = $1
        AND ativo = TRUE
      LIMIT 1
      `,
      [slug]
    );

    if (empresaResult.rows.length === 0) {
      return mensagemErro(
        res,
        404,
        'Página de agendamento não encontrada.'
      );
    }

    const empresa = empresaResult.rows[0];

    const servicoResult = await pool.query(
      `
      SELECT id, nome, duracao_min, preco
      FROM servicos
      WHERE id = $1
        AND empresa_id = $2
        AND ativo = TRUE
      LIMIT 1
      `,
      [servico_id, empresa.id]
    );

    if (servicoResult.rows.length === 0) {
      return mensagemErro(
        res,
        404,
        'Serviço não encontrado ou indisponível.'
      );
    }

    const servico = servicoResult.rows[0];

    const duracao = Number(servico.duracao_min);
    const inicio = paraMinutos(
      String(empresa.agenda_horario_inicio || '08:00').slice(0, 5)
    );
    const fim = paraMinutos(
      String(empresa.agenda_horario_fim || '18:00').slice(0, 5)
    );
    const intervalo = Number(empresa.agenda_intervalo) || 30;

    if (
      !Number.isInteger(duracao) ||
      duracao <= 0 ||
      inicio === null ||
      fim === null ||
      fim <= inicio ||
      !Number.isInteger(intervalo) ||
      intervalo <= 0
    ) {
      console.error(
        '[AGENDAMENTO PUBLICO] Configuração de horário inválida:',
        empresa.id
      );

      return mensagemErro(
        res,
        500,
        'Os horários desta empresa estão configurados incorretamente.'
      );
    }

    const horariosResult = await pool.query(
      `
      SELECT
        a.id,
        a.hora,
        COALESCE(s.duracao_min, 30) AS duracao_min
      FROM agendamentos a
      LEFT JOIN servicos s
        ON s.id = a.servico_id
       AND s.empresa_id = a.empresa_id
      WHERE a.empresa_id = $1
        AND a.data = $2::date
        AND LOWER(BTRIM(COALESCE(a.status, '')))
            NOT IN ('cancelado', 'cancelada')
      `,
      [empresa.id, data]
    );

    const ocupados = horariosResult.rows
      .map((agendamento) => {
        const inicioOcupado = paraMinutos(
          String(agendamento.hora).slice(0, 5)
        );

        if (inicioOcupado === null) {
          return null;
        }

        return {
          inicio: inicioOcupado,
          fim:
            inicioOcupado +
            Math.max(1, Number(agendamento.duracao_min) || 30)
        };
      })
      .filter(Boolean);

    const agoraLocal = obterDataHoraLocal(
      empresa.fuso_horario || 'America/Sao_Paulo'
    );

    const horarios = [];

    for (
      let minuto = inicio;
      minuto + duracao <= fim;
      minuto += intervalo
    ) {
      const final = minuto + duracao;

      if (
        data === agoraLocal.data &&
        minuto <= paraMinutos(agoraLocal.hora)
      ) {
        continue;
      }

      const conflito = ocupados.some((ocupado) => (
        minuto < ocupado.fim &&
        final > ocupado.inicio
      ));

      if (!conflito) {
        horarios.push(formatarHora(minuto));
      }
    }

    return res.json({
      sucesso: true,
      data,
      servico_id: servico.id,
      duracao_min: duracao,
      horarios
    });
  } catch (erro) {
    console.error(
      '[AGENDAMENTO PUBLICO] Erro ao consultar horários:',
      erro
    );

    return mensagemErro(
      res,
      500,
      'Não foi possível consultar os horários disponíveis.'
    );
  }
});

// ============================================================
// POST - CRIAR AGENDAMENTO PÚBLICO
// POST /api/public/agendamentos/:slug
// ============================================================

router.post('/:slug', async (req, res) => {
  const conexao = await pool.connect();

  try {
    const { slug } = req.params;

    const nome = String(
      req.body?.nome ?? req.body?.cliente ?? ''
    ).trim();

    const telefone = String(
      req.body?.telefone ?? ''
    ).trim();

    const servico_id = req.body?.servico_id;
    const data = req.body?.data;
    const horaRecebida = req.body?.hora;

    const hora = normalizarHora(
      typeof horaRecebida === 'string'
        ? horaRecebida
        : ''
    );

    const observacoes = String(
      req.body?.observacoes ?? ''
    ).trim();

    if (!validarSlugPublico(slug)) {
      return mensagemErro(
        res,
        400,
        'Endereço de agendamento inválido.'
      );
    }

    if (!validarTexto(nome, 150)) {
      return mensagemErro(
        res,
        400,
        'Informe seu nome, com até 150 caracteres.'
      );
    }

    if (!validarTexto(telefone, 30)) {
      return mensagemErro(
        res,
        400,
        'Informe um telefone válido.'
      );
    }

    if (!validarIdPublico(servico_id)) {
      return mensagemErro(
        res,
        400,
        'Selecione um serviço válido.'
      );
    }

    if (!validarDataPublica(data)) {
      return mensagemErro(
        res,
        400,
        'Informe uma data válida.'
      );
    }

    if (!hora) {
      return mensagemErro(
        res,
        400,
        'Informe um horário válido.'
      );
    }

    if (observacoes.length > 1000) {
      return mensagemErro(
        res,
        400,
        'As observações devem ter até 1000 caracteres.'
      );
    }

    await conexao.query('BEGIN');

    const empresaResult = await conexao.query(
      `
      SELECT *
      FROM empresas
      WHERE slug_agendamento = $1
        AND ativo = TRUE
      LIMIT 1
      `,
      [slug]
    );

    if (empresaResult.rows.length === 0) {
      await conexao.query('ROLLBACK');

      return mensagemErro(
        res,
        404,
        'Página de agendamento não encontrada.'
      );
    }

    const empresa = empresaResult.rows[0];

    // Serializa as operações de agendamento da empresa no dia.
    await conexao.query(
      `
      SELECT pg_advisory_xact_lock(
        hashtext($1),
        hashtext($2)
      )
      `,
      [String(empresa.id), data]
    );

    const servicoResult = await conexao.query(
      `
      SELECT id, nome, duracao_min, preco
      FROM servicos
      WHERE id = $1
        AND empresa_id = $2
        AND ativo = TRUE
      LIMIT 1
      `,
      [servico_id, empresa.id]
    );

    if (servicoResult.rows.length === 0) {
      await conexao.query('ROLLBACK');

      return mensagemErro(
        res,
        404,
        'Serviço não encontrado ou indisponível.'
      );
    }

    const servico = servicoResult.rows[0];

    const inicio = paraMinutos(
      String(empresa.agenda_horario_inicio || '08:00').slice(0, 5)
    );

    const fim = paraMinutos(
      String(empresa.agenda_horario_fim || '18:00').slice(0, 5)
    );

    const intervalo = Number(empresa.agenda_intervalo) || 30;
    const duracao = Number(servico.duracao_min);
    const minutoEscolhido = paraMinutos(hora);

    if (
      !Number.isInteger(duracao) ||
      duracao <= 0 ||
      inicio === null ||
      fim === null ||
      fim <= inicio ||
      !Number.isInteger(intervalo) ||
      intervalo <= 0
    ) {
      await conexao.query('ROLLBACK');

      return mensagemErro(
        res,
        500,
        'Os horários desta empresa estão configurados incorretamente.'
      );
    }

    if (
      minutoEscolhido < inicio ||
      minutoEscolhido + duracao > fim
    ) {
      await conexao.query('ROLLBACK');

      return mensagemErro(
        res,
        400,
        'O horário escolhido está fora do expediente.'
      );
    }

    if ((minutoEscolhido - inicio) % intervalo !== 0) {
      await conexao.query('ROLLBACK');

      return mensagemErro(
        res,
        400,
        'O horário escolhido não corresponde aos intervalos disponíveis.'
      );
    }

    const agoraLocal = obterDataHoraLocal(
      empresa.fuso_horario || 'America/Sao_Paulo'
    );

    if (
      data < agoraLocal.data ||
      (
        data === agoraLocal.data &&
        minutoEscolhido <= paraMinutos(agoraLocal.hora)
      )
    ) {
      await conexao.query('ROLLBACK');

      return mensagemErro(
        res,
        400,
        'Não é possível agendar para uma data ou horário passado.'
      );
    }

    // Verifica conflitos considerando a duração de cada serviço.
    const conflitosResult = await conexao.query(
      `
      SELECT
        a.id,
        a.hora,
        COALESCE(s.duracao_min, 30) AS duracao_min
      FROM agendamentos a
      LEFT JOIN servicos s
        ON s.id = a.servico_id
       AND s.empresa_id = a.empresa_id
      WHERE a.empresa_id = $1
        AND a.data = $2::date
        AND LOWER(BTRIM(COALESCE(a.status, '')))
            NOT IN ('cancelado', 'cancelada')
      FOR UPDATE OF a
      `,
      [empresa.id, data]
    );

    const conflito = conflitosResult.rows.some((agendamento) => {
      const inicioExistente = paraMinutos(
        String(agendamento.hora).slice(0, 5)
      );

      if (inicioExistente === null) {
        return false;
      }

      const fimExistente =
        inicioExistente +
        Math.max(1, Number(agendamento.duracao_min) || 30);

      return (
        minutoEscolhido < fimExistente &&
        minutoEscolhido + duracao > inicioExistente
      );
    });

    if (conflito) {
      await conexao.query('ROLLBACK');

      return mensagemErro(
        res,
        409,
        'Esse horário acabou de ficar indisponível. Escolha outro horário.'
      );
    }

    // O token original só será enviado ao cliente.
    // No banco, será armazenado exclusivamente o hash.
    const tokenCancelamento = gerarTokenCancelamento();
    const tokenCancelamentoHash = gerarHashToken(
      tokenCancelamento
    );

    const agendamentoResult = await conexao.query(
      `
      INSERT INTO agendamentos (
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
        observacoes,
        token_cancelamento_hash
      )
      VALUES (
        $1, NULL, $2, $3, $4, $5::date, $6::time,
        $7, 'agendado', 'pendente', $8, $9
      )
      RETURNING
        id,
        cliente,
        telefone,
        servico_id,
        data,
        hora,
        valor,
        status
      `,
      [
        empresa.id,
        nome,
        telefone,
        servico.id,
        data,
        hora,
        servico.preco,
        observacoes || null,
        tokenCancelamentoHash
      ]
    );

    const agendamento = agendamentoResult.rows[0];

    await conexao.query('COMMIT');

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Agendamento realizado com sucesso.',
      id: agendamento.id,
      agendamento_id: agendamento.id,
      token_cancelamento: tokenCancelamento,
      agendamento: {
        id: agendamento.id,
        cliente: agendamento.cliente,
        telefone: agendamento.telefone,
        servico_id: agendamento.servico_id,
        servico_nome: servico.nome,
        data: agendamento.data,
        hora: String(agendamento.hora).slice(0, 5),
        valor: agendamento.valor,
        status: agendamento.status
      }
    });
  } catch (erro) {
    try {
      await conexao.query('ROLLBACK');
    } catch (erroRollback) {
      console.error(
        '[AGENDAMENTO PUBLICO] Erro no rollback:',
        erroRollback
      );
    }

    console.error(
      '[AGENDAMENTO PUBLICO] Erro ao criar agendamento:',
      erro
    );

    return mensagemErro(
      res,
      500,
      'Não foi possível realizar o agendamento.'
    );
  } finally {
    conexao.release();
  }
});

// ============================================================
// POST - CANCELAR AGENDAMENTO COM TOKEN
// POST /api/public/agendamentos/:slug/cancelar/:token
// ============================================================

router.post('/:slug/cancelar/:token', async (req, res) => {
  const conexao = await pool.connect();

  try {
    const { slug, token } = req.params;

    if (!validarSlugPublico(slug)) {
      return mensagemErro(
        res,
        400,
        'Endereço de agendamento inválido.'
      );
    }

    if (!validarTokenCancelamento(token)) {
      return mensagemErro(
        res,
        400,
        'Token de cancelamento inválido.'
      );
    }

    const tokenHash = gerarHashToken(token);

    await conexao.query('BEGIN');

    const empresaResult = await conexao.query(
      `
      SELECT id
      FROM empresas
      WHERE slug_agendamento = $1
        AND ativo = TRUE
      LIMIT 1
      `,
      [slug]
    );

    if (empresaResult.rows.length === 0) {
      await conexao.query('ROLLBACK');

      return mensagemErro(
        res,
        404,
        'Agendamento não encontrado ou indisponível.'
      );
    }

    const empresaId = empresaResult.rows[0].id;

    // Primeiro localiza o agendamento pelo hash secreto.
    // O ID público, isoladamente, nunca autoriza o cancelamento.
    const buscaResult = await conexao.query(
      `
      SELECT id, data
      FROM agendamentos
      WHERE empresa_id = $1
        AND token_cancelamento_hash = $2
      LIMIT 1
      `,
      [empresaId, tokenHash]
    );

    if (buscaResult.rows.length === 0) {
      await conexao.query('ROLLBACK');

      return mensagemErro(
        res,
        404,
        'Token inválido ou agendamento não encontrado.'
      );
    }

    const agendamentoEncontrado = buscaResult.rows[0];
    const dataAgendamento = String(
      agendamentoEncontrado.data
    ).slice(0, 10);

    // Usa o mesmo bloqueio da criação para evitar concorrência.
    await conexao.query(
      `
      SELECT pg_advisory_xact_lock(
        hashtext($1),
        hashtext($2)
      )
      `,
      [String(empresaId), dataAgendamento]
    );

    // Revalida e bloqueia a linha antes de atualizar.
    const agendamentoResult = await conexao.query(
      `
      SELECT
        id,
        cliente,
        servico_id,
        data,
        hora,
        valor,
        status
      FROM agendamentos
      WHERE id = $1
        AND empresa_id = $2
        AND token_cancelamento_hash = $3
      FOR UPDATE
      `,
      [
        agendamentoEncontrado.id,
        empresaId,
        tokenHash
      ]
    );

    if (agendamentoResult.rows.length === 0) {
      await conexao.query('ROLLBACK');

      return mensagemErro(
        res,
        404,
        'Token inválido ou agendamento não encontrado.'
      );
    }

    const agendamento = agendamentoResult.rows[0];

    if (estaCancelado(agendamento.status)) {
      await conexao.query('ROLLBACK');

      return mensagemErro(
        res,
        409,
        'Este agendamento já foi cancelado.'
      );
    }

    const cancelamentoResult = await conexao.query(
      `
      UPDATE agendamentos
      SET status = 'cancelado'
      WHERE id = $1
        AND empresa_id = $2
        AND token_cancelamento_hash = $3
      RETURNING id, status
      `,
      [
        agendamento.id,
        empresaId,
        tokenHash
      ]
    );

    if (cancelamentoResult.rows.length === 0) {
      await conexao.query('ROLLBACK');

      return mensagemErro(
        res,
        409,
        'Não foi possível cancelar este agendamento.'
      );
    }

    await conexao.query('COMMIT');

    return res.json({
      sucesso: true,
      mensagem: 'Agendamento cancelado com sucesso.',
      agendamento: {
        id: agendamento.id,
        cliente: agendamento.cliente,
        servico_id: agendamento.servico_id,
        data: String(agendamento.data).slice(0, 10),
        hora: String(agendamento.hora).slice(0, 5),
        valor: agendamento.valor,
        status: 'cancelado'
      }
    });
  } catch (erro) {
    try {
      await conexao.query('ROLLBACK');
    } catch (erroRollback) {
      console.error(
        '[CANCELAMENTO PUBLICO] Erro no rollback:',
        erroRollback
      );
    }

    console.error(
      '[CANCELAMENTO PUBLICO] Erro ao cancelar agendamento:',
      erro
    );

    return mensagemErro(
      res,
      500,
      'Não foi possível cancelar o agendamento.'
    );
  } finally {
    conexao.release();
  }
});

module.exports = router;
