const express = require('express');
const pool = require('../db');

const autenticar = require('../middleware/auth');
const somenteDev = require('../middleware/dev');
const { atualizarAssinatura } = require('../services/mercadoPago');

const router = express.Router();

// ============================================================
// PROTEÇÃO
// ============================================================

router.use(autenticar);
router.use(somenteDev);

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

async function tabelaExiste(nomeTabela) {
  const result = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS existe
    `,
    [nomeTabela]
  );

  return result.rows[0].existe;
}

async function colunaExiste(nomeTabela, nomeColuna) {
  const result = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS existe
    `,
    [nomeTabela, nomeColuna]
  );

  return result.rows[0].existe;
}

function respostaErro(res, mensagem, erro) {
  console.error(mensagem, erro);

  return res.status(500).json({
    erro: mensagem
  });
}

// ============================================================
// DASHBOARD
// ============================================================

router.get('/dashboard', async (req, res) => {
  try {
    const [
      empresasResult,
      usuariosResult,
      administradoresResult,
      funcionariosResult,
      planosResult,
      planosAtivosResult,
      assinaturasResult,
      assinaturasAtivasResult,
      assinaturasPendentesResult,
      assinaturasInadimplentesResult
    ] = await Promise.all([

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM empresas
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM usuarios
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM usuarios
        WHERE perfil = 'administrador'
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM usuarios
        WHERE perfil = 'funcionario'
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM planos
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM planos
        WHERE ativo = TRUE
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM assinaturas
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM assinaturas
        WHERE status = 'ativa'
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM assinaturas
        WHERE status = 'pendente'
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM assinaturas
        WHERE status = 'inadimplente'
      `)

    ]);

    return res.json({
      empresas: {
        total: empresasResult.rows[0].total
      },

      usuarios: {
        total: usuariosResult.rows[0].total,
        administradores:
          administradoresResult.rows[0].total,
        funcionarios:
          funcionariosResult.rows[0].total
      },

      planos: {
        total: planosResult.rows[0].total,
        ativos: planosAtivosResult.rows[0].total
      },

      assinaturas: {
        total: assinaturasResult.rows[0].total,
        ativas:
          assinaturasAtivasResult.rows[0].total,
        pendentes:
          assinaturasPendentesResult.rows[0].total,
        inadimplentes:
          assinaturasInadimplentesResult.rows[0].total
      }
    });

  } catch (err) {
    return respostaErro(
      res,
      'Não foi possível carregar o dashboard.',
      err
    );
  }
});

// ============================================================
// STATUS DO SISTEMA
// ============================================================

router.get('/status', async (req, res) => {
  try {
    const inicio = Date.now();

    await pool.query('SELECT 1');

    const tempoResposta = Date.now() - inicio;

    return res.json({
      banco: 'online',
      api: 'online',
      tempo_resposta_ms: tempoResposta,
      ambiente:
        process.env.NODE_ENV || 'development'
    });

  } catch (err) {
    console.error(
      'Erro no status do sistema:',
      err
    );

    return res.status(500).json({
      banco: 'offline',
      api: 'online',
      ambiente:
        process.env.NODE_ENV || 'development'
    });
  }
});

// ============================================================
// EMPRESAS
// ============================================================

// ------------------------------------------------------------
// LISTAR EMPRESAS
// GET /api/admin/empresas
// ------------------------------------------------------------

router.get('/empresas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id,
        e.nome,
        e.email,
        e.telefone,
        e.criado_em,

        (
          SELECT COUNT(*)::int
          FROM usuarios u
          WHERE u.empresa_id = e.id
        ) AS total_usuarios,

        (
          SELECT COUNT(*)::int
          FROM usuarios u
          WHERE u.empresa_id = e.id
            AND u.perfil = 'administrador'
        ) AS administradores,

        (
          SELECT COUNT(*)::int
          FROM usuarios u
          WHERE u.empresa_id = e.id
            AND u.perfil = 'funcionario'
        ) AS funcionarios,

        (
          SELECT COUNT(*)::int
          FROM assinaturas a
          WHERE a.empresa_id = e.id
            AND a.status IN (
              'pendente',
              'ativa',
              'pausada',
              'inadimplente'
            )
        ) AS possui_assinatura

      FROM empresas e
      ORDER BY e.id DESC
    `);

    return res.json({
      empresas: result.rows
    });

  } catch (err) {
    return respostaErro(
      res,
      'Não foi possível carregar as empresas.',
      err
    );
  }
});

// ------------------------------------------------------------
// DETALHES DA EMPRESA
// GET /api/admin/empresas/:id
// ------------------------------------------------------------

router.get('/empresas/:id', async (req, res) => {
  const empresaId = Number(req.params.id);

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    return res.status(400).json({
      erro: 'ID da empresa inválido.'
    });
  }

  try {
    const empresaResult = await pool.query(
      `
        SELECT *
        FROM empresas
        WHERE id = $1
        LIMIT 1
      `,
      [empresaId]
    );

    if (empresaResult.rows.length === 0) {
      return res.status(404).json({
        erro: 'Empresa não encontrada.'
      });
    }

    const usuariosResult = await pool.query(
      `
        SELECT
          id,
          nome,
          email,
          perfil,
          ativo,
          criado_em
        FROM usuarios
        WHERE empresa_id = $1
        ORDER BY id DESC
      `,
      [empresaId]
    );

    const assinaturaResult = await pool.query(
      `
        SELECT
          a.*,
          p.nome AS plano_nome,
          p.valor AS plano_valor,
          p.periodo AS plano_periodo
        FROM assinaturas a
        LEFT JOIN planos p
          ON p.id = a.plano_id
        WHERE a.empresa_id = $1
        ORDER BY a.id DESC
        LIMIT 1
      `,
      [empresaId]
    );

    return res.json({
      empresa: empresaResult.rows[0],

      usuarios: usuariosResult.rows,

      assinatura:
        assinaturaResult.rows[0] || null
    });

  } catch (err) {
    return respostaErro(
      res,
      'Não foi possível carregar os dados da empresa.',
      err
    );
  }
});

