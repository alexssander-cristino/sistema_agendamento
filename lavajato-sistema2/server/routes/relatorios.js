const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);

/**
 * ============================================================
 * RELATÓRIOS
 * ============================================================
 *
 * Todos os relatórios são isolados pela empresa do usuário.
 *
 * Nunca recebemos empresa_id do frontend.
 * ============================================================
 */

function obterEmpresaId(req) {
  return req.usuario?.empresa_id ?? req.usuario?.empresaId ?? null;
}

function validarData(data) {
  return (
    typeof data === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(data)
  );
}

function obterPeriodo(req) {
  const hoje = new Date();

  const dataHoje = hoje.toISOString().slice(0, 10);

  const inicioPadrao = new Date(hoje);
  inicioPadrao.setDate(inicioPadrao.getDate() - 29);

  const dataInicioPadrao = inicioPadrao
    .toISOString()
    .slice(0, 10);

  const dataInicio =
    validarData(req.query.data_inicio)
      ? req.query.data_inicio
      : dataInicioPadrao;

  const dataFim =
    validarData(req.query.data_fim)
      ? req.query.data_fim
      : dataHoje;

  return {
    dataInicio,
    dataFim,
  };
}

/**
 * ============================================================
 * GET /api/relatorios/resumo
 * ============================================================
 */

