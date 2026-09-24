const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const autenticar = require('../middleware/auth');

const router = express.Router();

// ============================================================
// TODAS AS ROTAS DE USUÁRIOS EXIGEM LOGIN
// ============================================================

router.use(autenticar);

// ============================================================
// VERIFICA SE O USUÁRIO É ADMINISTRADOR
// ============================================================

function somenteAdministrador(req, res, next) {
  if (req.usuario.perfil !== 'administrador') {
    return res.status(403).json({
      erro: 'Acesso permitido somente para administradores.'
    });
  }

  next();
}

// ============================================================
// GET /api/usuarios
// Lista os usuários da empresa logada
// ============================================================

router.get('/', async (req, res) => {
  const empresaId = req.usuario.empresa_id;

  try {
    const { rows } = await pool.query(
      `SELECT
          id,
          empresa_id,
          nome,
          email,
          perfil,
          ativo,
          criado_em
       FROM usuarios
       WHERE empresa_id = $1
       ORDER BY nome ASC`,
      [empresaId]
    );

    res.json(rows);

  } catch (err) {
    console.error('Erro ao listar usuários:', err);

    res.status(500).json({
      erro: 'Não foi possível carregar os usuários.'
    });
  }
});

// ============================================================
// POST /api/usuarios
// Cria um novo usuário dentro da empresa
// Somente administrador
// ============================================================

router.post('/', somenteAdministrador, async (req, res) => {
  const empresaId = req.usuario.empresa_id;

  const {
    nome,
    email,
    senha,
    perfil
  } = req.body;

  // ==========================================================
  // Validações
  // ==========================================================

  if (!nome || !email || !senha) {
    return res.status(400).json({
      erro: 'Informe nome, e-mail e senha.'
    });
  }

  if (senha.length < 6) {
    return res.status(400).json({
      erro: 'A senha deve possuir pelo menos 6 caracteres.'
    });
  }

  const perfilFinal =
    perfil === 'administrador'
      ? 'administrador'
      : 'funcionario';

  try {
    // ==========================================================
    // Verifica se o e-mail já está sendo usado
    // ==========================================================

    const usuarioExistente = await pool.query(
      `SELECT id
       FROM usuarios
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (usuarioExistente.rows.length > 0) {
      return res.status(409).json({
        erro: 'Já existe um usuário cadastrado com esse e-mail.'
      });
    }

    // ==========================================================
    // Criptografa senha
    // ==========================================================

    const senhaHash = await bcrypt.hash(senha, 12);

    // ==========================================================
    // Cria usuário
    //
    // empresa_id vem do TOKEN.
    // Nunca vem do formulário.
    // ==========================================================

    const { rows } = await pool.query(
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
          $5
        )
       RETURNING
          id,
          empresa_id,
          nome,
          email,
          perfil,
          ativo,
          criado_em`,
      [
        empresaId,
        nome,
        email,
        senhaHash,
        perfilFinal
      ]
    );

    res.status(201).json({
      mensagem: 'Usuário criado com sucesso.',
      usuario: rows[0]
    });

  } catch (err) {
    console.error('Erro ao criar usuário:', err);

    res.status(500).json({
      erro: 'Não foi possível criar o usuário.'
    });
  }
});

// ============================================================
// PUT /api/usuarios/:id
// Edita usuário
// Somente administrador
// ============================================================