// ------------------------------------------------------------
// SELECIONAR EMPRESA PARA TESTE
// GET/POST /api/admin/empresas/:id/contexto
// ------------------------------------------------------------

router.post('/empresas/:id/contexto', async (req, res) => {
  const empresaId = Number(req.params.id);

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    return res.status(400).json({
      erro: 'ID da empresa inválido.'
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          nome,
          email,
          telefone
        FROM empresas
        WHERE id = $1
        LIMIT 1
      `,
      [empresaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        erro: 'Empresa não encontrada.'
      });
    }

    /*
     * O DEV continua sem empresa_id no banco.
     *
     * O contexto é apenas uma informação para o frontend
     * utilizar durante os testes.
     */

    return res.json({
      sucesso: true,
      mensagem: 'Empresa selecionada para teste.',
      contexto: {
        empresa_id: result.rows[0].id,
        empresa: result.rows[0]
      }
    });

  } catch (err) {
    return respostaErro(
      res,
      'Não foi possível selecionar a empresa.',
      err
    );
  }
});

// ------------------------------------------------------------
// LIMPAR CONTEXTO
// ------------------------------------------------------------

router.delete('/empresas/contexto', async (req, res) => {
  return res.json({
    sucesso: true,
    contexto: null
  });
});

// ============================================================
// ASSINATURAS
// ============================================================

// ------------------------------------------------------------
// LISTAR ASSINATURAS
// GET /api/admin/assinaturas
// ------------------------------------------------------------

router.get('/assinaturas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.empresa_id,
        a.plano_id,
        a.status,
        a.mercado_pago_id,
        a.inicio_em,
        a.proxima_cobranca_em,
        a.cancelada_em,
        a.criado_em,
        a.atualizado_em,

        e.nome AS empresa_nome,
        e.email AS empresa_email,

        p.nome AS plano_nome,
        p.valor AS plano_valor,
        p.periodo AS plano_periodo

      FROM assinaturas a

      LEFT JOIN empresas e
        ON e.id = a.empresa_id

      LEFT JOIN planos p
        ON p.id = a.plano_id

      ORDER BY a.id DESC
    `);

    return res.json({
      assinaturas: result.rows
    });

  } catch (err) {
    return respostaErro(
      res,
      'Não foi possível carregar as assinaturas.',
      err
    );
  }
});

