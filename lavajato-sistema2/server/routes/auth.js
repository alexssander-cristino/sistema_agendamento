const express = require('express');

const bcrypt = require('bcryptjs');

const jwt = require('jsonwebtoken');

const crypto = require('crypto');

const pool = require('../db');

const autenticar =
  require('../middleware/auth');

const {
  buscarCodigosPermissoesUsuario
} =
  require('../services/permissoes');

const {
  enviarEmailRecuperacaoSenha
} =
  require('../services/email');

const router =
  express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET;

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const TEMPO_RECUPERACAO_MINUTOS =
  30;

// ============================================================
// PERMISSÕES DO ADMINISTRADOR / DEV
// ============================================================

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
// VALIDAR CONFIGURAÇÕES
// ============================================================

if (!JWT_SECRET) {

  console.error(
    'ERRO: JWT_SECRET não foi configurado.'
  );

}

// ============================================================
// BUSCAR PERMISSÕES DO USUÁRIO
// ============================================================

async function obterPermissoesUsuario(
  usuario
) {

  // ==========================================================
  // ADMINISTRADOR E DEV POSSUEM TODAS AS PERMISSÕES
  // ==========================================================

  if (
    usuario.perfil === 'administrador' ||
    usuario.perfil === 'dev'
  ) {

    return PERMISSOES_ADMINISTRADOR;

  }

  // ==========================================================
  // FUNCIONÁRIO
  // ==========================================================

  return await buscarCodigosPermissoesUsuario(
    usuario.id
  );

}

// ============================================================
// NORMALIZAR E-MAIL
// ============================================================

function normalizarEmail(
  email
) {

  return String(
    email || ''
  )
    .trim()
    .toLowerCase();

}

// ============================================================
// GERAR TOKEN DE RECUPERAÇÃO
// ============================================================

function gerarTokenRecuperacao() {

  return crypto.randomBytes(
    32
  ).toString('hex');

}

// ============================================================
// GERAR HASH DO TOKEN
// ============================================================

function gerarHashToken(
  token
) {

  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

}

// ============================================================
// URL BASE DA APLICAÇÃO
// ============================================================

function obterUrlAplicacao() {

  const url =
    process.env.APP_URL;

  if (!url) {

    throw new Error(
      'APP_URL não configurada.'
    );

  }

  return url.replace(
    /\/+$/,
    ''
  );

}

// ============================================================
// POST /api/auth/cadastro
// Cria uma nova empresa + primeiro usuário administrador
// ============================================================

router.post(
  '/cadastro',
  async (req, res) => {

    const {
      empresa,
      email_empresa,
      telefone,
      nome,
      email,
      senha
    } = req.body;

    if (
      !empresa ||
      !email_empresa ||
      !nome ||
      !email ||
      !senha
    ) {

      return res.status(400).json({
        erro:
          'Informe empresa, e-mail da empresa, nome, e-mail e senha.'
      });

    }

    if (
      String(senha).length < 6
    ) {

      return res.status(400).json({
        erro:
          'A senha deve possuir pelo menos 6 caracteres.'
      });

    }

    const client =
      await pool.connect();

    try {

      await client.query(
        'BEGIN'
      );

      // ======================================================
      // Verifica se a empresa já existe
      // ======================================================

      const empresaExistente =
        await client.query(
          `
          SELECT id
          FROM empresas
          WHERE LOWER(email) =
                LOWER($1)
          `,
          [
            email_empresa
          ]
        );

      if (
        empresaExistente.rows.length >
        0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          erro:
            'Já existe uma empresa cadastrada com esse e-mail.'
        });

      }

      // ======================================================
      // Verifica se o usuário já existe
      // ======================================================

      const usuarioExistente =
        await client.query(
          `
          SELECT id
          FROM usuarios
          WHERE LOWER(email) =
                LOWER($1)
          `,
          [
            email
          ]
        );

      if (
        usuarioExistente.rows.length >
        0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          erro:
            'Já existe um usuário cadastrado com esse e-mail.'
        });

      }

      // ======================================================
      // Cria empresa
      //
      // Conta normal:
      // conta_teste = FALSE
      // ======================================================

      const empresaResult =
        await client.query(
          `
          INSERT INTO empresas
            (
              nome,
              email,
              telefone,
              conta_teste
            )
          VALUES
            (
              $1,
              $2,
              $3,
              FALSE
            )
          RETURNING
            id,
            nome,
            email,
            telefone,
            conta_teste
          `,
          [
            empresa,
            email_empresa,
            telefone || null
          ]
        );

      const novaEmpresa =
        empresaResult.rows[0];

      // ======================================================
      // Cria senha criptografada
      // ======================================================

      const senhaHash =
        await bcrypt.hash(
          senha,
          12
        );

      // ======================================================
      // Cria administrador
      // ======================================================

      const usuarioResult =
        await client.query(
          `
          INSERT INTO usuarios
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
            ativo
          `,
          [
            novaEmpresa.id,
            nome,
            email,
            senhaHash
          ]
        );

      const usuario =
        usuarioResult.rows[0];

      await client.query(
        'COMMIT'
      );

      // ======================================================
      // PERMISSÕES
      // ======================================================

      const permissoes =
        PERMISSOES_ADMINISTRADOR;

      // ======================================================
      // JWT
      // ======================================================

      const token =
        jwt.sign(
          {
            id:
              usuario.id,

            empresa_id:
              usuario.empresa_id,

            nome:
              usuario.nome,

            email:
              usuario.email,

            perfil:
              usuario.perfil
          },
          JWT_SECRET,
          {
            expiresIn:
              '7d'
          }
        );

      // ======================================================
      // RESPOSTA
      // ======================================================

      return res.status(201).json({

        mensagem:
          'Empresa cadastrada com sucesso.',

        token,

        usuario: {

          id:
            usuario.id,

          nome:
            usuario.nome,

          email:
            usuario.email,

          perfil:
            usuario.perfil,

          ativo:
            usuario.ativo,

          permissoes

        },

        empresa: {

          id:
            novaEmpresa.id,

          nome:
            novaEmpresa.nome,

          email:
            novaEmpresa.email,

          telefone:
            novaEmpresa.telefone,

          conta_teste:
            novaEmpresa.conta_teste

        }

      });

    } catch (err) {

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch {}

      console.error(
        'Erro no cadastro:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível realizar o cadastro.'
      });

    } finally {

      client.release();

    }

  }
);

