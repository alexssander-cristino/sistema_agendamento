const express = require('express');

const pool = require('../db');
const autenticar = require('../middleware/auth');

const router = express.Router();

router.use(autenticar);

// ============================================================
// CONSTANTES
// ============================================================

const TIPOS_PERMITIDOS = [
  'acesso',
  'correcao',
  'exclusao',
  'informacoes',
  'revogacao',
  'outro'
];

const STATUS_PERMITIDOS = [
  'pendente',
  'em_andamento',
  'respondida',
  'concluida',
  'cancelada'
];

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function verificarEmpresa(req, res) {
  if (
    !req.usuario ||
    req.usuario.perfil === 'dev' ||
    !req.usuario.empresa_id
  ) {
    res.status(403).json({
      erro: 'Acesso não disponível para este usuário.'
    });

    return false;
  }

  return true;
}

function verificarDev(req, res) {
  if (!req.usuario || req.usuario.perfil !== 'dev') {
    res.status(403).json({
      erro: 'Acesso permitido somente ao desenvolvedor.'
    });

    return false;
  }

  return true;
}

function validarIdSolicitacao(req, res) {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({
      erro: 'ID da solicitação inválido.'
    });

    return null;
  }

  return id;
}

// ============================================================
// DEV — LISTAR SOLICITAÇÕES
// GET /api/privacidade/dev
// ============================================================

