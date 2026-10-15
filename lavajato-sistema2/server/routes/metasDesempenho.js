
const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);

function obterEmpresaId(req) {
  const id = Number(req.usuario?.empresa_id);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validarMes(mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ''))) {
    return false;
  }

  const [ano, numeroMes] = mes.split('-').map(Number);

  return (
    ano >= 2000 &&
    numeroMes >= 1 &&
    numeroMes <= 12
  );
}

function normalizarMes(mes) {
  return `${mes}-01`;
}

function numeroNaoNegativo(valor) {
  if (valor === undefined || valor === null || valor === '') {
    return null;
  }

  const numero = Number(valor);

  if (!Number.isFinite(numero) || numero < 0) {
    return null;
  }

  return numero;
}

function periodoDoMes(mes) {
  const [ano, numeroMes] = mes.split('-').map(Number);

  const inicio = `${mes}-01`;

  const proximoAno =
    numeroMes === 12 ? ano + 1 : ano;

  const proximoMes =
    numeroMes === 12 ? 1 : numeroMes + 1;

  const fimExclusivo =
    `${proximoAno}-${String(proximoMes).padStart(2, '0')}-01`;

  return { inicio, fimExclusivo };
}

// Retorna apenas dados efetivamente realizados.
// Um atendimento conta para as metas quando foi concluído
// e seu pagamento foi confirmado.
const SQL_REALIZADO = `
  SELECT
    COUNT(*)::INTEGER AS atendimentos,
    COALESCE(SUM(valor), 0)::NUMERIC AS faturamento
  FROM agendamentos
  WHERE empresa_id = $1
    AND data >= $2::date
    AND data < $3::date
    AND LOWER(COALESCE(status, '')) IN ('concluido', 'concluído')
    AND LOWER(COALESCE(status_pagamento, '')) = 'pago'
`;

router.get('/', async (req, res) => {
  const empresaId = obterEmpresaId(req);

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

  const mes = String(req.query.mes || new Date().toISOString().slice(0, 7));

  if (!validarMes(mes)) {
    return res.status(400).json({
      erro: 'Informe um mês válido no formato AAAA-MM.'
    });
  }

  try {
    const { inicio, fimExclusivo } = periodoDoMes(mes);

    const [metaResult, realizadoResult, diarioResult, mensalResult] =
      await Promise.all([
        pool.query(
          `SELECT
             meta_faturamento,
             meta_atendimentos,
             meta_ticket_medio
           FROM metas_desempenho
           WHERE empresa_id = $1
             AND mes = $2::date
           LIMIT 1`,
          [empresaId, normalizarMes(mes)]
        ),

        pool.query(SQL_REALIZADO, [
          empresaId,
          inicio,
          fimExclusivo
        ]),

        pool.query(
          `SELECT
             TO_CHAR(dia::date, 'YYYY-MM-DD') AS data,
             COALESCE(SUM(a.valor), 0)::NUMERIC AS faturamento,
             COUNT(a.id)::INTEGER AS atendimentos
           FROM GENERATE_SERIES(
             $2::date,
             LEAST(
               ($3::date - INTERVAL '1 day')::date,
               CURRENT_DATE
             ),
             INTERVAL '1 day'
           ) AS dia
           LEFT JOIN agendamentos a
             ON a.empresa_id = $1
            AND a.data = dia::date
            AND LOWER(COALESCE(a.status, '')) IN ('concluido', 'concluído')
            AND LOWER(COALESCE(a.status_pagamento, '')) = 'pago'
           GROUP BY dia
           ORDER BY dia`,
          [empresaId, inicio, fimExclusivo]
        ),

        pool.query(
          `SELECT
             TO_CHAR(mes_ref, 'YYYY-MM') AS mes,
             COALESCE(SUM(a.valor), 0)::NUMERIC AS faturamento,
             COUNT(a.id)::INTEGER AS atendimentos
           FROM GENERATE_SERIES(
             DATE_TRUNC('month', $2::date) - INTERVAL '5 months',
             DATE_TRUNC('month', $2::date),
             INTERVAL '1 month'
           ) AS mes_ref
           LEFT JOIN agendamentos a
             ON a.empresa_id = $1
            AND a.data >= mes_ref::date
            AND a.data < (mes_ref + INTERVAL '1 month')::date
            AND LOWER(COALESCE(a.status, '')) IN ('concluido', 'concluído')
            AND LOWER(COALESCE(a.status_pagamento, '')) = 'pago'
           GROUP BY mes_ref
           ORDER BY mes_ref`,
          [empresaId, inicio]
        )
      ]);

    const meta = metaResult.rows[0] || {
      meta_faturamento: 0,
      meta_atendimentos: 0,
      meta_ticket_medio: 0
    };

    const realizado = realizadoResult.rows[0];
    const faturamento = Number(realizado.faturamento || 0);
    const atendimentos = Number(realizado.atendimentos || 0);
    const ticketMedio = atendimentos > 0
      ? faturamento / atendimentos
      : 0;

    function progresso(real, objetivo) {
      const metaNumero = Number(objetivo || 0);

      return {
        realizado: Number(real.toFixed(2)),
        meta: metaNumero,
        falta: Number(Math.max(0, metaNumero - real).toFixed(2)),
        percentual: metaNumero > 0
          ? Number(((real / metaNumero) * 100).toFixed(1))
          : 0
      };
    }

    return res.json({
      mes,
      metas: {
        faturamento: Number(meta.meta_faturamento || 0),
        atendimentos: Number(meta.meta_atendimentos || 0),
        ticket_medio: Number(meta.meta_ticket_medio || 0)
      },
      resultados: {
        faturamento: progresso(
          faturamento,
          meta.meta_faturamento
        ),
        atendimentos: progresso(
          atendimentos,
          meta.meta_atendimentos
        ),
        ticket_medio: progresso(
          ticketMedio,
          meta.meta_ticket_medio
        )
      },
      evolucao_diaria: diarioResult.rows.map(item => ({
        data: item.data,
        faturamento: Number(item.faturamento || 0),
        atendimentos: Number(item.atendimentos || 0)
      })),
      evolucao_mensal: mensalResult.rows.map(item => ({
        mes: item.mes,
        faturamento: Number(item.faturamento || 0),
        atendimentos: Number(item.atendimentos || 0),
        ticket_medio: Number(item.atendimentos) > 0
          ? Number(item.faturamento) / Number(item.atendimentos)
          : 0
      }))
    });
  } catch (err) {
    console.error('Erro ao consultar metas e desempenho:', err);

    return res.status(500).json({
      erro: 'Não foi possível carregar as metas e o desempenho.'
    });
  }
});