// ============================================================
// POST /api/auth/login
// ============================================================

router.post(
  '/login',
  async (req, res) => {

    const {
      email,
      senha
    } = req.body;

    if (
      !email ||
      !senha
    ) {

      return res.status(400).json({
        erro:
          'Informe e-mail e senha.'
      });

    }


    try {

      const { rows } =
        await pool.query(
          `
          SELECT
            u.id,
            u.empresa_id,
            u.nome,
            u.email,
            u.senha,
            u.perfil,
            u.ativo,

            e.nome AS empresa_nome,
            e.email AS empresa_email,
            e.telefone AS empresa_telefone,
            e.conta_teste AS empresa_conta_teste

          FROM usuarios u

          LEFT JOIN empresas e
            ON e.id = u.empresa_id

          WHERE LOWER(u.email) =
                LOWER($1)

          LIMIT 1
          `,
          [
            email
          ]
        );

      if (
        rows.length === 0
      ) {

        return res.status(401).json({
          erro:
            'E-mail ou senha incorretos.'
        });

      }

          if (response.status === 429) {
            window.location.href = '/429.html';
          return;
          }

      const usuario =
        rows[0];

      // ======================================================
      // Usuário desativado
      // ======================================================

      if (
        !usuario.ativo
      ) {

        return res.status(403).json({
          erro:
            'Este usuário está desativado.'
        });

      }

      // ======================================================
      // Senha
      // ======================================================

      const senhaValida =
        await bcrypt.compare(
          senha,
          usuario.senha
        );

      if (
        !senhaValida
      ) {

        return res.status(401).json({
          erro:
            'E-mail ou senha incorretos.'
        });

      }

      // ======================================================
      // Permissões
      // ======================================================

      const permissoes =
        await obterPermissoesUsuario(
          usuario
        );

      // ======================================================
      // JWT
      // ======================================================

      const token =
        jwt.sign(
          {
            id:
              usuario.id,

            empresa_id:
              usuario.empresa_id,

            nome:
              usuario.nome,

            email:
              usuario.email,

            perfil:
              usuario.perfil
          },
          JWT_SECRET,
          {
            expiresIn:
              '7d'
          }
        );

      // ======================================================
      // RESPOSTA
      //
      // DEV não possui empresa.
      // ======================================================

      return res.json({

        mensagem:
          'Login realizado com sucesso.',

        token,

        usuario: {

          id:
            usuario.id,

          nome:
            usuario.nome,

          email:
            usuario.email,

          perfil:
            usuario.perfil,

          ativo:
            usuario.ativo,

          permissoes

        },

        empresa:
          usuario.perfil === 'dev'
            ? null
            : {

                id:
                  usuario.empresa_id,

                nome:
                  usuario.empresa_nome,

                email:
                  usuario.empresa_email,

                telefone:
                  usuario.empresa_telefone,

                conta_teste:
                  usuario.empresa_conta_teste

              }

      });

    } catch (err) {

      console.error(
        'Erro no login:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível realizar o login.'
      });

    }

  }
);