router.get('/dev', async (req, res) => {
  if (!verificarDev(req, res)) {
    return;
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        sp.id,
        sp.empresa_id,
        sp.usuario_id,

        COALESCE(
          NULLIF(TRIM(e.nome), ''),
          'Empresa não identificada'
        ) AS empresa_nome,

        COALESCE(
          NULLIF(TRIM(u.nome), ''),
          'Usuário não identificado'
        ) AS usuario_nome,

        sp.tipo,
        sp.descricao,
        sp.assunto,
        sp.prioridade,
        sp.referencia,
        sp.status,
        sp.resposta,
        sp.criado_em,
        sp.atualizado_em

      FROM solicitacoes_privacidade sp

      LEFT JOIN empresas e
        ON e.id = sp.empresa_id

      LEFT JOIN usuarios u
        ON u.id = sp.usuario_id

      ORDER BY
        CASE
          WHEN sp.status = 'pendente' THEN 0
          WHEN sp.status = 'em_andamento' THEN 1
          ELSE 2
        END,
        sp.criado_em DESC
    `);

    return res.json(rows);
  } catch (err) {
    console.error('Erro ao listar solicitações no painel DEV:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      table: err.table,
      column: err.column
    });

    return res.status(500).json({
      erro: 'Não foi possível carregar as solicitações.'
    });
  }
});

// ============================================================
// DEV — RESPONDER OU ATUALIZAR SOLICITAÇÃO
// PATCH /api/privacidade/dev/:id
// ============================================================

router.patch('/dev/:id', async (req, res) => {
  if (!verificarDev(req, res)) {
    return;
  }

  const id = validarIdSolicitacao(req, res);

  if (id === null) {
    return;
  }

  try {
    const body = req.body || {};

    const possuiStatus = Object.prototype.hasOwnProperty.call(
      body,
      'status'
    );

    const possuiResposta = Object.prototype.hasOwnProperty.call(
      body,
      'resposta'
    );

    if (!possuiStatus && !possuiResposta) {
      return res.status(400).json({
        erro: 'Informe o status ou a resposta da solicitação.'
      });
    }

    let status;
    let resposta;

    // --------------------------------------------------------
    // VALIDAR STATUS
    // --------------------------------------------------------

    if (possuiStatus) {
      if (
        typeof body.status !== 'string' ||
        !STATUS_PERMITIDOS.includes(body.status)
      ) {
        return res.status(400).json({
          erro: 'Status da solicitação inválido.'
        });
      }

      status = body.status;
    }

    // --------------------------------------------------------
    // VALIDAR RESPOSTA
    // --------------------------------------------------------

    if (possuiResposta) {
      if (
        body.resposta !== null &&
        typeof body.resposta !== 'string'
      ) {
        return res.status(400).json({
          erro: 'A resposta deve ser um texto ou null.'
        });
      }

      resposta =
        typeof body.resposta === 'string'
          ? body.resposta.trim()
          : null;

      if (resposta && resposta.length > 5000) {
        return res.status(400).json({
          erro: 'A resposta não pode ultrapassar 5000 caracteres.'
        });
      }

      if (resposta === '') {
        resposta = null;
      }
    }

    // --------------------------------------------------------
    // MONTAR UPDATE DINÂMICO
    // Atualiza somente os campos enviados.
    // --------------------------------------------------------

    const campos = [];
    const valores = [];
    let parametro = 1;

    if (possuiStatus) {
      campos.push(`status = $${parametro}`);
      valores.push(status);
      parametro++;
    }

    if (possuiResposta) {
      campos.push(`resposta = $${parametro}`);
      valores.push(resposta);
      parametro++;
    }

    campos.push('atualizado_em = CURRENT_TIMESTAMP');

    valores.push(id);

    const sql = `
      UPDATE solicitacoes_privacidade
      SET ${campos.join(', ')}
      WHERE id = $${parametro}
      RETURNING *
    `;

    const { rows } = await pool.query(sql, valores);

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Solicitação não encontrada.'
      });
    }

    const solicitacao = rows[0];

    // --------------------------------------------------------
    // BUSCAR NOMES DA EMPRESA E DO USUÁRIO
    // --------------------------------------------------------

    const resultadoNomes = await pool.query(
      `
      SELECT
        COALESCE(
          NULLIF(TRIM(e.nome), ''),
          'Empresa não identificada'
        ) AS empresa_nome,

        COALESCE(
          NULLIF(TRIM(u.nome), ''),
          'Usuário não identificado'
        ) AS usuario_nome

      FROM solicitacoes_privacidade sp

      LEFT JOIN empresas e
        ON e.id = sp.empresa_id

      LEFT JOIN usuarios u
        ON u.id = sp.usuario_id

      WHERE sp.id = $1
      LIMIT 1
      `,
      [id]
    );

    const nomes = resultadoNomes.rows[0] || {};

    return res.json({
      mensagem: 'Solicitação atualizada com sucesso.',

      solicitacao: {
        ...solicitacao,
        empresa_nome:
          nomes.empresa_nome || 'Empresa não identificada',
        usuario_nome:
          nomes.usuario_nome || 'Usuário não identificado'
      }
    });
  } catch (err) {
    console.error('Erro ao atualizar solicitação no painel DEV:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
      table: err.table,
      column: err.column
    });

    return res.status(500).json({
      erro: 'Não foi possível atualizar a solicitação.'
    });
  }
});

// ============================================================
// EMPRESA — LISTAR SOLICITAÇÕES DO USUÁRIO
// GET /api/privacidade
// ============================================================

router.get('/', async (req, res) => {
  if (!verificarEmpresa(req, res)) {
    return;
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        tipo,
        descricao,
        assunto,
        prioridade,
        referencia,
        status,
        resposta,
        criado_em,
        atualizado_em

      FROM solicitacoes_privacidade

      WHERE empresa_id = $1
        AND usuario_id = $2

      ORDER BY criado_em DESC
      `,
      [
        req.usuario.empresa_id,
        req.usuario.id
      ]
    );

    return res.json(rows);
  } catch (err) {
    console.error('Erro ao listar solicitações de privacidade:', {
      message: err.message,
      code: err.code,
      detail: err.detail
    });

    return res.status(500).json({
      erro: 'Erro ao consultar solicitações de privacidade.'
    });
  }
});

// ============================================================
// EMPRESA — CRIAR SOLICITAÇÃO
// POST /api/privacidade/solicitacoes
// ============================================================