// ------------------------------------------------------------
// DETALHES DA ASSINATURA
// GET /api/admin/assinaturas/:id
// ------------------------------------------------------------

router.get('/assinaturas/:id', async (req, res) => {
  const assinaturaId = Number(req.params.id);

  if (!Number.isInteger(assinaturaId) || assinaturaId <= 0) {
    return res.status(400).json({
      erro: 'ID da assinatura inválido.'
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          a.*,

          e.nome AS empresa_nome,
          e.email AS empresa_email,
          e.telefone AS empresa_telefone,

          p.nome AS plano_nome,
          p.descricao AS plano_descricao,
          p.valor AS plano_valor,
          p.periodo AS plano_periodo,
          p.ativo AS plano_ativo

        FROM assinaturas a

        LEFT JOIN empresas e
          ON e.id = a.empresa_id

        LEFT JOIN planos p
          ON p.id = a.plano_id

        WHERE a.id = $1

        LIMIT 1
      `,
      [assinaturaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        erro: 'Assinatura não encontrada.'
      });
    }

    return res.json({
      assinatura: result.rows[0]
    });

  } catch (err) {
    return respostaErro(
      res,
      'Não foi possível carregar a assinatura.',
      err
    );
  }
});

// ============================================================
// PAGAMENTOS
// ============================================================
// ------------------------------------------------------------
// AÇÕES NA ASSINATURA (chamam o Mercado Pago ANTES de gravar)
// PATCH /api/admin/assinaturas/:id/(cancelar|pausar|reativar)
// ------------------------------------------------------------

const ACOES_ASSINATURA = {
  cancelar: {
    statusMP: 'canceled', // a função converte para 'cancelled'
    permitidos: ['ativa', 'pausada', 'inadimplente', 'pendente'],
    sql: `status = 'cancelada', cancelada_em = NOW(), atualizado_em = NOW()`
  },
  pausar: {
    statusMP: 'paused',
    permitidos: ['ativa'],
    sql: `status = 'pausada', atualizado_em = NOW()`
  },
  reativar: {
    statusMP: 'authorized',
    permitidos: ['pausada', 'inadimplente'],
    sql: `status = 'ativa', atualizado_em = NOW()`
  }
};

router.patch('/assinaturas/:id/:acao', async (req, res) => {
  const id = Number(req.params.id);
  const config = ACOES_ASSINATURA[req.params.acao];

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ erro: 'ID da assinatura inválido.' });
  }

  if (!config) {
    return res.status(400).json({ erro: 'Ação inválida.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, status, mercado_pago_id FROM assinaturas WHERE id = $1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ erro: 'Assinatura não encontrada.' });
    }

    const assinatura = result.rows[0];

    if (!config.permitidos.includes(assinatura.status)) {
      return res.status(409).json({
        erro: `Não é possível ${req.params.acao} uma assinatura com status "${assinatura.status}".`
      });
    }

    if (!assinatura.mercado_pago_id) {
      return res.status(409).json({
        erro: 'A assinatura não possui ID no Mercado Pago.'
      });
    }

    // 1) Mercado Pago primeiro. Se falhar, o banco não é alterado.
    await atualizarAssinatura({
      mercadoPagoId: assinatura.mercado_pago_id,
      status: config.statusMP
    });

    // 2) Só então grava no banco.
    const atualizada = await pool.query(
      `UPDATE assinaturas SET ${config.sql} WHERE id = $1 RETURNING *`,
      [id]
    );

    return res.json({ ok: true, assinatura: atualizada.rows[0] });
  } catch (err) {
    console.error('Erro na ação da assinatura:', err);

    const status = Number(err?.status);

    return res.status(status >= 400 && status <= 599 ? status : 500).json({
      erro: err?.data
        ? `Mercado Pago: ${err.message}`
        : 'Não foi possível atualizar a assinatura.'
    });
  }
});

// ------------------------------------------------------------
// LISTAR PAGAMENTOS
// GET /api/admin/pagamentos
// ------------------------------------------------------------

router.get('/pagamentos', async (req, res) => {
  try {

    const existe = await tabelaExiste('pagamentos');

    if (!existe) {
      return res.json({
        pagamentos: [],
        tabela_existe: false,
        mensagem:
          'A tabela pagamentos ainda não foi criada.'
      });
    }

    const colunasResult = await pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pagamentos'
      `
    );

    const colunas = colunasResult.rows.map(
      row => row.column_name
    );

    const possuiEmpresaId =
      colunas.includes('empresa_id');

    const possuiAssinaturaId =
      colunas.includes('assinatura_id');

    const possuiPlanoId =
      colunas.includes('plano_id');

    let select = `p.*`;

    if (possuiEmpresaId) {
      select += `,
        e.nome AS empresa_nome`;
    }

    if (possuiAssinaturaId) {
      select += `,
        a.status AS assinatura_status`;
    }

    if (possuiPlanoId) {
      select += `,
        pl.nome AS plano_nome`;
    }

    let joins = '';

    if (possuiEmpresaId) {
      joins += `
        LEFT JOIN empresas e
          ON e.id = p.empresa_id
      `;
    }

    if (possuiAssinaturaId) {
      joins += `
        LEFT JOIN assinaturas a
          ON a.id = p.assinatura_id
      `;
    }

    if (possuiPlanoId) {
      joins += `
        LEFT JOIN planos pl
          ON pl.id = p.plano_id
      `;
    }

    const result = await pool.query(`
      SELECT
        ${select}

      FROM pagamentos p

      ${joins}

      ORDER BY p.id DESC
    `);

    return res.json({
      pagamentos: result.rows,
      tabela_existe: true,
      colunas
    });

  } catch (err) {
    return respostaErro(
      res,
      'Não foi possível carregar os pagamentos.',
      err
    );
  }
});

// ============================================================
// USUÁRIOS
// ============================================================

// ------------------------------------------------------------
// LISTAR USUÁRIOS
// GET /api/admin/usuarios
// ------------------------------------------------------------

router.get('/usuarios', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.nome,
        u.email,
        u.perfil,
        u.ativo,
        u.empresa_id,
        u.criado_em,

        e.nome AS empresa_nome

      FROM usuarios u

      LEFT JOIN empresas e
        ON e.id = u.empresa_id

      ORDER BY u.id DESC
    `);

    return res.json({
      usuarios: result.rows
    });

  } catch (err) {
    return respostaErro(
      res,
      'Não foi possível carregar os usuários.',
      err
    );
  }
});

// ------------------------------------------------------------
// DETALHES DO USUÁRIO
// GET /api/admin/usuarios/:id
// ------------------------------------------------------------

router.get('/usuarios/:id', async (req, res) => {
  const usuarioId = Number(req.params.id);

  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({
      erro: 'ID do usuário inválido.'
    });
  }

  try {
    const usuarioResult = await pool.query(
      `
        SELECT
          u.id,
          u.nome,
          u.email,
          u.perfil,
          u.ativo,
          u.empresa_id,
          u.criado_em,

          e.nome AS empresa_nome,
          e.email AS empresa_email

        FROM usuarios u

        LEFT JOIN empresas e
          ON e.id = u.empresa_id

        WHERE u.id = $1

        LIMIT 1
      `,
      [usuarioId]
    );

    if (usuarioResult.rows.length === 0) {
      return res.status(404).json({
        erro: 'Usuário não encontrado.'
      });
    }

    const usuario = usuarioResult.rows[0];

    // --------------------------------------------------------
    // PERMISSÕES
    // --------------------------------------------------------

    let permissoes = [];

    const tabelaPermissoesExiste =
      await tabelaExiste('usuario_permissoes');

    if (
      tabelaPermissoesExiste &&
      usuario.perfil !== 'administrador' &&
      usuario.perfil !== 'dev'
    ) {
      const permissoesResult = await pool.query(
        `
          SELECT
            permissao
          FROM usuario_permissoes
          WHERE usuario_id = $1
          ORDER BY permissao
        `,
        [usuarioId]
      );

      permissoes =
        permissoesResult.rows.map(
          row => row.permissao
        );
    }

    if (
      usuario.perfil === 'administrador' ||
      usuario.perfil === 'dev'
    ) {
      permissoes = [
        'agenda',
        'faturamento',
        'financeiro',
        'servicos',
        'clientes',
        'despesas',
        'usuarios',
        'configuracoes'
      ];
    }

    return res.json({
      usuario,
      permissoes
    });

  } catch (err) {
    return respostaErro(
      res,
      'Não foi possível carregar os dados do usuário.',
      err
    );
  }
});

// ============================================================
// INFORMAÇÕES GERAIS DO SISTEMA
// ============================================================

router.get('/info', async (req, res) => {
  try {
    const tabelas = [
      'empresas',
      'usuarios',
      'planos',
      'assinaturas',
      'pagamentos',
      'usuario_permissoes'
    ];

    const resultado = {};

    for (const tabela of tabelas) {
      resultado[tabela] =
        await tabelaExiste(tabela);
    }

    return res.json({
      banco: 'postgresql',
      tabelas: resultado,
      usuario: {
        id: req.usuario.id,
        nome: req.usuario.nome,
        email: req.usuario.email,
        perfil: req.usuario.perfil,
        empresa_id: req.usuario.empresa_id
      }
    });

  } catch (err) {
    return respostaErro(
      res,
      'Não foi possível carregar as informações do sistema.',
      err
    );
  }
});

// ============================================================
// LOGS
// ============================================================

router.get('/logs', async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        l.id,
        l.usuario_id,
        l.empresa_id,
        l.email_tentativa,
        l.acao,
        l.descricao,
        l.metodo,
        l.rota,
        l.ip,
        l.status_http,
        l.tempo_ms,
        l.criado_em,

        u.nome AS usuario_nome,
        u.email AS usuario_email,
        u.perfil AS usuario_perfil,

        e.nome AS empresa_nome

      FROM logs_sistema l

      LEFT JOIN usuarios u
        ON u.id = l.usuario_id

      LEFT JOIN empresas e
        ON e.id = l.empresa_id

      ORDER BY l.id DESC

      LIMIT 1000
    `);

    return res.json({
      logs: result.rows
    });

  } catch (err) {

    console.error(
      'Erro ao carregar logs:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível carregar os logs.'
    });
  }
});


