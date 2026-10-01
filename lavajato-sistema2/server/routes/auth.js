const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const pool = require('../db');
const autenticar = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn(
    'AVISO: JWT_SECRET não configurado no ambiente.'
  );
}

const PERMISSOES_ADMINISTRADOR = [
  'agenda',
  'faturamento',
  'financeiro',
  'servicos',
  'clientes',
  'despesas',
  'usuarios',
  'configuracoes'
];

// ============================================================
// FUNÇÃO - OBTER PERMISSÕES DO USUÁRIO
// ============================================================

async function obterPermissoesUsuario(usuario) {
  /*
   * DEV possui acesso administrativo ao SaaS.
   *
   * Neste momento retornamos uma permissão especial
   * para que o frontend consiga identificar o perfil.
   *
   * O acesso real às rotas do painel DEV será protegido
   * pelo middleware somenteDev.
   */
  if (usuario.perfil === 'dev') {
    return [];
  }

  /*
   * Administrador possui todas as permissões
   * da própria empresa.
   */
  if (usuario.perfil === 'dev' ||
      usuario.perfil === 'administrador') {
    return PERMISSOES_ADMINISTRADOR;
  }

  /*
   * Funcionário possui somente as permissões
   * cadastradas para ele.
   */
  const { rows } = await pool.query(
    `
    SELECT p.codigo
    FROM usuario_permissoes up

    INNER JOIN permissoes p
      ON p.id = up.permissao_id

    WHERE up.usuario_id = $1

    ORDER BY p.codigo
    `,
    [
      usuario.id
    ]
  );

  return rows.map(
    row => row.codigo
  );
}

// ============================================================
// FUNÇÃO - GERAR TOKEN
// ============================================================

function gerarToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      empresa_id: usuario.empresa_id ?? null,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil
    },
    JWT_SECRET,
    {
      expiresIn: '7d'
    }
  );
}

// ============================================================
// CADASTRO
// ============================================================

