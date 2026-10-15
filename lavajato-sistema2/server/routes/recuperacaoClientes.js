
const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);

const PERIODOS_VALIDOS = [30, 60, 90];

const RESULTADOS_VALIDOS = [
  'contato_realizado',
  'respondeu',
  'interessado',
  'agendou',
  'sem_interesse',
  'sem_resposta',
  'numero_invalido'
];

function normalizarTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

function criarMensagem(nome, diasSemRetorno) {
  const primeiroNome = String(nome || 'tudo bem')
    .trim()
    .split(/\s+/)[0];

  if (diasSemRetorno >= 90) {
    return (
      `Olá, ${primeiroNome}! Tudo bem? Faz um tempinho desde ` +
      'seu último atendimento conosco e gostaríamos de saber ' +
      'como você está. Se precisar dos nossos serviços novamente, ' +
      'estamos à disposição para ajudar. Quer conversar sobre um ' +
      'novo agendamento?'
    );
  }

  return (
    `Olá, ${primeiroNome}! Tudo bem? Estamos passando para saber ` +
    'como você está e lembrar que estamos à disposição quando ' +
    'precisar dos nossos serviços novamente. Gostaria de verificar ' +
    'um horário para um próximo atendimento?'
  );
}

function obterPeriodo(valor) {
  const periodo = Number(valor || 30);

  return PERIODOS_VALIDOS.includes(periodo) ? periodo : null;
}

// ============================================================
// GET /api/recuperacao-clientes
// Lista clientes sem retorno recente.
// ============================================================

router.get('/', async (req, res) => {
  const empresaId = req.usuario?.empresa_id;
  const periodo = obterPeriodo(req.query.dias);
  const busca = String(req.query.busca || '').trim().slice(0, 100);

  if (!empresaId) {
    return res.status(400).json({
      erro: 'Não foi possível identificar a empresa.'
    });
  }

  if (!periodo) {
    return res.status(400).json({
      erro: 'O período deve ser 30, 60 ou 90 dias.'
    });
  }

  try {
    const { rows } = await pool.query(
      `
      WITH ultimos_atendimentos AS (
        SELECT
          a.cliente_id,
          MAX(a.data)::date AS ultimo_atendimento,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(a.status, '')) = 'concluido'
          ) AS total_atendimentos,
          SUM(
            CASE
              WHEN LOWER(COALESCE(a.status, '')) = 'concluido'
              THEN COALESCE(a.valor, 0)
              ELSE 0
            END
          ) AS total_historico
        FROM agendamentos a
        WHERE a.empresa_id = $1
          AND a.cliente_id IS NOT NULL
          AND LOWER(COALESCE(a.status, '')) = 'concluido'
        GROUP BY a.cliente_id
      ),
      ultimo_contato AS (
        SELECT DISTINCT ON (rc.cliente_id)
          rc.cliente_id,
          rc.resultado,
          rc.contato_em
        FROM recuperacao_contatos rc
        WHERE rc.empresa_id = $1
        ORDER BY rc.cliente_id, rc.contato_em DESC, rc.id DESC
      )
      SELECT
        c.id,
        c.nome,
        c.telefone,
        ua.ultimo_atendimento,
        ua.total_atendimentos,
        ua.total_historico,
        CURRENT_DATE - ua.ultimo_atendimento AS dias_sem_retorno,
        uc.resultado AS ultimo_resultado,
        uc.contato_em AS ultimo_contato
      FROM clientes c
      INNER JOIN ultimos_atendimentos ua
        ON ua.cliente_id = c.id
      LEFT JOIN ultimo_contato uc
        ON uc.cliente_id = c.id
      WHERE c.empresa_id = $1
        AND COALESCE(c.ativo, TRUE) = TRUE
        AND ua.ultimo_atendimento <=
            CURRENT_DATE - ($2::integer * INTERVAL '1 day')
        AND (
          $3 = ''
          OR c.nome ILIKE '%' || $3 || '%'
          OR COALESCE(c.telefone, '') ILIKE '%' || $3 || '%'
        )
      ORDER BY
        ua.ultimo_atendimento ASC,
        c.nome ASC
      LIMIT 500
      `,
      [empresaId, periodo, busca]
    );

    const clientes = rows.map((cliente) => {
      const dias = Number(cliente.dias_sem_retorno || 0);
      const telefone = normalizarTelefone(cliente.telefone);

      let prioridade = 'normal';

      if (dias >= 90) {
        prioridade = 'alta';
      } else if (dias >= 60) {
        prioridade = 'media';
      }

      return {
        ...cliente,
        dias_sem_retorno: dias,
        total_atendimentos: Number(cliente.total_atendimentos || 0),
        total_historico: Number(cliente.total_historico || 0),
        prioridade,
        telefone_whatsapp: telefone,
        mensagem_sugerida: criarMensagem(cliente.nome, dias)
      };
    });

    return res.json({
      periodo_dias: periodo,
      total: clientes.length,
      clientes
    });
  } catch (err) {
    console.error('Erro ao buscar clientes para recuperação:', err);

    return res.status(500).json({
      erro: 'Não foi possível carregar a lista de recuperação.'
    });
  }
});