// ============================================================
// RESUMO DOS LOGS
// ============================================================

router.get('/logs/resumo', async (req, res) => {
  try {

    const [
      total,
      hoje,
      erros,
      ips,
      loginSucesso,
      loginFalhou,
      metodos,
      ipsRanking
    ] = await Promise.all([

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM logs_sistema
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM logs_sistema
        WHERE criado_em >= CURRENT_DATE
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM logs_sistema
        WHERE status_http >= 400
      `),

      pool.query(`
        SELECT COUNT(DISTINCT ip)::int AS total
        FROM logs_sistema
        WHERE ip IS NOT NULL
          AND ip <> ''
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM logs_sistema
        WHERE acao = 'login_sucesso'
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM logs_sistema
        WHERE acao = 'login_falhou'
      `),

      pool.query(`
        SELECT
          metodo,
          COUNT(*)::int AS quantidade

        FROM logs_sistema

        WHERE metodo IS NOT NULL

        GROUP BY metodo

        ORDER BY quantidade DESC
      `),

      pool.query(`
        SELECT
          ip,
          COUNT(*)::int AS quantidade

        FROM logs_sistema

        WHERE ip IS NOT NULL
          AND ip <> ''

        GROUP BY ip

        ORDER BY quantidade DESC

        LIMIT 20
      `)

    ]);

    return res.json({

      total_requisicoes:
        total.rows[0].total,

      requisicoes_hoje:
        hoje.rows[0].total,

      requisicoes_com_erro:
        erros.rows[0].total,

      ips_unicos:
        ips.rows[0].total,

      login_sucesso:
        loginSucesso.rows[0].total,

      login_falhou:
        loginFalhou.rows[0].total,

      requisicoes_por_metodo:
        metodos.rows,

      requisicoes_por_ip:
        ipsRanking.rows

    });

  } catch (err) {

    console.error(
      'Erro ao carregar resumo dos logs:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível carregar o resumo dos logs.'
    });
  }
});


// ============================================================
// DETALHE DO LOG
// ============================================================

router.get('/logs/:id', async (req, res) => {

  const logId =
    Number(req.params.id);

  if (
    !Number.isInteger(logId) ||
    logId <= 0
  ) {
    return res.status(400).json({
      erro: 'ID do log inválido.'
    });
  }

  try {

    const result = await pool.query(
      `
        SELECT
          l.*,

          u.nome AS usuario_nome,
          u.email AS usuario_email,
          u.perfil AS usuario_perfil,

          e.nome AS empresa_nome

        FROM logs_sistema l

        LEFT JOIN usuarios u
          ON u.id = l.usuario_id

        LEFT JOIN empresas e
          ON e.id = l.empresa_id

        WHERE l.id = $1

        LIMIT 1
      `,
      [logId]
    );

    if (
      result.rows.length === 0
    ) {
      return res.status(404).json({
        erro: 'Log não encontrado.'
      });
    }

    return res.json({
      log: result.rows[0]
    });

  } catch (err) {

    console.error(
      'Erro ao carregar detalhe do log:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível carregar o log.'
    });
  }
});



/* ============================================================
 * CENTRO DE NOVIDADES — ORVIX
 * Base: /api/admin/novidades
 * Acesso: somente desenvolvedor
 * ============================================================ */

// ------------------------------------------------------------
// LISTAR NOVIDADES
// GET /api/admin/novidades
// ------------------------------------------------------------

router.get('/novidades', async (req, res) => {
  try {
    // Confirma que a tabela existe no schema public.
    const tabela = await pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'novidades'
      ) AS existe
    `);

    if (!tabela.rows[0].existe) {
      console.error(
        '[Novidades] A tabela public.novidades não existe.'
      );

      return res.status(500).json({
        erro: 'A tabela de novidades não foi encontrada no banco de dados.',
        codigo: 'TABELA_NOVIDADES_AUSENTE',
        novidades: []
      });
    }

    // Consulta os registros sem depender de um JOIN obrigatório.
    const resultado = await pool.query(`
      SELECT
        n.id,
        n.titulo,
        n.resumo,
        n.mensagem,
        n.categoria,
        n.link,
        n.status,
        n.publicada_em,
        n.criado_em,
        n.atualizado_em,
        n.criada_por,
        u.nome AS autor_nome
      FROM public.novidades n
      LEFT JOIN public.usuarios u
        ON u.id = n.criada_por
      ORDER BY n.criado_em DESC NULLS LAST, n.id DESC
    `);

    return res.status(200).json({
      sucesso: true,
      total: resultado.rowCount,
      novidades: resultado.rows
    });
  } catch (err) {
    console.error(
      '[Novidades] Erro ao consultar o banco:',
      {
        message: err.message,
        code: err.code,
        detail: err.detail,
        table: err.table,
        column: err.column
      }
    );

    return res.status(500).json({
      erro: 'Não foi possível carregar as novidades.',
      codigo: err.code || 'ERRO_AO_LISTAR_NOVIDADES',
      novidades: []
    });
  }
});

// ------------------------------------------------------------
// CRIAR RASCUNHO
// POST /api/admin/novidades
// ------------------------------------------------------------

router.post('/novidades', async (req, res) => {
  const {
    titulo,
    resumo,
    mensagem,
    categoria = 'novidade',
    link = null
  } = req.body || {};

  const categoriasValidas = [
    'novidade',
    'melhoria',
    'correcao',
    'aviso'
  ];

  if (
    typeof titulo !== 'string' ||
    !titulo.trim() ||
    titulo.trim().length > 160
  ) {
    return res.status(400).json({
      erro: 'Informe um título de até 160 caracteres.'
    });
  }

  if (
    typeof mensagem !== 'string' ||
    !mensagem.trim() ||
    mensagem.trim().length > 20000
  ) {
    return res.status(400).json({
      erro: 'Informe uma mensagem de até 20.000 caracteres.'
    });
  }

  if (
    resumo != null &&
    (
      typeof resumo !== 'string' ||
      resumo.trim().length > 280
    )
  ) {
    return res.status(400).json({
      erro: 'O resumo deve ter até 280 caracteres.'
    });
  }

  if (!categoriasValidas.includes(categoria)) {
    return res.status(400).json({
      erro: 'Categoria de novidade inválida.'
    });
  }

  if (
    link != null &&
    (
      typeof link !== 'string' ||
      link.trim().length > 500 ||
      !link.trim() ||
      /^(javascript|data|vbscript):/i.test(link.trim())
    )
  ) {
    return res.status(400).json({
      erro: 'Link inválido.'
    });
  }

  try {
    const resultado = await pool.query(
      `
        INSERT INTO public.novidades (
          titulo,
          resumo,
          mensagem,
          categoria,
          link,
          status,
          criada_por
        )
        VALUES ($1, $2, $3, $4, $5, 'rascunho', $6)
        RETURNING *
      `,
      [
        titulo.trim(),
        resumo?.trim() || null,
        mensagem.trim(),
        categoria,
        link?.trim() || null,
        req.usuario.id
      ]
    );

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Rascunho criado com sucesso.',
      novidade: resultado.rows[0]
    });
  } catch (err) {
    console.error(
      '[Novidades] Erro ao criar rascunho:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível criar o rascunho.',
      codigo: err.code || 'ERRO_AO_CRIAR_NOVIDADE'
    });
  }
});