router.get('/resumo', async (req, res) => {
  try {
    const empresaId = obterEmpresaId(req);

    if (!empresaId) {
      return res.status(403).json({
        erro: 'Empresa não identificada.',
      });
    }

    const { dataInicio, dataFim } = obterPeriodo(req);

    if (dataInicio > dataFim) {
      return res.status(400).json({
        erro: 'A data inicial não pode ser maior que a data final.',
      });
    }

    const resultado = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_agendamentos,

        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(status, '')) IN (
            'concluido',
            'concluida',
            'finalizado',
            'finalizada'
          )
        )::int AS agendamentos_concluidos,

        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(status, '')) IN (
            'cancelado',
            'cancelada'
          )
        )::int AS agendamentos_cancelados,

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
        )::numeric AS faturamento

      FROM agendamentos
      WHERE empresa_id = $1
        AND data >= $2::date
        AND data <= $3::date
      `,
      [empresaId, dataInicio, dataFim]
    );

    const despesas = await pool.query(
      `
      SELECT
        COALESCE(SUM(valor), 0)::numeric AS total_despesas
      FROM despesas
      WHERE empresa_id = $1
        AND data >= $2::date
        AND data <= $3::date
      `,
      [empresaId, dataInicio, dataFim]
    );

    const dados = resultado.rows[0] || {};
    const totalDespesas =
      Number(despesas.rows[0]?.total_despesas || 0);

    const faturamento =
      Number(dados.faturamento || 0);

    const lucro =
      faturamento - totalDespesas;

    const totalAgendamentos =
      Number(dados.total_agendamentos || 0);

    const ticketMedio =
      totalAgendamentos > 0
        ? faturamento / totalAgendamentos
        : 0;

    return res.json({
      periodo: {
        data_inicio: dataInicio,
        data_fim: dataFim,
      },

      indicadores: {
        faturamento,
        despesas: totalDespesas,
        lucro,
        total_agendamentos: totalAgendamentos,
        agendamentos_concluidos:
          Number(dados.agendamentos_concluidos || 0),
        agendamentos_cancelados:
          Number(dados.agendamentos_cancelados || 0),
        ticket_medio: ticketMedio,
      },
    });

  } catch (erro) {
    console.error(
      '[RELATORIOS] Erro ao gerar resumo:',
      erro
    );

    return res.status(500).json({
      erro: 'Não foi possível gerar o relatório.',
    });
  }
});


/**
 * ============================================================
 * GET /api/relatorios/financeiro
 * ============================================================
 */

router.get('/financeiro', async (req, res) => {
  try {
    const empresaId = obterEmpresaId(req);

    if (!empresaId) {
      return res.status(403).json({
        erro: 'Empresa não identificada.',
      });
    }

    const { dataInicio, dataFim } = obterPeriodo(req);

    if (dataInicio > dataFim) {
      return res.status(400).json({
        erro: 'A data inicial não pode ser maior que a data final.',
      });
    }

    const receitas = await pool.query(
      `
      SELECT
        COALESCE(SUM(valor), 0)::numeric AS total
      FROM agendamentos
      WHERE empresa_id = $1
        AND data >= $2::date
        AND data <= $3::date
        AND LOWER(COALESCE(status, '')) NOT IN (
          'cancelado',
          'cancelada'
        )
      `,
      [empresaId, dataInicio, dataFim]
    );

    const despesas = await pool.query(
      `
      SELECT
        COALESCE(SUM(valor), 0)::numeric AS total
      FROM despesas
      WHERE empresa_id = $1
        AND data >= $2::date
        AND data <= $3::date
      `,
      [empresaId, dataInicio, dataFim]
    );

    const totalReceitas =
      Number(receitas.rows[0]?.total || 0);

    const totalDespesas =
      Number(despesas.rows[0]?.total || 0);

    return res.json({
      periodo: {
        data_inicio: dataInicio,
        data_fim: dataFim,
      },

      receitas: totalReceitas,
      despesas: totalDespesas,
      saldo: totalReceitas - totalDespesas,
    });

  } catch (erro) {
    console.error(
      '[RELATORIOS] Erro no relatório financeiro:',
      erro
    );

    return res.status(500).json({
      erro: 'Não foi possível gerar o relatório financeiro.',
    });
  }
});


/**
 * ============================================================
 * GET /api/relatorios/agendamentos
 * ============================================================
 */

router.get('/agendamentos', async (req, res) => {
  try {
    const empresaId = obterEmpresaId(req);

    if (!empresaId) {
      return res.status(403).json({
        erro: 'Empresa não identificada.',
      });
    }

    const { dataInicio, dataFim } = obterPeriodo(req);

    const resultado = await pool.query(
      `
      SELECT
        data,
        COUNT(*)::int AS quantidade,
        COALESCE(SUM(valor), 0)::numeric AS valor
      FROM agendamentos
      WHERE empresa_id = $1
        AND data >= $2::date
        AND data <= $3::date
      GROUP BY data
      ORDER BY data ASC
      `,
      [empresaId, dataInicio, dataFim]
    );

    return res.json({
      periodo: {
        data_inicio: dataInicio,
        data_fim: dataFim,
      },

      dados: resultado.rows.map((item) => ({
        data: item.data,
        quantidade: Number(item.quantidade || 0),
        valor: Number(item.valor || 0),
      })),
    });

  } catch (erro) {
    console.error(
      '[RELATORIOS] Erro no relatório de agendamentos:',
      erro
    );

    return res.status(500).json({
      erro: 'Não foi possível gerar o relatório de agendamentos.',
    });
  }
});


/**
 * ============================================================
 * GET /api/relatorios/servicos
 * ============================================================
 */

router.get('/servicos', async (req, res) => {
  try {
    const empresaId = obterEmpresaId(req);

    if (!empresaId) {
      return res.status(403).json({
        erro: 'Empresa não identificada.',
      });
    }

    const { dataInicio, dataFim } = obterPeriodo(req);

    const resultado = await pool.query(
      `
      SELECT
        s.id,
        s.nome,
        COUNT(a.id)::int AS quantidade,
        COALESCE(SUM(a.valor), 0)::numeric AS faturamento
      FROM agendamentos a
      LEFT JOIN servicos s
        ON s.id = a.servico_id
       AND s.empresa_id = a.empresa_id
      WHERE a.empresa_id = $1
        AND a.data >= $2::date
        AND a.data <= $3::date
        AND LOWER(COALESCE(a.status, '')) NOT IN (
          'cancelado',
          'cancelada'
        )
      GROUP BY s.id, s.nome
      ORDER BY faturamento DESC
      `,
      [empresaId, dataInicio, dataFim]
    );

    return res.json({
      periodo: {
        data_inicio: dataInicio,
        data_fim: dataFim,
      },

      dados: resultado.rows.map((item) => ({
        id: item.id,
        nome: item.nome || 'Serviço não informado',
        quantidade: Number(item.quantidade || 0),
        faturamento: Number(item.faturamento || 0),
      })),
    });

  } catch (erro) {
    console.error(
      '[RELATORIOS] Erro no relatório de serviços:',
      erro
    );

    return res.status(500).json({
      erro: 'Não foi possível gerar o relatório de serviços.',
    });
  }
});


module.exports = router;