const pool = require('../db');

// ============================================================
// PERMISSÕES DISPONÍVEIS NO SISTEMA
// ============================================================

const PERMISSOES_DISPONIVEIS = [
  {
    codigo: 'agenda',
    nome: 'Agenda',
    descricao: 'Acesso à agenda e aos agendamentos.'
  },
  {
    codigo: 'faturamento',
    nome: 'Faturamento',
    descricao: 'Acesso ao faturamento.'
  },
  {
    codigo: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Acesso ao módulo financeiro.'
  },
  {
    codigo: 'servicos',
    nome: 'Serviços',
    descricao: 'Acesso ao cadastro de serviços.'
  },
  {
    codigo: 'clientes',
    nome: 'Clientes',
    descricao: 'Acesso ao cadastro de clientes.'
  },
  {
    codigo: 'despesas',
    nome: 'Despesas',
    descricao: 'Acesso às despesas.'
  }
];

// ============================================================
// BUSCAR PERMISSÕES DE UM USUÁRIO
// ============================================================

async function buscarPermissoesUsuario(usuarioId) {
  const { rows } = await pool.query(
    `SELECT
        id,
        permissao AS codigo
     FROM usuario_permissoes
     WHERE usuario_id = $1
     ORDER BY permissao ASC`,
    [usuarioId]
  );

  return rows.map((permissao) => ({
    id: permissao.id,
    codigo: permissao.codigo,
    nome:
      PERMISSOES_DISPONIVEIS.find(
        (item) => item.codigo === permissao.codigo
      )?.nome || permissao.codigo,
    descricao:
      PERMISSOES_DISPONIVEIS.find(
        (item) => item.codigo === permissao.codigo
      )?.descricao || ''
  }));
}

// ============================================================
// BUSCAR SOMENTE OS CÓDIGOS
// ============================================================

async function buscarCodigosPermissoesUsuario(usuarioId) {
  const { rows } = await pool.query(
    `SELECT permissao AS codigo
     FROM usuario_permissoes
     WHERE usuario_id = $1
     ORDER BY permissao ASC`,
    [usuarioId]
  );

  return rows.map((permissao) => permissao.codigo);
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

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Remove as permissões atuais
    await client.query(
      `DELETE FROM usuario_permissoes
       WHERE usuario_id = $1`,
      [usuarioId]
    );

    // Não há novas permissões
    if (lista.length === 0) {
      await client.query('COMMIT');
      return;
    }

    // Insere as novas permissões
    for (const permissao of lista) {
      await client.query(
        `INSERT INTO usuario_permissoes
          (
            usuario_id,
            empresa_id,
            permissao,
            permitido
          )
         SELECT
            $1,
            empresa_id,
            $2,
            TRUE
         FROM usuarios
         WHERE id = $1
         ON CONFLICT (usuario_id, permissao)
         DO UPDATE SET
            permitido = TRUE,
            atualizado_em = NOW()`,
        [
          usuarioId,
          permissao
        ]
      );
    }

    await client.query('COMMIT');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;

  } finally {
    client.release();
  }
}

// ============================================================
// TODAS AS PERMISSÕES DISPONÍVEIS
// ============================================================

async function buscarTodasPermissoes() {
  return PERMISSOES_DISPONIVEIS;
}

module.exports = {
  buscarPermissoesUsuario,
  buscarCodigosPermissoesUsuario,
  substituirPermissoesUsuario,
  buscarTodasPermissoes
};