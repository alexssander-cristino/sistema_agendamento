
const express = require('express');
const pool = require('../db');

const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');

const router = express.Router();

// ============================================================
// MIDDLEWARES
// ============================================================

router.use(autenticar);
router.use(verificarAssinatura);

// ============================================================
// UTILITÁRIOS
// ============================================================

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

function dataLocalISO(data = new Date()) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');

  return `${ano}-${mes}-${dia}`;
}

function obterPeriodo(req) {
  const hoje = new Date();
  const hojeISO = dataLocalISO(hoje);

  const dataFim = req.query.data_fim || hojeISO;

  let dataInicio = req.query.data_inicio;

  if (!dataInicio) {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 29);
    dataInicio = dataLocalISO(inicio);
  }

  return {
    dataInicio,
    dataFim
  };
}

// ============================================================
// GET /api/dashboard
// ============================================================

router.get('/', async (req, res) => {
  const empresaId = req.usuario?.empresa_id;

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Empresa não identificada.'
    });
  }

  const {
    dataInicio,
    dataFim
  } = obterPeriodo(req);

  if (!validarData(dataInicio)) {
    return res.status(400).json({
      erro: 'Data inicial inválida.'
    });
  }

  if (!validarData(dataFim)) {
    return res.status(400).json({
      erro: 'Data final inválida.'
    });
  }

  if (dataInicio > dataFim) {
    return res.status(400).json({
      erro: 'A data inicial não pode ser maior que a data final.'
    });
  }

  try {
    // ========================================================
    // RESUMO DOS AGENDAMENTOS
    // ========================================================

    const resumoAgendamentos = await pool.query(
      `
        SELECT
          COUNT(*)::integer AS total,

          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(status, '')) IN (
              'concluido',
              'concluído',
              'finalizado',
              'finalizada'
            )
          )::integer AS concluidos,

          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(status, '')) IN (
              'cancelado',
              'cancelada'
            )
          )::integer AS cancelados,

          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(status, '')) NOT IN (
              'concluido',
              'concluído',
              'finalizado',
              'finalizada',
              'cancelado',
              'cancelada'
            )
          )::integer AS pendentes,

          COALESCE(
            SUM(
              CASE
                WHEN LOWER(COALESCE(status, '')) NOT IN (
                  'cancelado',
                  'cancelada'
                )
                THEN COALESCE(valor, 0)
                ELSE 0
              END
            ),
            0
          )::numeric AS faturamento,

          COALESCE(
            SUM(
              CASE
                WHEN LOWER(COALESCE(status_pagamento, '')) = 'pago'
                  AND LOWER(COALESCE(status, '')) NOT IN (
                    'cancelado',
                    'cancelada'
                  )
                THEN COALESCE(valor, 0)
                ELSE 0
              END
            ),
            0
          )::numeric AS valor_pago,

          COALESCE(
            SUM(
              CASE
                WHEN LOWER(COALESCE(status_pagamento, '')) <> 'pago'
                  AND LOWER(COALESCE(status, '')) NOT IN (
                    'cancelado',
                    'cancelada'
                  )
                THEN COALESCE(valor, 0)
                ELSE 0
              END
            ),
            0
          )::numeric AS valor_pendente

        FROM agendamentos

        WHERE empresa_id = $1
          AND data BETWEEN $2::date AND $3::date
      `,
      [empresaId, dataInicio, dataFim]
    );

    // ========================================================
    // RESUMO DAS DESPESAS
    // ========================================================

    const resumoDespesas = await pool.query(
      `
        SELECT
          COALESCE(SUM(valor), 0)::numeric AS total

        FROM despesas

        WHERE empresa_id = $1
          AND data BETWEEN $2::date AND $3::date
      `,
      [empresaId, dataInicio, dataFim]
    );

    // ========================================================
    // MOVIMENTAÇÃO DIÁRIA
    //
    // Retorna uma linha por dia, inclusive quando não houver
    // movimentação. Os valores são preparados para o gráfico.
    // ========================================================

    const movimentacao = await pool.query(
      `
        WITH dias AS (
          SELECT generate_series(
            $2::date,
            $3::date,
            INTERVAL '1 day'
          )::date AS data
        ),

        resumo_agendamentos AS (
          SELECT
            a.data,

            COALESCE(
              SUM(
                CASE
                  WHEN LOWER(COALESCE(a.status, '')) NOT IN (
                    'cancelado',
                    'cancelada'
                  )
                  THEN COALESCE(a.valor, 0)
                  ELSE 0
                END
              ),
              0
            )::numeric AS faturamento,

            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(a.status, '')) IN (
                'concluido',
                'concluído',
                'finalizado',
                'finalizada'
              )
            )::integer AS concluidos,

            COUNT(*) FILTER (
              WHERE LOWER(COALESCE(a.status, '')) NOT IN (
                'cancelado',
                'cancelada'
              )
            )::integer AS agendamentos

          FROM agendamentos a

          WHERE a.empresa_id = $1
            AND a.data BETWEEN $2::date AND $3::date

          GROUP BY a.data
        ),

        resumo_despesas AS (
          SELECT
            d.data,
            COALESCE(SUM(d.valor), 0)::numeric AS despesas

          FROM despesas d

          WHERE d.empresa_id = $1
            AND d.data BETWEEN $2::date AND $3::date

          GROUP BY d.data
        )

        SELECT
          TO_CHAR(dias.data, 'YYYY-MM-DD') AS data,

          COALESCE(
            ra.faturamento,
            0
          )::numeric AS faturamento,

          COALESCE(
            rd.despesas,
            0
          )::numeric AS despesas,

          (
            COALESCE(ra.faturamento, 0)
            - COALESCE(rd.despesas, 0)
          )::numeric AS resultado,

          COALESCE(
            ra.agendamentos,
            0
          )::integer AS agendamentos,

          COALESCE(
            ra.concluidos,
            0
          )::integer AS concluidos

        FROM dias

        LEFT JOIN resumo_agendamentos ra
          ON ra.data = dias.data

        LEFT JOIN resumo_despesas rd
          ON rd.data = dias.data

        ORDER BY dias.data ASC
      `,
      [empresaId, dataInicio, dataFim]
    );

    // ========================================================
    // AGENDAMENTOS RECENTES
    // ========================================================

    const recentes = await pool.query(
      `
        SELECT
          a.id,
          a.cliente,
          a.telefone,
          a.veiculo,
          a.placa,
          a.data,
          a.hora,
          a.valor,
          a.status,
          a.status_pagamento,
          a.forma_pagamento,
          a.servico_id,

          s.nome AS servico_nome

        FROM agendamentos a

        LEFT JOIN servicos s
          ON s.id = a.servico_id
         AND s.empresa_id = a.empresa_id

        WHERE a.empresa_id = $1

        ORDER BY
          a.data DESC,
          a.hora DESC,
          a.id DESC

        LIMIT 10
      `,
      [empresaId]
    );

    // ========================================================
    // SERVIÇOS MAIS REALIZADOS
    // ========================================================

    const servicos = await pool.query(
      `
        SELECT
          s.id,
          s.nome,

          COUNT(a.id) FILTER (
            WHERE a.id IS NOT NULL
              AND LOWER(COALESCE(a.status, '')) NOT IN (
                'cancelado',
                'cancelada'
              )
          )::integer AS quantidade,

          COALESCE(
            SUM(
              CASE
                WHEN LOWER(COALESCE(a.status, '')) NOT IN (
                  'cancelado',
                  'cancelada'
                )
                THEN COALESCE(a.valor, 0)
                ELSE 0
              END
            ),
            0
          )::numeric AS faturamento

        FROM servicos s

        LEFT JOIN agendamentos a
          ON a.servico_id = s.id
         AND a.empresa_id = s.empresa_id
         AND a.data BETWEEN $2::date AND $3::date

        WHERE s.empresa_id = $1

        GROUP BY
          s.id,
          s.nome

        ORDER BY
          faturamento DESC,
          quantidade DESC,
          s.nome ASC

        LIMIT 10
      `,
      [empresaId, dataInicio, dataFim]
    );

    // ========================================================
    // CÁLCULO DOS INDICADORES
    // ========================================================

    const resumo = resumoAgendamentos.rows[0] || {};

    const faturamento = Number(resumo.faturamento || 0);
    const despesas = Number(resumoDespesas.rows[0]?.total || 0);
    const resultado = faturamento - despesas;

    const totalAgendamentos = Number(resumo.total || 0);
    const concluidos = Number(resumo.concluidos || 0);
    const cancelados = Number(resumo.cancelados || 0);
    const pendentes = Number(resumo.pendentes || 0);

    const valorPago = Number(resumo.valor_pago || 0);
    const valorPendente = Number(resumo.valor_pendente || 0);

    const ticketMedio = concluidos > 0
      ? faturamento / concluidos
      : 0;

    // ========================================================
    // RESPOSTA
    // ========================================================

    return res.status(200).json({
      periodo: {
        data_inicio: dataInicio,
        data_fim: dataFim
      },

      resumo: {
        faturamento,
        despesas,
        resultado,

        agendamentos: totalAgendamentos,
        concluidos,
        cancelados,
        pendentes,

        ticket_medio: ticketMedio,
        valor_pago: valorPago,
        valor_pendente: valorPendente
      },

      movimentacao: movimentacao.rows,
      servicos: servicos.rows,
      recentes: recentes.rows
    });
  } catch (err) {
    console.error('Erro ao carregar dashboard:', {
      empresa_id: req.usuario?.empresa_id,
      usuario_id: req.usuario?.id,
      erro: err.message,
      codigo: err.code
    });

    return res.status(500).json({
      erro: 'Não foi possível carregar os dados do dashboard.'
    });
  }
});

module.exports = router;