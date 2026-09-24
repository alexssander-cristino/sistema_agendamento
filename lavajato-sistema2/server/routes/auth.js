const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const exigirPermissao = require('../middleware/permissao');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

// ============================================================
// POST /api/auth/cadastro
// Cria uma nova empresa + primeiro usuário administrador
// ============================================================

router.post('/cadastro', async (req, res) => {
  const {
    empresa,
    email_empresa,
    telefone,
    nome,
    email,
    senha
  } = req.body;

  if (!empresa || !email_empresa || !nome || !email || !senha) {
    return res.status(400).json({
      erro: 'Informe empresa, e-mail da empresa, nome, e-mail e senha.'
    });
  }

  if (senha.length < 6) {
    return res.status(400).json({
      erro: 'A senha deve possuir pelo menos 6 caracteres.'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ==========================================================
    // Verifica se a empresa já existe
    // ==========================================================

    const empresaExistente = await client.query(
      'SELECT id FROM empresas WHERE LOWER(email) = LOWER($1)',
      [email_empresa]
    );

    if (empresaExistente.rows.length > 0) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'Já existe uma empresa cadastrada com esse e-mail.'
      });
    }

    // ==========================================================
    // Verifica se o usuário já existe
    // ==========================================================

    const usuarioExistente = await client.query(
      'SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (usuarioExistente.rows.length > 0) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        erro: 'Já existe um usuário cadastrado com esse e-mail.'
      });
    }

    // ==========================================================
    // Cria a empresa
    // ==========================================================

    const empresaResult = await client.query(
      `INSERT INTO empresas
        (nome, email, telefone)
       VALUES ($1, $2, $3)
       RETURNING id, nome, email, telefone`,
      [
        empresa,
        email_empresa,
        telefone || null
      ]
    );

    const novaEmpresa = empresaResult.rows[0];

    // ==========================================================
    // Cria senha criptografada
    // ==========================================================

    const senhaHash = await bcrypt.hash(senha, 12);

    // ==========================================================
    // Cria o primeiro usuário como ADMINISTRADOR
    // ==========================================================

    const usuarioResult = await client.query(
      `INSERT INTO usuarios
        (
          empresa_id,
          nome,
          email,
          senha,
          perfil
        )
       VALUES
        (
          $1,
          $2,
          $3,
          $4,
          'administrador'
        )
       RETURNING
          id,
          empresa_id,
          nome,
          email,
          perfil,
          ativo`,
      [
        novaEmpresa.id,
        nome,
        email,
        senhaHash
      ]
    );

    const usuario = usuarioResult.rows[0];

    await client.query('COMMIT');

    // ==========================================================
    // Cria token
    // ==========================================================

    const token = jwt.sign(
      {
        id: usuario.id,
        empresa_id: usuario.empresa_id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      },
      JWT_SECRET,
      {
        expiresIn: '7d'
      }
    );

    // ==========================================================
    // Resposta
    // ==========================================================

    res.status(201).json({
      mensagem: 'Empresa cadastrada com sucesso.',
      token,

      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      },

      empresa: novaEmpresa
    });

  } catch (err) {
    await client.query('ROLLBACK');

    console.error('Erro no cadastro:', err);

    res.status(500).json({
      erro: 'Não foi possível realizar o cadastro.'
    });

  } finally {
    client.release();
  }
});

// ============================================================
// POST /api/auth/login
// ============================================================

router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({
      erro: 'Informe e-mail e senha.'
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
          u.id,
          u.empresa_id,
          u.nome,
          u.email,
          u.senha,
          u.perfil,
          u.ativo,

          e.nome AS empresa_nome,
          e.email AS empresa_email,
          e.telefone AS empresa_telefone

       FROM usuarios u

       INNER JOIN empresas e
         ON e.id = u.empresa_id

       WHERE LOWER(u.email) = LOWER($1)

       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        erro: 'E-mail ou senha incorretos.'
      });
    }

    const usuario = rows[0];

    // ==========================================================
    // Usuário desativado
    // ==========================================================

    if (!usuario.ativo) {
      return res.status(403).json({
        erro: 'Este usuário está desativado.'
      });
    }

    // ==========================================================
    // Verifica senha
    // ==========================================================

    const senhaValida = await bcrypt.compare(
      senha,
      usuario.senha
    );

    if (!senhaValida) {
      return res.status(401).json({
        erro: 'E-mail ou senha incorretos.'
      });
    }

    // ==========================================================
    // Cria token
    // ==========================================================

    const token = jwt.sign(
      {
        id: usuario.id,
        empresa_id: usuario.empresa_id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      },
      JWT_SECRET,
      {
        expiresIn: '7d'
      }
    );

    // ==========================================================
    // Resposta
    // ==========================================================

    res.json({
      mensagem: 'Login realizado com sucesso.',

      token,

      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      },

      empresa: {
        id: usuario.empresa_id,
        nome: usuario.empresa_nome,
        email: usuario.empresa_email,
        telefone: usuario.empresa_telefone
      }
    });

  } catch (err) {
    console.error('Erro no login:', err);

    res.status(500).json({
      erro: 'Não foi possível realizar o login.'
    });
  }
});

// ============================================================
// GET /api/auth/me
// Retorna usuário atualmente autenticado
// ============================================================

router.get('/me', autenticar, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
          u.id,
          u.nome,
          u.email,
          u.perfil,
          u.ativo,

          e.id AS empresa_id,
          e.nome AS empresa_nome,
          e.email AS empresa_email,
          e.telefone AS empresa_telefone

       FROM usuarios u

       INNER JOIN empresas e
         ON e.id = u.empresa_id

       WHERE u.id = $1
         AND u.empresa_id = $2

       LIMIT 1`,
      [
        req.usuario.id,
        req.usuario.empresa_id
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Usuário não encontrado.'
      });
    }

    const usuario = rows[0];

    res.json({
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        ativo: usuario.ativo
      },

      empresa: {
        id: usuario.empresa_id,
        nome: usuario.empresa_nome,
        email: usuario.empresa_email,
        telefone: usuario.empresa_telefone
      }
    });

  } catch (err) {
    console.error('Erro ao buscar usuário:', err);

    res.status(500).json({
      erro: 'Não foi possível carregar os dados do usuário.'
    });
  }
});

module.exports = router;