// ------------------------------------------------------------
// EDITAR RASCUNHO
// PUT /api/admin/novidades/:id
// ------------------------------------------------------------

router.put('/novidades/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      erro: 'Identificador inválido.'
    });
  }

  const {
    titulo,
    resumo,
    mensagem,
    categoria = 'novidade',
    link = null
  } = req.body || {};

  const categoriasValidas = [
    'novidade',
    'melhoria',
    'correcao',
    'aviso'
  ];

  if (
    typeof titulo !== 'string' ||
    !titulo.trim() ||
    titulo.trim().length > 160 ||
    typeof mensagem !== 'string' ||
    !mensagem.trim() ||
    mensagem.trim().length > 20000 ||
    (
      resumo != null &&
      (
        typeof resumo !== 'string' ||
        resumo.trim().length > 280
      )
    ) ||
    !categoriasValidas.includes(categoria) ||
    (
      link != null &&
      (
        typeof link !== 'string' ||
        !link.trim() ||
        link.trim().length > 500 ||
        /^(javascript|data|vbscript):/i.test(link.trim())
      )
    )
  ) {
    return res.status(400).json({
      erro: 'Confira os campos e tente novamente.'
    });
  }

  try {
    const resultado = await pool.query(
      `
        UPDATE public.novidades
        SET
          titulo = $1,
          resumo = $2,
          mensagem = $3,
          categoria = $4,
          link = $5,
          atualizado_em = NOW()
        WHERE id = $6
          AND status = 'rascunho'
        RETURNING *
      `,
      [
        titulo.trim(),
        resumo?.trim() || null,
        mensagem.trim(),
        categoria,
        link?.trim() || null,
        id
      ]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        erro: 'Rascunho não encontrado ou não pode mais ser editado.'
      });
    }

    return res.json({
      sucesso: true,
      mensagem: 'Rascunho atualizado com sucesso.',
      novidade: resultado.rows[0]
    });
  } catch (err) {
    console.error(
      '[Novidades] Erro ao editar rascunho:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível atualizar o rascunho.',
      codigo: err.code || 'ERRO_AO_EDITAR_NOVIDADE'
    });
  }
});

