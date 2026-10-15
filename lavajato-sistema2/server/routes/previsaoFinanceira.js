
const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);

const arredondar = (valor) =>
  Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

router.get('/', async (req, res) => {
  const empresaId = req.usuario.empresa_id;

  if (!empresaId) {
    return res.status(400).json({
      erro: 'Não foi possível identificar a empresa.'
    });
  }

  try {
    /*
     * A previsão utiliza apenas lançamentos da empresa autenticada.
     *
     * Entradas previstas:
     * - Agendamentos futuros não cancelados.
     * - Pagamentos pendentes ou parciais.
     *
     * Saídas previstas:
     * - Despesas futuras ainda não pagas.
     *
     * Observação:
     * Como a tabela de agendamentos não informa necessariamente
     * a data real do recebimento, os valores pagos são apresentados
     * separadamente, sem afirmar que foram recebidos naquela data.
     */
    const { rows } = await pool.query(
      `
      WITH dias AS (
        SELECT generate_series(
          CURRENT_DATE,
          CURRENT_DATE + INTERVAL '89 days',
          INTERVAL '1 day'
        )::date AS dia
      ),
      entradas_previstas AS (
        SELECT
          a.data::date AS dia,
          SUM(COALESCE(a.valor, 0)) AS valor
        FROM agendamentos a
        WHERE a.empresa_id = $1
          AND a.data >= CURRENT_DATE
          AND a.data < CURRENT_DATE + INTERVAL '90 days'
          AND LOWER(COALESCE(a.status, '')) NOT IN (
            'cancelado',
            'cancelada'
          )
          AND LOWER(COALESCE(a.status_pagamento, 'pendente'))
            IN ('pendente', 'parcial')
        GROUP BY a.data::date
      ),
      recebimentos_registrados AS (
        SELECT
          a.data::date AS dia,
          SUM(COALESCE(a.valor, 0)) AS valor
        FROM agendamentos a
        WHERE a.empresa_id = $1
          AND a.data >= CURRENT_DATE
          AND a.data < CURRENT_DATE + INTERVAL '90 days'
          AND LOWER(COALESCE(a.status, '')) NOT IN (
            'cancelado',
            'cancelada'
          )
          AND LOWER(COALESCE(a.status_pagamento, '')) = 'pago'
        GROUP BY a.data::date
      ),
      saidas_previstas AS (
        SELECT
          d.data::date AS dia,
          SUM(COALESCE(d.valor, 0)) AS valor
        FROM despesas d
        WHERE d.empresa_id = $1
          AND d.data >= CURRENT_DATE
          AND d.data < CURRENT_DATE + INTERVAL '90 days'
          AND LOWER(COALESCE(d.status_pagamento, 'pendente'))
            = 'pendente'
        GROUP BY d.data::date
      ),
      pagamentos_registrados AS (
        SELECT
          COALESCE(d.data_pagamento, d.data)::date AS dia,
          SUM(COALESCE(d.valor, 0)) AS valor
        FROM despesas d
        WHERE d.empresa_id = $1
          AND LOWER(COALESCE(d.status_pagamento, 'pendente')) = 'pago'
          AND COALESCE(d.data_pagamento, d.data) >= CURRENT_DATE
          AND COALESCE(d.data_pagamento, d.data)
              < CURRENT_DATE + INTERVAL '90 days'
        GROUP BY COALESCE(d.data_pagamento, d.data)::date
      )
      SELECT
        dias.dia,
        COALESCE(ep.valor, 0)::numeric AS entradas_previstas,
        COALESCE(sp.valor, 0)::numeric AS saidas_previstas,
        COALESCE(rr.valor, 0)::numeric AS recebimentos_registrados,
        COALESCE(pr.valor, 0)::numeric AS pagamentos_registrados
      FROM dias
      LEFT JOIN entradas_previstas ep ON ep.dia = dias.dia
      LEFT JOIN saidas_previstas sp ON sp.dia = dias.dia
      LEFT JOIN recebimentos_registrados rr ON rr.dia = dias.dia
      LEFT JOIN pagamentos_registrados pr ON pr.dia = dias.dia
      ORDER BY dias.dia
      `,
      [empresaId]
    );

    const dias = rows.map((row) => ({
      data: row.dia,
      entradasPrevistas: Number(row.entradas_previstas || 0),
      saidasPrevistas: Number(row.saidas_previstas || 0),
      recebimentosRegistrados: Number(
        row.recebimentos_registrados || 0
      ),
      pagamentosRegistrados: Number(
        row.pagamentos_registrados || 0
      )
    }));

    function resumirPeriodo(quantidadeDias) {
      const periodo = dias.slice(0, quantidadeDias);

      const entradasPrevistas = periodo.reduce(
        (total, dia) => total + dia.entradasPrevistas,
        0
      );

      const saidasPrevistas = periodo.reduce(
        (total, dia) => total + dia.saidasPrevistas,
        0
      );

      const recebimentosRegistrados = periodo.reduce(
        (total, dia) => total + dia.recebimentosRegistrados,
        0
      );

      const pagamentosRegistrados = periodo.reduce(
        (total, dia) => total + dia.pagamentosRegistrados,
        0
      );

      const saldoLiquidoProjetado =
        entradasPrevistas - saidasPrevistas;

      const saldoRealizadoIdentificado =
        recebimentosRegistrados - pagamentosRegistrados;

      const alertas = [];

      if (saidasPrevistas > entradasPrevistas) {
        alertas.push({
          tipo: 'risco',
          titulo: 'Saídas previstas acima das entradas',
          mensagem:
            `As saídas previstas superam as entradas em ` +
            `R$ ${arredondar(
              saidasPrevistas - entradasPrevistas
            ).toFixed(2)}.`
        });
      }

      if (entradasPrevistas === 0 && saidasPrevistas > 0) {
        alertas.push({
          tipo: 'risco',
          titulo: 'Nenhuma entrada prevista',
          mensagem:
            'Existem despesas previstas sem entradas pendentes ' +
            'identificadas neste período.'
        });
      }

      if (
        entradasPrevistas > 0 &&
        saidasPrevistas > entradasPrevistas * 0.8
      ) {
        alertas.push({
          tipo: 'atencao',
          titulo: 'Margem financeira reduzida',
          mensagem:
            'As despesas previstas consomem pelo menos 80% ' +
            'das entradas previstas.'
        });
      }

      return {
        dias: quantidadeDias,
        entradasPrevistas: arredondar(entradasPrevistas),
        saidasPrevistas: arredondar(saidasPrevistas),
        saldoLiquidoProjetado: arredondar(saldoLiquidoProjetado),
        recebimentosRegistrados: arredondar(
          recebimentosRegistrados
        ),
        pagamentosRegistrados: arredondar(pagamentosRegistrados),
        saldoRealizadoIdentificado: arredondar(
          saldoRealizadoIdentificado
        ),
        alertas
      };
    }

    return res.json({
      atualizadoEm: new Date().toISOString(),
      observacao:
        'Saldo líquido projetado significa entradas previstas ' +
        'menos saídas previstas. Não representa saldo bancário. ' +
        'Recebimentos registrados usam a data do agendamento, ' +
        'pois a data real do recebimento não está disponível.',
      periodos: {
        seteDias: resumirPeriodo(7),
        trintaDias: resumirPeriodo(30),
        noventaDias: resumirPeriodo(90)
      },
      evolucaoDiaria: dias.map((dia) => ({
        ...dia,
        saldoLiquidoProjetado: arredondar(
          dia.entradasPrevistas - dia.saidasPrevistas
        )
      }))
    });
  } catch (err) {
    console.error('Erro ao gerar previsão financeira:', err);

    return res.status(500).json({
      erro: 'Não foi possível gerar a previsão financeira.'
    });
  }
});

module.exports = router;