router.put('/:id', somenteAdministrador, async (req, res) => {
  const { id } = req.params;
  const empresaId = req.usuario.empresa_id;

  const {
    nome,
    email,
    perfil,
    ativo
  } = req.body;

  try {
    // ==========================================================
    // Verifica se o usuário pertence à empresa
    // ==========================================================

    const existente = await pool.query(
      `SELECT *
       FROM usuarios
       WHERE id = $1
         AND empresa_id = $2`,
      [
        id,
        empresaId
      ]
    );

    if (existente.rows.length === 0) {
      return res.status(404).json({
        erro: 'Usuário não encontrado.'
      });
    }

    const usuarioAtual = existente.rows[0];

    // ==========================================================
    // Evita que o administrador remova o próprio acesso
    // ==========================================================

    if (
      Number(id) === Number(req.usuario.id) &&
      ativo === false
    ) {
      return res.status(400).json({
        erro: 'Você não pode desativar o próprio usuário.'
      });
    }

    // ==========================================================
    // Verifica e-mail duplicado
    // ==========================================================

    if (email !== undefined) {
      const emailExistente = await pool.query(
        `SELECT id
         FROM usuarios
         WHERE LOWER(email) = LOWER($1)
           AND id <> $2`,
        [
          email,
          id
        ]
      );

      if (emailExistente.rows.length > 0) {
        return res.status(409).json({
          erro: 'Já existe outro usuário com esse e-mail.'
        });
      }
    }

    // ==========================================================
    // Monta atualização
    // ==========================================================

    const novoNome =
      nome !== undefined
        ? nome
        : usuarioAtual.nome;

    const novoEmail =
      email !== undefined
        ? email
        : usuarioAtual.email;

    const novoPerfil =
      perfil === 'administrador' || perfil === 'funcionario'
        ? perfil
        : usuarioAtual.perfil;

    const novoAtivo =
      ativo !== undefined
        ? Boolean(ativo)
        : usuarioAtual.ativo;

    // ==========================================================
    // Atualiza
    // ==========================================================

    const { rows } = await pool.query(
      `UPDATE usuarios
       SET
          nome = $1,
          email = $2,
          perfil = $3,
          ativo = $4,
          atualizado_em = NOW()
       WHERE id = $5
         AND empresa_id = $6
       RETURNING
          id,
          empresa_id,
          nome,
          email,
          perfil,
          ativo,
          criado_em,
          atualizado_em`,
      [
        novoNome,
        novoEmail,
        novoPerfil,
        novoAtivo,
        id,
        empresaId
      ]
    );

    res.json({
      mensagem: 'Usuário atualizado com sucesso.',
      usuario: rows[0]
    });

  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);

    res.status(500).json({
      erro: 'Não foi possível atualizar o usuário.'
    });
  }
});

// ============================================================
// PATCH /api/usuarios/:id/senha
// Altera senha de um usuário
// Somente administrador
// ============================================================

router.patch('/:id/senha', somenteAdministrador, async (req, res) => {
  const { id } = req.params;
  const empresaId = req.usuario.empresa_id;

  const { senha } = req.body;

  if (!senha) {
    return res.status(400).json({
      erro: 'Informe a nova senha.'
    });
  }

  if (senha.length < 6) {
    return res.status(400).json({
      erro: 'A senha deve possuir pelo menos 6 caracteres.'
    });
  }

  try {
    const existente = await pool.query(
      `SELECT id
       FROM usuarios
       WHERE id = $1
         AND empresa_id = $2`,
      [
        id,
        empresaId
      ]
    );

    if (existente.rows.length === 0) {
      return res.status(404).json({
        erro: 'Usuário não encontrado.'
      });
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    await pool.query(
      `UPDATE usuarios
       SET
          senha = $1,
          atualizado_em = NOW()
       WHERE id = $2
         AND empresa_id = $3`,
      [
        senhaHash,
        id,
        empresaId
      ]
    );

    res.json({
      mensagem: 'Senha alterada com sucesso.'
    });

  } catch (err) {
    console.error('Erro ao alterar senha:', err);

    res.status(500).json({
      erro: 'Não foi possível alterar a senha.'
    });
  }
});

// ============================================================
// DELETE /api/usuarios/:id
// Remove usuário
// Somente administrador
// ============================================================

router.delete('/:id', somenteAdministrador, async (req, res) => {
  const { id } = req.params;
  const empresaId = req.usuario.empresa_id;

  // ==========================================================
  // Impede excluir o próprio usuário
  // ==========================================================

  if (Number(id) === Number(req.usuario.id)) {
    return res.status(400).json({
      erro: 'Você não pode excluir o próprio usuário.'
    });
  }

  try {
    const resultado = await pool.query(
      `DELETE FROM usuarios
       WHERE id = $1
         AND empresa_id = $2`,
      [
        id,
        empresaId
      ]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        erro: 'Usuário não encontrado.'
      });
    }

    res.status(204).end();

  } catch (err) {
    console.error('Erro ao remover usuário:', err);

    res.status(500).json({
      erro: 'Não foi possível remover o usuário.'
    });
  }
});

module.exports = router;