// ============================================================
// GET /api/recuperacao-clientes/:clienteId/historico
// Consulta os contatos de um cliente da empresa.
// ============================================================

router.get('/:clienteId/historico', async (req, res) => {
  const empresaId = req.usuario?.empresa_id;
  const clienteId = Number(req.params.clienteId);

  if (!empresaId) {
    return res.status(400).json({
      erro: 'Não foi possível identificar a empresa.'
    });
  }

  if (!Number.isSafeInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({
      erro: 'Identificador de cliente inválido.'
    });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        rc.id,
        rc.cliente_id,
        rc.telefone,
        rc.mensagem,
        rc.resultado,
        rc.observacoes,
        rc.contato_em,
        rc.criado_em
      FROM recuperacao_contatos rc
      INNER JOIN clientes c
        ON c.id = rc.cliente_id
       AND c.empresa_id = rc.empresa_id
      WHERE rc.empresa_id = $1
        AND rc.cliente_id = $2
      ORDER BY rc.contato_em DESC, rc.id DESC
      LIMIT 100
      `,
      [empresaId, clienteId]
    );

    return res.json(rows);
  } catch (err) {
    console.error('Erro ao carregar histórico de recuperação:', err);

    return res.status(500).json({
      erro: 'Não foi possível carregar o histórico de contatos.'
    });
  }
});

// ============================================================
// POST /api/recuperacao-clientes/:clienteId/contatos
// Registra contato e seu resultado.
// ============================================================

router.post('/:clienteId/contatos', async (req, res) => {
  const empresaId = req.usuario?.empresa_id;
  const clienteId = Number(req.params.clienteId);

  const {
    mensagem,
    resultado,
    observacoes,
    telefone
  } = req.body || {};

  if (!empresaId) {
    return res.status(400).json({
      erro: 'Não foi possível identificar a empresa.'
    });
  }

  if (!Number.isSafeInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({
      erro: 'Identificador de cliente inválido.'
    });
  }

  if (
    typeof mensagem !== 'string' ||
    !mensagem.trim() ||
    mensagem.length > 5000
  ) {
    return res.status(400).json({
      erro: 'Informe uma mensagem válida de até 5.000 caracteres.'
    });
  }

  if (!RESULTADOS_VALIDOS.includes(resultado)) {
    return res.status(400).json({
      erro: 'Selecione um resultado de contato válido.'
    });
  }

  if (
    observacoes != null &&
    (
      typeof observacoes !== 'string' ||
      observacoes.length > 1000
    )
  ) {
    return res.status(400).json({
      erro: 'As observações devem ter no máximo 1.000 caracteres.'
    });
  }

  try {
    const clienteResult = await pool.query(
      `
      SELECT id, telefone
      FROM clientes
      WHERE id = $1
        AND empresa_id = $2
      LIMIT 1
      `,
      [clienteId, empresaId]
    );

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({
        erro: 'Cliente não encontrado.'
      });
    }

    const cliente = clienteResult.rows[0];

    const telefoneFinal =
      typeof telefone === 'string' && telefone.trim()
        ? telefone.trim().slice(0, 30)
        : cliente.telefone;

    const { rows } = await pool.query(
      `
      INSERT INTO recuperacao_contatos (
        empresa_id,
        cliente_id,
        telefone,
        mensagem,
        resultado,
        observacoes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        empresaId,
        clienteId,
        telefoneFinal || null,
        mensagem.trim(),
        resultado,
        typeof observacoes === 'string'
          ? observacoes.trim() || null
          : null
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Erro ao registrar contato de recuperação:', err);

    return res.status(500).json({
      erro: 'Não foi possível registrar o contato.'
    });
  }
});

module.exports = router;
