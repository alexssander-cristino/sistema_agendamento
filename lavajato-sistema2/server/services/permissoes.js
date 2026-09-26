const pool = require('../db');

// ============================================================
// PERMISSÕES DISPONÍVEIS NO SISTEMA
// ============================================================

const PERMISSOES_DISPONIVEIS = [
  {
    codigo: 'agenda',
    nome: 'Agenda',
    descricao: 'Visualizar e gerenciar agendamentos'
  },
  {
    codigo: 'faturamento',
    nome: 'Faturamento',
    descricao: 'Visualizar faturamento'
  },
  {
    codigo: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Visualizar informações financeiras'
  },
  {
    codigo: 'servicos',
    nome: 'Serviços',
    descricao: 'Gerenciar serviços'
  },
  {
    codigo: 'clientes',
    nome: 'Clientes',
    descricao: 'Gerenciar clientes'
  },
  {
    codigo: 'despesas',
    nome: 'Despesas',
    descricao: 'Gerenciar despesas'
  },
  {
    codigo: 'usuarios',
    nome: 'Usuários',
    descricao: 'Gerenciar usuários'
  },
  {
    codigo: 'configuracoes',
    nome: 'Configurações',
    descricao: 'Gerenciar configurações da empresa'
  }
];

// ============================================================
// BUSCAR TODAS AS PERMISSÕES
// ============================================================

async function buscarTodasPermissoes() {
  const { rows } = await pool.query(`
    SELECT
      id,
      codigo,
      nome,
      descricao
    FROM permissoes
    ORDER BY id
  `);

  return rows;
}

// ============================================================
// BUSCAR PERMISSÕES DE UM USUÁRIO
// ============================================================

async function buscarPermissoesUsuario(usuarioId) {
  const { rows } = await pool.query(
    `
    SELECT
      p.id,
      p.codigo,
      p.nome,
      p.descricao
    FROM usuario_permissoes up
    INNER JOIN permissoes p
      ON p.id = up.permissao_id
    WHERE up.usuario_id = $1
    ORDER BY p.id
    `,
    [usuarioId]
  );

  return rows;
}

// ============================================================
// BUSCAR SOMENTE OS CÓDIGOS DAS PERMISSÕES
// ============================================================

async function buscarCodigosPermissoesUsuario(usuarioId) {
  const { rows } = await pool.query(
    `
    SELECT
      p.codigo
    FROM usuario_permissoes up
    INNER JOIN permissoes p
      ON p.id = up.permissao_id
    WHERE up.usuario_id = $1
    ORDER BY p.id
    `,
    [usuarioId]
  );

  return rows.map((permissao) => permissao.codigo);
}

// ============================================================
// VALIDAR CÓDIGOS DE PERMISSÃO
// ============================================================

async function validarPermissoes(permissoes) {
  if (!Array.isArray(permissoes)) {
    return [];
  }

  const lista = [
    ...new Set(
      permissoes
        .filter((permissao) => typeof permissao === 'string')
        .map((permissao) => permissao.trim())
        .filter(Boolean)
    )
  ];

  if (lista.length === 0) {
    return [];
  }

  const { rows } = await pool.query(
    `
    SELECT
      id,
      codigo
    FROM permissoes
    WHERE codigo = ANY($1::text[])
    ORDER BY id
    `,
    [lista]
  );

  const encontrados = new Set(
    rows.map((permissao) => permissao.codigo)
  );

  const invalidos = lista.filter(
    (codigo) => !encontrados.has(codigo)
  );

  if (invalidos.length > 0) {
    const erro = new Error(
      `Permissões inválidas: ${invalidos.join(', ')}`
    );

    erro.codigo = 'PERMISSOES_INVALIDAS';
    erro.permissoesInvalidas = invalidos;

    throw erro;
  }

  return rows;
}

// ============================================================
// SUBSTITUIR PERMISSÕES DO USUÁRIO
// ============================================================

async function substituirPermissoesUsuario(
  usuarioId,
  permissoes
) {
  const lista = Array.isArray(permissoes)
    ? permissoes
    : [];

  // Valida os códigos antes de alterar o banco
  const permissoesValidas = await validarPermissoes(lista);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Remove todas as permissões atuais
    await client.query(
      `
      DELETE FROM usuario_permissoes
      WHERE usuario_id = $1
      `,
      [usuarioId]
    );

    // Se não houver permissões novas,
    // o usuário ficará sem permissões.
    if (permissoesValidas.length === 0) {
      await client.query('COMMIT');
      return [];
    }

    // Insere as novas permissões
    for (const permissao of permissoesValidas) {
      await client.query(
        `
        INSERT INTO usuario_permissoes
        (
          usuario_id,
          permissao_id
        )
        VALUES ($1, $2)
        ON CONFLICT (usuario_id, permissao_id)
        DO NOTHING
        `,
        [
          usuarioId,
          permissao.id
        ]
      );
    }

    await client.query('COMMIT');

    return permissoesValidas;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;

  } finally {
    client.release();
  }
}

// ============================================================
// SUBSTITUIR PERMISSÕES USANDO OS CÓDIGOS
// ============================================================

async function substituirPermissoesPorCodigo(
  usuarioId,
  permissoes
) {
  return await substituirPermissoesUsuario(
    usuarioId,
    permissoes
  );
}

// ============================================================
// BUSCAR ID DE UMA PERMISSÃO PELO CÓDIGO
// ============================================================

async function buscarPermissaoPorCodigo(codigo) {
  const { rows } = await pool.query(
    `
    SELECT
      id,
      codigo,
      nome,
      descricao
    FROM permissoes
    WHERE codigo = $1
    LIMIT 1
    `,
    [codigo]
  );

  return rows[0] || null;
}

// ============================================================
// BUSCAR IDS DAS PERMISSÕES
// ============================================================

async function buscarIdsPermissoes(permissoes) {
  const permissoesValidas = await validarPermissoes(permissoes);

  return permissoesValidas.map(
    (permissao) => permissao.id
  );
}

// ============================================================
// EXPORTAÇÕES
// ============================================================

module.exports = {
  PERMISSOES_DISPONIVEIS,
  buscarTodasPermissoes,
  buscarPermissoesUsuario,
  buscarCodigosPermissoesUsuario,
  validarPermissoes,
  substituirPermissoesUsuario,
  substituirPermissoesPorCodigo,
  buscarPermissaoPorCodigo,
  buscarIdsPermissoes
};