// ============================================================
// POST /api/auth/esqueci-senha
// Solicita recuperação de senha
// ============================================================

router.post(
  '/esqueci-senha',
  async (req, res) => {

    /*
     * IMPORTANTE:
     *
     * A resposta é sempre a mesma,
     * mesmo quando o e-mail não existe.
     *
     * Isso evita descoberta de contas.
     */

    const respostaPadrao = {

      mensagem:
        'Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.'

    };

    const email =
      normalizarEmail(
        req.body?.email
      );

    if (!email) {

      return res.json(
        respostaPadrao
      );

    }

    try {

      // ======================================================
      // Procura usuário
      // ======================================================

      const resultado =
        await pool.query(
          `
          SELECT
            id,
            nome,
            email,
            ativo
          FROM usuarios
          WHERE LOWER(email) = $1
          LIMIT 1
          `,
          [
            email
          ]
        );

      /*
       * Não revelar se o usuário existe.
       */

      if (
        resultado.rows.length === 0
      ) {

        return res.json(
          respostaPadrao
        );

      }

      const usuario =
        resultado.rows[0];

      /*
       * Usuário desativado também recebe
       * a mesma resposta.
       */

      if (
        !usuario.ativo
      ) {

        return res.json(
          respostaPadrao
        );

      }

      // ======================================================
      // Gera token
      // ======================================================

      const token =
        gerarTokenRecuperacao();

      const tokenHash =
        gerarHashToken(
          token
        );

      // ======================================================
      // Remove tokens anteriores
      // ======================================================

      await pool.query(
        `
        DELETE FROM recuperacao_senha
        WHERE usuario_id = $1
          AND usado_em IS NULL
        `,
        [
          usuario.id
        ]
      );

      // ======================================================
      // Calcula expiração
      // ======================================================

      const expiraEm =
        new Date(
          Date.now() +
          TEMPO_RECUPERACAO_MINUTOS *
          60 *
          1000
        );

      // ======================================================
      // Salva hash do token
      // ======================================================

      await pool.query(
        `
        INSERT INTO recuperacao_senha
          (
            usuario_id,
            token_hash,
            expira_em
          )
        VALUES
          (
            $1,
            $2,
            $3
          )
        `,
        [
          usuario.id,
          tokenHash,
          expiraEm
        ]
      );

      // ======================================================
      // Monta link
      // ======================================================

      const appUrl =
        obterUrlAplicacao();

      const link =
        `${appUrl}/recuperar-senha.html?token=${encodeURIComponent(token)}`;

      // ======================================================
      // Envia e-mail
      // ======================================================

      await enviarEmailRecuperacaoSenha({

        para:
          usuario.email,

        nome:
          usuario.nome,

        link

      });

      console.log(
        'E-mail de recuperação de senha enviado.',
        {
          usuario_id:
            usuario.id
        }
      );

      return res.json(
        respostaPadrao
      );

    } catch (err) {

      console.error(
        'Erro ao solicitar recuperação de senha:',
        err.message
      );

      /*
       * Nunca retornar detalhes internos
       * para o usuário.
       */

      return res.json(
        respostaPadrao
      );

    }

  }
);

// ============================================================
// POST /api/auth/redefinir-senha
// Define nova senha usando token
// ============================================================