router.post('/solicitacoes', async (req, res) => {
  if (!verificarEmpresa(req, res)) {
    return;
  }

  try {
    const body = req.body || {};
    const { tipo, descricao } = body;

    if (
      typeof tipo !== 'string' ||
      !TIPOS_PERMITIDOS.includes(tipo)
    ) {
      return res.status(400).json({
        erro: 'Tipo de solicitação inválido.'
      });
    }

    const descricaoFinal =
      typeof descricao === 'string'
        ? descricao.trim()
        : '';

    if (descricaoFinal.length > 5000) {
      return res.status(400).json({
        erro: 'A descrição não pode ultrapassar 5000 caracteres.'
      });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO solicitacoes_privacidade (
        empresa_id,
        usuario_id,
        tipo,
        descricao,
        status
      )
      VALUES ($1, $2, $3, $4, 'pendente')
      RETURNING
        id,
        empresa_id,
        usuario_id,
        tipo,
        descricao,
        assunto,
        prioridade,
        referencia,
        status,
        resposta,
        criado_em,
        atualizado_em
      `,
      [
        req.usuario.empresa_id,
        req.usuario.id,
        tipo,
        descricaoFinal || null
      ]
    );

    return res.status(201).json({
      mensagem: 'Solicitação registrada com sucesso.',
      solicitacao: rows[0]
    });
  } catch (err) {
    console.error('Erro ao criar solicitação de privacidade:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
      table: err.table,
      column: err.column
    });

    return res.status(500).json({
      erro: 'Erro ao registrar solicitação de privacidade.'
    });
  }
});

// ============================================================
// EMPRESA — CONSULTAR UMA SOLICITAÇÃO
// GET /api/privacidade/solicitacoes/:id
// ============================================================

router.get('/solicitacoes/:id', async (req, res) => {
  if (!verificarEmpresa(req, res)) {
    return;
  }

  const id = validarIdSolicitacao(req, res);

  if (id === null) {
    return;
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        empresa_id,
        usuario_id,
        tipo,
        descricao,
        assunto,
        prioridade,
        referencia,
        status,
        resposta,
        criado_em,
        atualizado_em

      FROM solicitacoes_privacidade

      WHERE id = $1
        AND empresa_id = $2
        AND usuario_id = $3

      LIMIT 1
      `,
      [
        id,
        req.usuario.empresa_id,
        req.usuario.id
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Solicitação de privacidade não encontrada.'
      });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao consultar solicitação de privacidade:', {
      message: err.message,
      code: err.code,
      detail: err.detail
    });

    return res.status(500).json({
      erro: 'Erro ao consultar solicitação de privacidade.'
    });
  }
});

// ============================================================
// EMPRESA — CANCELAR SOLICITAÇÃO
// PATCH /api/privacidade/solicitacoes/:id/cancelar
// ============================================================

router.patch(
  '/solicitacoes/:id/cancelar',
  async (req, res) => {
    if (!verificarEmpresa(req, res)) {
      return;
    }

    const id = validarIdSolicitacao(req, res);

    if (id === null) {
      return;
    }

    try {
      const { rows } = await pool.query(
        `
        UPDATE solicitacoes_privacidade

        SET
          status = 'cancelada',
          atualizado_em = CURRENT_TIMESTAMP

        WHERE id = $1
          AND empresa_id = $2
          AND usuario_id = $3
          AND status = 'pendente'

        RETURNING
          id,
          empresa_id,
          usuario_id,
          tipo,
          descricao,
          assunto,
          prioridade,
          referencia,
          status,
          resposta,
          criado_em,
          atualizado_em
        `,
        [
          id,
          req.usuario.empresa_id,
          req.usuario.id
        ]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          erro:
            'Solicitação não encontrada ou não pode mais ser cancelada.'
        });
      }

      return res.json({
        mensagem: 'Solicitação cancelada com sucesso.',
        solicitacao: rows[0]
      });
    } catch (err) {
      console.error('Erro ao cancelar solicitação de privacidade:', {
        message: err.message,
        code: err.code,
        detail: err.detail,
        constraint: err.constraint,
        table: err.table,
        column: err.column
      });

      return res.status(500).json({
        erro: 'Erro ao cancelar solicitação de privacidade.'
      });
    }
  }
);

// ============================================================
// EXPORT
// ============================================================

module.exports = router;