// ------------------------------------------------------------
// PUBLICAR NOVIDADE
// POST /api/admin/novidades/:id/publicar
// ------------------------------------------------------------


router.post('/novidades/:id/publicar', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      erro: 'Identificador inválido.'
    });
  }

  let client;

  try {
    client = await pool.connect();

    await client.query('BEGIN');

    // Bloqueia a novidade para evitar duas publicações simultâneas.
    const resultado = await client.query(
      `
        SELECT *
        FROM public.novidades
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );

    if (resultado.rowCount === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        erro: 'Novidade não encontrada.'
      });
    }

    const novidade = resultado.rows[0];

    if (novidade.status !== 'rascunho') {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'Somente rascunhos podem ser publicados.'
      });
    }

    // Publica a novidade.
    const publicada = await client.query(
      `
        UPDATE public.novidades
        SET
          status = 'publicada',
          publicada_em = NOW(),
          atualizado_em = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [id]
    );

    // Cria uma notificação individual para cada usuário ativo
    // vinculado a uma empresa.
    const notificacoes = await client.query(
      `
        INSERT INTO public.notificacoes (
          empresa_id,
          usuario_id,
          tipo,
          titulo,
          mensagem,
          link
        )
        SELECT
          u.empresa_id,
          u.id,
          'novidade',
          $1,
          $2,
          $3
        FROM public.usuarios u
        WHERE u.empresa_id IS NOT NULL
          AND u.ativo = TRUE
        RETURNING id
      `,
      [
        novidade.titulo,
        novidade.resumo || novidade.mensagem,
        novidade.link
      ]
    );

    await client.query('COMMIT');

    return res.json({
      sucesso: true,
      mensagem: 'Novidade publicada e notificações enviadas.',
      novidade: publicada.rows[0],
      usuariosNotificados: notificacoes.rowCount
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (erroRollback) {
        console.error(
          '[Novidades] Erro ao reverter publicação:',
          erroRollback
        );
      }
    }

    console.error(
      '[Novidades] Erro ao publicar:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível publicar a novidade.',
      codigo: err.code || 'ERRO_AO_PUBLICAR_NOVIDADE'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});


// ------------------------------------------------------------
// ARQUIVAR NOVIDADE
// POST /api/admin/novidades/:id/arquivar
// ------------------------------------------------------------

router.post('/novidades/:id/arquivar', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      erro: 'Identificador inválido.'
    });
  }

  try {
    const resultado = await pool.query(
      `
        UPDATE public.novidades
        SET
          status = 'arquivada',
          atualizado_em = NOW()
        WHERE id = $1
          AND status IN ('rascunho', 'publicada')
        RETURNING *
      `,
      [id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        erro: 'Novidade não encontrada ou já arquivada.'
      });
    }

    return res.json({
      sucesso: true,
      mensagem: 'Novidade arquivada com sucesso.',
      novidade: resultado.rows[0]
    });
  } catch (err) {
    console.error(
      '[Novidades] Erro ao arquivar:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível arquivar a novidade.',
      codigo: err.code || 'ERRO_AO_ARQUIVAR_NOVIDADE'
    });
  }
});



// ============================================================
// EXPORTAÇÃO
// ============================================================

module.exports = router;