router.post(
  '/redefinir-senha',
  async (req, res) => {

    const {
      token,
      senha
    } =
      req.body || {};

    if (
      !token ||
      !senha
    ) {

      return res.status(400).json({
        erro:
          'Informe o token e a nova senha.'
      });

    }

    if (
      String(senha).length < 6
    ) {

      return res.status(400).json({
        erro:
          'A senha deve possuir pelo menos 6 caracteres.'
      });

    }

    const tokenNormalizado =
      String(token).trim();

    if (
      !/^[a-fA-F0-9]{64}$/.test(
        tokenNormalizado
      )
    ) {

      return res.status(400).json({
        erro:
          'Token de recuperação inválido ou expirado.'
      });

    }

    const tokenHash =
      gerarHashToken(
        tokenNormalizado
      );

    const client =
      await pool.connect();

    try {

      await client.query(
        'BEGIN'
      );

      // ======================================================
      // Busca token válido
      // ======================================================

      const resultado =
        await client.query(
          `
          SELECT
            r.id,
            r.usuario_id,
            r.expira_em,
            u.nome,
            u.email,
            u.ativo

          FROM recuperacao_senha r

          INNER JOIN usuarios u
            ON u.id = r.usuario_id

          WHERE r.token_hash = $1
            AND r.usado_em IS NULL
            AND r.expira_em > NOW()

          LIMIT 1

          FOR UPDATE OF r
          `,
          [
            tokenHash
          ]
        );

      if (
        resultado.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          erro:
            'Token de recuperação inválido ou expirado.'
        });

      }

      const recuperacao =
        resultado.rows[0];

      // ======================================================
      // Usuário desativado
      // ======================================================

      if (
        !recuperacao.ativo
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(403).json({
          erro:
            'Este usuário está desativado.'
        });

      }

      // ======================================================
      // Cria nova senha
      // ======================================================

      const novaSenhaHash =
        await bcrypt.hash(
          senha,
          12
        );

      // ======================================================
      // Atualiza senha
      // ======================================================

      await client.query(
        `
        UPDATE usuarios

        SET
          senha = $1

        WHERE id = $2
        `,
        [
          novaSenhaHash,
          recuperacao.usuario_id
        ]
      );

      // ======================================================
      // Invalida TODOS os tokens do usuário
      // ======================================================

      await client.query(
        `
        UPDATE recuperacao_senha

        SET
          usado_em = NOW()

        WHERE usuario_id = $1
          AND usado_em IS NULL
        `,
        [
          recuperacao.usuario_id
        ]
      );

      await client.query(
        'COMMIT'
      );

      console.log(
        'Senha redefinida com sucesso.',
        {
          usuario_id:
            recuperacao.usuario_id
        }
      );

      return res.json({
        mensagem:
          'Senha redefinida com sucesso. Você já pode entrar novamente.'
      });

    } catch (err) {

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch {}

      console.error(
        'Erro ao redefinir senha:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível redefinir a senha.'
      });

    } finally {

      client.release();

    }

  }
);

// ============================================================
// GET /api/auth/me
// Retorna usuário atualmente autenticado
// ============================================================

router.get(
  '/me',
  autenticar,
  async (req, res) => {

    try {

      const { rows } =
        await pool.query(
          `
          SELECT

            u.id,
            u.nome,
            u.email,
            u.perfil,
            u.ativo,

            e.id AS empresa_id,
            e.nome AS empresa_nome,
            e.email AS empresa_email,
            e.telefone AS empresa_telefone,
            e.conta_teste AS empresa_conta_teste

          FROM usuarios u

          LEFT JOIN empresas e
            ON e.id = u.empresa_id

          WHERE
            u.id = $1

            AND (
              (
                u.perfil = 'dev'
                AND u.empresa_id IS NULL
              )

              OR

              (
                u.perfil <> 'dev'
                AND u.empresa_id = $2
              )
            )

          LIMIT 1
          `,
          [
            req.usuario.id,
            req.usuario.empresa_id
          ]
        );

      if (
        rows.length === 0
      ) {

        return res.status(404).json({
          erro:
            'Usuário não encontrado.'
        });

      }

      const usuario =
        rows[0];

      // ======================================================
      // Verifica usuário ativo
      // ======================================================

      if (
        !usuario.ativo
      ) {

        return res.status(403).json({
          erro:
            'Este usuário está desativado.'
        });

      }

      // ======================================================
      // Permissões
      // ======================================================

      const permissoes =
        await obterPermissoesUsuario(
          usuario
        );

      // ======================================================
      // RESPOSTA
      // ======================================================

      return res.json({

        usuario: {

          id:
            usuario.id,

          nome:
            usuario.nome,

          email:
            usuario.email,

          perfil:
            usuario.perfil,

          ativo:
            usuario.ativo,

          permissoes

        },

        empresa:
          usuario.perfil === 'dev'
            ? null
            : {

                id:
                  usuario.empresa_id,

                nome:
                  usuario.empresa_nome,

                email:
                  usuario.empresa_email,

                telefone:
                  usuario.empresa_telefone,

                conta_teste:
                  usuario.empresa_conta_teste

              }

      });

    } catch (err) {

      console.error(
        'Erro ao buscar usuário:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível carregar os dados do usuário.'
      });

    }

  }
);

module.exports = router;