router.post('/cadastro', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      empresa,
      nome,
      email,
      senha
    } = req.body;

    if (
      !empresa ||
      !empresa.nome ||
      !nome ||
      !email ||
      !senha
    ) {
      return res.status(400).json({
        erro: 'Preencha todos os campos obrigatórios.'
      });
    }

    const nomeEmpresa = empresa.nome.trim();
    const nomeUsuario = nome.trim();
    const emailNormalizado = email
      .trim()
      .toLowerCase();

    if (!nomeEmpresa) {
      return res.status(400).json({
        erro: 'Informe o nome da empresa.'
      });
    }

    if (!nomeUsuario) {
      return res.status(400).json({
        erro: 'Informe seu nome.'
      });
    }

    if (!emailNormalizado) {
      return res.status(400).json({
        erro: 'Informe um e-mail válido.'
      });
    }

    if (senha.length < 6) {
      return res.status(400).json({
        erro: 'A senha deve possuir pelo menos 6 caracteres.'
      });
    }

    await client.query('BEGIN');

    /*
     * Verifica se já existe usuário com esse e-mail.
     */
    const usuarioExistente = await client.query(
      `
      SELECT id
      FROM usuarios
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [
        emailNormalizado
      ]
    );

    if (usuarioExistente.rows.length > 0) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'Este e-mail já está cadastrado.'
      });
    }

    /*
     * Cria a empresa.
     */
    const empresaResult = await client.query(
      `
      INSERT INTO empresas (
        nome,
        email
      )
      VALUES ($1, $2)
      RETURNING
        id,
        nome,
        email
      `,
      [
        nomeEmpresa,
        emailNormalizado
      ]
    );

    const novaEmpresa = empresaResult.rows[0];

    /*
     * Criptografa a senha.
     */
    const senhaHash = await bcrypt.hash(
      senha,
      10
    );

    /*
     * Primeiro usuário da empresa será administrador.
     */
    const usuarioResult = await client.query(
      `
      INSERT INTO usuarios (
        empresa_id,
        nome,
        email,
        senha,
        perfil,
        ativo
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'administrador',
        TRUE
      )
      RETURNING
        id,
        empresa_id,
        nome,
        email,
        perfil,
        ativo
      `,
      [
        novaEmpresa.id,
        nomeUsuario,
        emailNormalizado,
        senhaHash
      ]
    );

    const novoUsuario = usuarioResult.rows[0];

    await client.query('COMMIT');

    const permissoes = await obterPermissoesUsuario(
      novoUsuario
    );

    const token = gerarToken(
      novoUsuario
    );

    return res.status(201).json({
      mensagem: 'Cadastro realizado com sucesso.',
      token,
      usuario: {
        id: novoUsuario.id,
        nome: novoUsuario.nome,
        email: novoUsuario.email,
        perfil: novoUsuario.perfil,
        empresa_id: novoUsuario.empresa_id,
        permissoes
      },
      empresa: {
        id: novaEmpresa.id,
        nome: novaEmpresa.nome,
        email: novaEmpresa.email
      }
    });

  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Ignora erro de rollback.
    }

    console.error(
      'Erro no cadastro:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível realizar o cadastro.'
    });

  } finally {
    client.release();
  }
});

// ============================================================
// LOGIN
// ============================================================

router.post('/login', async (req, res) => {
  try {
    const {
      email,
      senha
    } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        erro: 'Informe e-mail e senha.'
      });
    }

    const emailNormalizado = email
      .trim()
      .toLowerCase();

    /*
     * LEFT JOIN é importante porque o DEV
     * pode não possuir empresa.
     */
    const { rows } = await pool.query(
      `
      SELECT
        u.id,
        u.empresa_id,
        u.nome,
        u.email,
        u.senha,
        u.perfil,
        u.ativo,

        e.id AS empresa_id_join,
        e.nome AS empresa_nome,
        e.email AS empresa_email,
        e.telefone AS empresa_telefone,
        e.ativo AS empresa_ativo

      FROM usuarios u

      LEFT JOIN empresas e
        ON e.id = u.empresa_id

      WHERE LOWER(u.email) = LOWER($1)

      LIMIT 1
      `,
      [
        emailNormalizado
      ]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        erro: 'E-mail ou senha inválidos.'
      });
    }

    const usuario = rows[0];

    /*
     * Usuário precisa estar ativo.
     */
    if (!usuario.ativo) {
      return res.status(403).json({
        erro: 'Este usuário está desativado.'
      });
    }

    /*
     * Usuários normais obrigatoriamente precisam
     * estar vinculados a uma empresa.
     */
    if (
      usuario.perfil !== 'dev' &&
      !usuario.empresa_id
    ) {
      return res.status(403).json({
        erro: 'Usuário não está vinculado a uma empresa.'
      });
    }

    /*
     * Compara a senha.
     */
    const senhaValida = await bcrypt.compare(
      senha,
      usuario.senha
    );

    if (!senhaValida) {
      return res.status(401).json({
        erro: 'E-mail ou senha inválidos.'
      });
    }

    const permissoes = await obterPermissoesUsuario(
      usuario
    );

    const token = gerarToken(
      usuario
    );

    /*
     * Monta empresa somente quando existir.
     */
    let empresa = null;

    if (usuario.empresa_id) {
      empresa = {
        id: usuario.empresa_id,
        nome: usuario.empresa_nome,
        email: usuario.empresa_email,
        telefone: usuario.empresa_telefone,
        ativo: usuario.empresa_ativo
      };
    }

    return res.status(200).json({
      mensagem: 'Login realizado com sucesso.',
      token,

      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        empresa_id: usuario.empresa_id ?? null,
        permissoes
      },

      empresa
    });

  } catch (err) {
    console.error(
      'Erro no login:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível realizar o login.'
    });
  }
});

// ============================================================
// ME
// ============================================================

router.get('/me', autenticar, async (req, res) => {
  try {
    /*
     * DEV pode ter empresa_id NULL.
     *
     * Por isso a busca é feita somente pelo ID
     * do usuário.
     */
    const { rows } = await pool.query(
      `
      SELECT
        u.id,
        u.empresa_id,
        u.nome,
        u.email,
        u.perfil,
        u.ativo,

        e.id AS empresa_id_join,
        e.nome AS empresa_nome,
        e.email AS empresa_email,
        e.telefone AS empresa_telefone,
        e.ativo AS empresa_ativo

      FROM usuarios u

      LEFT JOIN empresas e
        ON e.id = u.empresa_id

      WHERE u.id = $1

      LIMIT 1
      `,
      [
        req.usuario.id
      ]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        erro: 'Usuário não encontrado.'
      });
    }

    const usuario = rows[0];

    if (!usuario.ativo) {
      return res.status(403).json({
        erro: 'Este usuário está desativado.'
      });
    }

    /*
     * Proteção adicional:
     * administrador e funcionário precisam
     * possuir empresa.
     */
    if (
      usuario.perfil !== 'dev' &&
      !usuario.empresa_id
    ) {
      return res.status(403).json({
        erro: 'Usuário não está vinculado a uma empresa.'
      });
    }

    const permissoes = await obterPermissoesUsuario(
      usuario
    );

    let empresa = null;

    if (usuario.empresa_id) {
      empresa = {
        id: usuario.empresa_id,
        nome: usuario.empresa_nome,
        email: usuario.empresa_email,
        telefone: usuario.empresa_telefone,
        ativo: usuario.empresa_ativo
      };
    }

    return res.status(200).json({
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        empresa_id: usuario.empresa_id ?? null,
        permissoes
      },

      empresa
    });

  } catch (err) {
    console.error(
      'Erro ao obter usuário autenticado:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível obter os dados do usuário.'
    });
  }
});

module.exports = router;