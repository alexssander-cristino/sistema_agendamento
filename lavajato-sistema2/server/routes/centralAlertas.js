
const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);

function obterEmpresaId(req) {
  return (
    req.usuario?.empresa_id ??
    req.usuario?.empresaId ??
    req.user?.empresa_id ??
    req.user?.empresaId ??
    null
  );
}

function criarAlerta({
  id,
  categoria,
  prioridade,
  titulo,
  descricao,
  data,
  destino,
  valor = null
}) {
  return {
    id,
    categoria,
    prioridade,
    titulo,
    descricao,
    data,
    destino,
    valor
  };
}

function dataISO(valor) {
  if (!valor) return null;

  if (valor instanceof Date) {
    return valor.toISOString();
  }

  return String(valor);
}

function adicionarResultado(alertas, resultado, conversor) {
  if (resultado.status !== 'fulfilled') {
    console.error(
      '[Central de Alertas] Consulta indisponível:',
      resultado.reason?.message || resultado.reason
    );
    return;
  }

  for (const registro of resultado.value.rows) {
    const alerta = conversor(registro);

    if (alerta) {
      alertas.push(alerta);
    }
  }
}

router.get('/', async (req, res) => {
  const empresaId = obterEmpresaId(req);

  if (!empresaId) {
    return res.status(403).json({
      sucesso: false,
      mensagem: 'Não foi possível identificar a empresa.'
    });
  }

  try {
    const consultas = await Promise.allSettled([
      // 1. Agendamentos próximos
      pool.query(
        `
          SELECT
            id,
            data,
            hora,
            cliente,
            status,
            valor
          FROM agendamentos
          WHERE empresa_id = $1
            AND data >= CURRENT_DATE
            AND data < CURRENT_DATE + INTERVAL '3 days'
            AND LOWER(COALESCE(status, '')) NOT IN (
              'cancelado',
              'cancelada',
              'concluído',
              'concluido',
              'concluída',
              'concluida'
            )
          ORDER BY data ASC, hora ASC
          LIMIT 100
        `,
        [empresaId]
      ),

      // 2. Contas vencidas
      pool.query(
        `
          SELECT
            id,
            tipo,
            descricao,
            contato,
            valor,
            valor_pago,
            vencimento,
            status
          FROM contas_financeiras
          WHERE empresa_id = $1
            AND vencimento < CURRENT_DATE
            AND LOWER(COALESCE(status, '')) IN (
              'pendente',
              'parcial',
              'atrasado',
              'atrasada'
            )
          ORDER BY vencimento ASC
          LIMIT 100
        `,
        [empresaId]
      ),

      // 3. Contas que vencem nos próximos três dias
      pool.query(
        `
          SELECT
            id,
            tipo,
            descricao,
            contato,
            valor,
            valor_pago,
            vencimento,
            status
          FROM contas_financeiras
          WHERE empresa_id = $1
            AND vencimento >= CURRENT_DATE
            AND vencimento < CURRENT_DATE + INTERVAL '4 days'
            AND LOWER(COALESCE(status, '')) IN (
              'pendente',
              'parcial'
            )
          ORDER BY vencimento ASC
          LIMIT 100
        `,
        [empresaId]
      ),

      // 4. Comparação de receitas registradas nos últimos 7 dias
      // com os 7 dias anteriores.
      pool.query(
        `
          SELECT
            COALESCE(
              SUM(valor) FILTER (
                WHERE data >= CURRENT_DATE - INTERVAL '6 days'
              ),
              0
            ) AS periodo_atual,
            COALESCE(
              SUM(valor) FILTER (
                WHERE data >= CURRENT_DATE - INTERVAL '13 days'
                  AND data < CURRENT_DATE - INTERVAL '6 days'
              ),
              0
            ) AS periodo_anterior
          FROM agendamentos
          WHERE empresa_id = $1
            AND data >= CURRENT_DATE - INTERVAL '13 days'
            AND data < CURRENT_DATE + INTERVAL '1 day'
            AND LOWER(COALESCE(status, '')) NOT IN (
              'cancelado',
              'cancelada'
            )
        `,
        [empresaId]
      ),

      // 5. Comparação de despesas nos mesmos períodos.
      pool.query(
        `
          SELECT
            COALESCE(
              SUM(valor) FILTER (
                WHERE data >= CURRENT_DATE - INTERVAL '6 days'
              ),
              0
            ) AS periodo_atual,
            COALESCE(
              SUM(valor) FILTER (
                WHERE data >= CURRENT_DATE - INTERVAL '13 days'
                  AND data < CURRENT_DATE - INTERVAL '6 days'
              ),
              0
            ) AS periodo_anterior
          FROM despesas
          WHERE empresa_id = $1
            AND data >= CURRENT_DATE - INTERVAL '13 days'
            AND data < CURRENT_DATE + INTERVAL '1 day'
        `,
        [empresaId]
      ),

      // 6. Clientes sem agendamento há pelo menos 60 dias.
      // Clientes sem histórico de agendamentos não entram nesta consulta.
      pool.query(
        `
          SELECT
            c.id AS cliente_id,
            c.nome,
            MAX(a.data) AS ultimo_agendamento
          FROM clientes c
          INNER JOIN agendamentos a
            ON a.cliente_id = c.id
           AND a.empresa_id = c.empresa_id
          WHERE c.empresa_id = $1
          GROUP BY c.id, c.nome
          HAVING MAX(a.data) < CURRENT_DATE - INTERVAL '60 days'
          ORDER BY MAX(a.data) ASC
          LIMIT 100
        `,
        [empresaId]
      ),

      // 7. Agendamentos recentes sem cliente associado.
      pool.query(
        `
          SELECT id, data, hora
          FROM agendamentos
          WHERE empresa_id = $1
            AND data >= CURRENT_DATE - INTERVAL '30 days'
            AND (
              cliente_id IS NULL
              OR cliente_id = 0
            )
          ORDER BY data DESC
          LIMIT 100
        `,
        [empresaId]
      ),

      // 8. Agendamentos recentes com valor inválido.
      pool.query(
        `
          SELECT id, data, hora, valor
          FROM agendamentos
          WHERE empresa_id = $1
            AND data >= CURRENT_DATE - INTERVAL '30 days'
            AND (
              valor IS NULL
              OR valor < 0
            )
          ORDER BY data DESC
          LIMIT 100
        `,
        [empresaId]
      )
    ]);

    const alertas = [];

    adicionarResultado(alertas, consultas[0], (r) =>
      criarAlerta({
        id: `agendamento-${r.id}`,
        categoria: 'agendamentos',
        prioridade: 'media',
        titulo: 'Agendamento próximo',
        descricao:
          `Agendamento de ${r.cliente || 'cliente não identificado'}` +
          ` para ${dataISO(r.data)}` +
          (r.hora ? ` às ${r.hora}.` : '.'),
        data: dataISO(r.data),
        destino: '/index.html#agenda'
      })
    );

    adicionarResultado(alertas, consultas[1], (r) => {
      const saldo = Math.max(
        0,
        Number(r.valor || 0) - Number(r.valor_pago || 0)
      );

      return criarAlerta({
        id: `conta-atrasada-${r.id}`,
        categoria: 'pagamentos',
        prioridade: 'alta',
        titulo: 'Pagamento atrasado',
        descricao:
          `${r.descricao || 'Conta sem descrição'} está vencida` +
          (r.contato ? ` — ${r.contato}.` : '.'),
        data: dataISO(r.vencimento),
        valor: saldo,
        destino:
          `/contas-financeiras.html?status=atrasadas`
      });
    });

    adicionarResultado(alertas, consultas[2], (r) => {
      const saldo = Math.max(
        0,
        Number(r.valor || 0) - Number(r.valor_pago || 0)
      );

      return criarAlerta({
        id: `conta-vencimento-${r.id}`,
        categoria: 'pagamentos',
        prioridade: 'media',
        titulo: 'Conta próxima do vencimento',
        descricao:
          `${r.descricao || 'Conta sem descrição'} vence em ` +
          `${dataISO(r.vencimento)}.`,
        data: dataISO(r.vencimento),
        valor: saldo,
        destino: '/contas-financeiras.html'
      });
    });

    // Analisa variações financeiras sem interromper o restante
    // da central caso alguma consulta opcional falhe.
    if (consultas[3].status === 'fulfilled') {
      const r = consultas[3].value.rows[0];

      const atual = Number(r?.periodo_atual || 0);
      const anterior = Number(r?.periodo_anterior || 0);

      if (
        anterior > 0 &&
        atual < anterior * 0.8
      ) {
        const queda = ((anterior - atual) / anterior) * 100;

        alertas.push(
          criarAlerta({
            id: 'receita-em-queda',
            categoria: 'financeiro',
            prioridade: 'media',
            titulo: 'Receita registrada em queda',
            descricao:
              `A receita registrada caiu ${queda.toFixed(1)}% ` +
              'em comparação com os sete dias anteriores.',
            data: new Date().toISOString(),
            destino: '/financeiro.html'
          })
        );
      }
    } else {
      console.error(
        '[Central de Alertas] Receita:',
        consultas[3].reason?.message
      );
    }

    if (consultas[4].status === 'fulfilled') {
      const r = consultas[4].value.rows[0];

      const atual = Number(r?.periodo_atual || 0);
      const anterior = Number(r?.periodo_anterior || 0);

      if (
        anterior > 0 &&
        atual >= anterior * 1.25
      ) {
        const aumento = ((atual - anterior) / anterior) * 100;

        alertas.push(
          criarAlerta({
            id: 'despesas-em-alta',
            categoria: 'financeiro',
            prioridade: 'alta',
            titulo: 'Despesas registradas em alta',
            descricao:
              `As despesas registradas aumentaram ${aumento.toFixed(1)}% ` +
              'em comparação com os sete dias anteriores.',
            data: new Date().toISOString(),
            destino: '/financeiro.html'
          })
        );
      }
    } else {
      console.error(
        '[Central de Alertas] Despesas:',
        consultas[4].reason?.message
      );
    }

    adicionarResultado(alertas, consultas[5], (r) =>
      criarAlerta({
        id: `cliente-sem-retorno-${r.cliente_id}`,
        categoria: 'clientes',
        prioridade: 'baixa',
        titulo: 'Cliente sem retorno',
        descricao:
          `${r.nome || 'Cliente'} não tem agendamentos há pelo menos 60 dias.`,
        data: dataISO(r.ultimo_agendamento),
        destino:
          `/inteligencia-clientes.html?segmento=sem_retorno`
      })
    );

    adicionarResultado(alertas, consultas[6], (r) =>
      criarAlerta({
        id: `agendamento-sem-cliente-${r.id}`,
        categoria: 'inconsistencias',
        prioridade: 'alta',
        titulo: 'Agendamento sem cliente associado',
        descricao:
          `O agendamento #${r.id} não tem um cliente associado.`,
        data: dataISO(r.data),
        destino: '/index.html#agenda'
      })
    );

    adicionarResultado(alertas, consultas[7], (r) =>
      criarAlerta({
        id: `agendamento-valor-invalido-${r.id}`,
        categoria: 'inconsistencias',
        prioridade: 'alta',
        titulo: 'Valor de agendamento inválido',
        descricao:
          `O agendamento #${r.id} possui valor nulo ou negativo.`,
        data: dataISO(r.data),
        destino: '/index.html#agenda'
      })
    );

    const ordemPrioridade = {
      alta: 0,
      media: 1,
      baixa: 2
    };

    alertas.sort((a, b) => {
      const prioridade =
        ordemPrioridade[a.prioridade] -
        ordemPrioridade[b.prioridade];

      if (prioridade !== 0) return prioridade;

      return String(b.data || '').localeCompare(
        String(a.data || '')
      );
    });

    return res.json({
      sucesso: true,
      total: alertas.length,
      resumo: {
        alta: alertas.filter((a) => a.prioridade === 'alta').length,
        media: alertas.filter((a) => a.prioridade === 'media').length,
        baixa: alertas.filter((a) => a.prioridade === 'baixa').length
      },
      alertas
    });
  } catch (erro) {
    console.error('[Central de Alertas]', erro);

    return res.status(500).json({
      sucesso: false,
      mensagem: 'Não foi possível carregar a Central de Alertas.'
    });
  }
});

module.exports = router;