router.put('/', async (req, res) => {
  const empresaId = obterEmpresaId(req);

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

  const body = req.body || {};
  const mes = String(body.mes || '');

  if (!validarMes(mes)) {
    return res.status(400).json({
      erro: 'Informe um mês válido no formato AAAA-MM.'
    });
  }

  const faturamento = numeroNaoNegativo(body.meta_faturamento);
  const atendimentos = numeroNaoNegativo(body.meta_atendimentos);
  const ticketMedio = numeroNaoNegativo(body.meta_ticket_medio);

  if (
    faturamento === null ||
    atendimentos === null ||
    ticketMedio === null
  ) {
    return res.status(400).json({
      erro: 'Informe valores numéricos iguais ou superiores a zero para todas as metas.'
    });
  }

  if (
    !Number.isSafeInteger(atendimentos) ||
    faturamento > 999999999999 ||
    ticketMedio > 999999999999
  ) {
    return res.status(400).json({
      erro: 'Um ou mais valores das metas estão fora do limite permitido.'
    });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO metas_desempenho (
         empresa_id,
         mes,
         meta_faturamento,
         meta_atendimentos,
         meta_ticket_medio,
         atualizado_em
       )
       VALUES ($1, $2::date, $3, $4, $5, NOW())
       ON CONFLICT (empresa_id, mes)
       DO UPDATE SET
         meta_faturamento = EXCLUDED.meta_faturamento,
         meta_atendimentos = EXCLUDED.meta_atendimentos,
         meta_ticket_medio = EXCLUDED.meta_ticket_medio,
         atualizado_em = NOW()
       RETURNING
         mes,
         meta_faturamento,
         meta_atendimentos,
         meta_ticket_medio`,
      [
        empresaId,
        normalizarMes(mes),
        faturamento,
        atendimentos,
        ticketMedio
      ]
    );

    return res.json({
      mensagem: 'Metas salvas com sucesso.',
      metas: rows[0]
    });
  } catch (err) {
    console.error('Erro ao salvar metas:', err);

    return res.status(500).json({
      erro: 'Não foi possível salvar as metas.'
    });
  }
});

module.exports = router;
