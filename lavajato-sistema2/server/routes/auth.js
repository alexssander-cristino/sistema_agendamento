const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');

const autenticar = require('../middleware/auth');

const {
  authRateLimit,
  passwordResetRateLimit
} = require('../middleware/rateLimit');

const {
  buscarCodigosPermissoesUsuario
} = require('../services/permissoes');

const {
  enviarEmailRecuperacaoSenha
} = require('../services/email');

const {
  registrarAuditoria
} = require('../services/auditoria');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const TEMPO_RECUPERACAO_MINUTOS = 30;
const TEMPO_JWT_DIAS = 7;
const COOKIE_TOKEN = 'token';

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
// CONFIGURAÇÕES DO COOKIE
// ============================================================

function obterOpcoesCookieToken() {
  const producao =
    process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: producao,
    sameSite: 'lax',
    maxAge:
      TEMPO_JWT_DIAS *
      24 *
      60 *
      60 *
      1000,
    path: '/'
  };
}

// ============================================================
// DEFINIR COOKIE DO TOKEN
// ============================================================

function definirCookieToken(res, token) {
  res.cookie(
    COOKIE_TOKEN,
    token,
    obterOpcoesCookieToken()
  );
}

// ============================================================
// LIMPAR COOKIE DO TOKEN
// ============================================================

function limparCookieToken(res) {
  const opcoes =
    obterOpcoesCookieToken();

  delete opcoes.maxAge;

  res.clearCookie(
    COOKIE_TOKEN,
    opcoes
  );
}

// ============================================================
// VALIDAR CONFIGURAÇÕES
// ============================================================

if (!JWT_SECRET) {
  console.error(
    'ERRO: JWT_SECRET não foi configurado no ambiente.'
  );
}

// ============================================================
// BUSCAR PERMISSÕES DO USUÁRIO
// ============================================================

async function obterPermissoesUsuario(usuario) {
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

function normalizarEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

// ============================================================
// GERAR TOKEN DE RECUPERAÇÃO
// ============================================================

function gerarTokenRecuperacao() {
  return crypto
    .randomBytes(32)
    .toString('hex');
}

// ============================================================
// GERAR HASH DO TOKEN
// ============================================================

function gerarHashToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

// ============================================================
// URL BASE DA APLICAÇÃO
// ============================================================

function obterUrlAplicacao() {
  const url = String(
    process.env.APP_URL || ''
  ).trim();

  if (!url) {
    throw new Error(
      'APP_URL não configurada.'
    );
  }

  return url.replace(/\/+$/, '');
}

// ============================================================
// GERAR JWT
// ============================================================

function gerarTokenJwt(usuario) {
  if (!JWT_SECRET) {
    throw new Error(
      'JWT_SECRET não configurado.'
    );
  }

  return jwt.sign(
    {
      id: usuario.id,

      empresa_id:
        usuario.empresa_id ?? null,

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
        `${TEMPO_JWT_DIAS}d`
    }
  );
}

// ============================================================
// POST /api/auth/cadastro
// ============================================================
// Cria uma nova empresa e o primeiro administrador.
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
    } = req.body || {};

    // ========================================================
    // VALIDAR CAMPOS
    // ========================================================

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

    const emailEmpresaNormalizado =
      normalizarEmail(email_empresa);

    const emailUsuarioNormalizado =
      normalizarEmail(email);

    const nomeEmpresa =
      String(empresa).trim();

    const nomeUsuario =
      String(nome).trim();

    const senhaString =
      String(senha);

    // ========================================================
    // VALIDAR E-MAIL
    // ========================================================

    const regexEmail =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !regexEmail.test(
        emailEmpresaNormalizado
      )
    ) {
      return res.status(400).json({
        erro:
          'Informe um e-mail válido para a empresa.'
      });
    }

    if (
      !regexEmail.test(
        emailUsuarioNormalizado
      )
    ) {
      return res.status(400).json({
        erro:
          'Informe um e-mail válido para o usuário.'
      });
    }

    // ========================================================
    // VALIDAR SENHA
    // ========================================================

    if (
      senhaString.length < 6
    ) {
      return res.status(400).json({
        erro:
          'A senha deve possuir pelo menos 6 caracteres.'
      });
    }

    // ========================================================
    // VALIDAR NOMES
    // ========================================================

    if (!nomeEmpresa) {
      return res.status(400).json({
        erro:
          'Informe o nome da empresa.'
      });
    }

    if (!nomeUsuario) {
      return res.status(400).json({
        erro:
          'Informe o nome do usuário.'
      });
    }

    // ========================================================
    // CONEXÃO
    // ========================================================

    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN'
      );

      // ======================================================
      // VERIFICAR EMPRESA
      // ======================================================

      const empresaExistente =
        await client.query(
          `
          SELECT id
          FROM empresas
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,
          [
            emailEmpresaNormalizado
          ]
        );

      if (
        empresaExistente.rows.length > 0
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
      // VERIFICAR USUÁRIO
      // ======================================================

      const usuarioExistente =
        await client.query(
          `
          SELECT id
          FROM usuarios
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,
          [
            emailUsuarioNormalizado
          ]
        );

      if (
        usuarioExistente.rows.length > 0
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
      // CRIAR EMPRESA
      // ======================================================

      const empresaResult =
        await client.query(
          `
          INSERT INTO empresas (
            nome,
            email,
            telefone,
            conta_teste
          )
          VALUES (
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
            nomeEmpresa,

            emailEmpresaNormalizado,

            telefone
              ? String(telefone).trim()
              : null
          ]
        );

      const novaEmpresa =
        empresaResult.rows[0];

      // ======================================================
      // CRIAR SENHA CRIPTOGRAFADA
      // ======================================================

      const senhaHash =
        await bcrypt.hash(
          senhaString,
          12
        );

      // ======================================================
      // CRIAR ADMINISTRADOR
      // ======================================================

      const usuarioResult =
        await client.query(
          `
          INSERT INTO usuarios (
            empresa_id,
            nome,
            email,
            senha,
            perfil
          )
          VALUES (
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
            nomeUsuario,
            emailUsuarioNormalizado,
            senhaHash
          ]
        );

      const usuario =
        usuarioResult.rows[0];

      // ======================================================
      // COMMIT
      // ======================================================

      await client.query(
        'COMMIT'
      );

      // ======================================================
      // AUDITORIA DO CADASTRO
      // ======================================================
      //
      // Importante:
      // - Não registra senha
      // - Não registra hash da senha
      // - Não registra JWT
      //

      await registrarAuditoria(req, {
        acao: 'criacao',
        entidade: 'empresa',
        entidadeId: novaEmpresa.id,
        detalhes: {
          origem: 'cadastro',
          nome_empresa: novaEmpresa.nome,
          usuario_id: usuario.id
        }
      });

      // ======================================================
      // PERMISSÕES
      // ======================================================

      const permissoes =
        PERMISSOES_ADMINISTRADOR;

      // ======================================================
      // GERAR JWT
      // ======================================================

      const token =
        gerarTokenJwt(
          usuario
        );

      // ======================================================
      // SALVAR JWT NO COOKIE HTTPONLY
      // ======================================================

      definirCookieToken(
        res,
        token
      );

      // ======================================================
      // RESPOSTA
      // ======================================================
      //
      // O token continua sendo enviado na resposta por
      // compatibilidade com o frontend atual.
      //
      // O cookie HttpOnly também é criado.
      //

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
      } catch (_) {}

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
    } = req.body || {};

    // ========================================================
    // VALIDAR CAMPOS
    // ========================================================

    if (
      !email ||
      !senha
    ) {
      return res.status(400).json({
        erro:
          'Informe e-mail e senha.'
      });
    }

    const emailNormalizado =
      normalizarEmail(email);

    try {
      // ======================================================
      // BUSCAR USUÁRIO
      // ======================================================

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
          WHERE LOWER(u.email) = LOWER($1)
          LIMIT 1
          `,
          [
            emailNormalizado
          ]
        );

      // ======================================================
      // USUÁRIO NÃO ENCONTRADO
      // ======================================================

      if (
        rows.length === 0
      ) {
        const tentativas =
          req.rateLimit?.used || 1;

        const limite =
          req.rateLimit?.limit || 10;

        return res.status(401).json({
          erro:
            `E-mail ou senha incorretos. Tentativa ${tentativas} de ${limite}.`,

          codigo:
            'CREDENCIAIS_INVALIDAS',

          tentativas,

          limite
        });
      }

      const usuario =
        rows[0];

      // ======================================================
      // USUÁRIO DESATIVADO
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
      // VERIFICAR SENHA
      // ======================================================

      const senhaValida =
        await bcrypt.compare(
          String(senha),
          usuario.senha
        );

      // ======================================================
      // SENHA INCORRETA
      // ======================================================

      if (
        !senhaValida
      ) {
        const tentativas =
          req.rateLimit?.used || 1;

        const limite =
          req.rateLimit?.limit || 10;

        return res.status(401).json({
          erro:
            `E-mail ou senha incorretos. Tentativa ${tentativas} de ${limite}.`,

          codigo:
            'CREDENCIAIS_INVALIDAS',

          tentativas,

          limite
        });
      }

      // ======================================================
      // PERMISSÕES
      // ======================================================

      const permissoes =
        await obterPermissoesUsuario(
          usuario
        );

      // ======================================================
      // GERAR JWT
      // ======================================================

      const token =
        gerarTokenJwt(
          usuario
        );

      // ======================================================
      // SALVAR JWT NO COOKIE HTTPONLY
      // ======================================================

      definirCookieToken(
        res,
        token
      );

      // ======================================================
      // AUDITORIA DO LOGIN
      // ======================================================
      //
      // Não registra:
      // - senha
      // - JWT
      // - dados sensíveis
      //

      await registrarAuditoria(req, {
        acao: 'login',
        entidade: 'usuario',
        entidadeId: usuario.id,
        detalhes: {
          origem: 'login'
        }
      });

      // ======================================================
      // RESPOSTA
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
// POST /api/auth/logout
// ============================================================

router.post(
  '/logout',
  autenticar,
  async (req, res) => {
    try {
      // ======================================================
      // AUDITORIA DO LOGOUT
      // ======================================================

      await registrarAuditoria(req, {
        acao: 'logout',
        entidade: 'usuario',
        entidadeId: req.usuario.id,
        detalhes: {
          origem: 'logout'
        }
      });
    } catch (erro) {
      console.error(
        'Erro ao registrar auditoria do logout:',
        erro.message
      );
    }

    // ======================================================
    // LIMPAR COOKIE
    // ======================================================

    limparCookieToken(
      res
    );

    return res.json({
      mensagem:
        'Logout realizado com sucesso.'
    });
  }
);

// ============================================================
// POST /api/auth/esqueci-senha
// ============================================================

router.post(
  '/esqueci-senha',
  passwordResetRateLimit,
  async (req, res) => {
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
      // PROCURAR USUÁRIO
      // ======================================================

      const resultado =
        await pool.query(
          `
          SELECT
            id,
            nome,
            email,
            ativo,
            empresa_id
          FROM usuarios
          WHERE LOWER(email) = $1
          LIMIT 1
          `,
          [
            email
          ]
        );

      if (
        resultado.rows.length === 0
      ) {
        return res.json(
          respostaPadrao
        );
      }

      const usuario =
        resultado.rows[0];

      // ======================================================
      // USUÁRIO DESATIVADO
      // ======================================================

      if (
        !usuario.ativo
      ) {
        return res.json(
          respostaPadrao
        );
      }

      // ======================================================
      // GERAR TOKEN
      // ======================================================

      const token =
        gerarTokenRecuperacao();

      const tokenHash =
        gerarHashToken(
          token
        );

      // ======================================================
      // REMOVER TOKENS ANTERIORES
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
      // EXPIRAÇÃO
      // ======================================================

      const expiraEm =
        new Date(
          Date.now() +
          TEMPO_RECUPERACAO_MINUTOS *
          60 *
          1000
        );

      // ======================================================
      // SALVAR TOKEN
      // ======================================================

      await pool.query(
        `
        INSERT INTO recuperacao_senha (
          usuario_id,
          token_hash,
          expira_em
        )
        VALUES (
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
      // LINK
      // ======================================================

      const appUrl =
        obterUrlAplicacao();

      const link =
        `${appUrl}/recuperar-senha.html?token=${encodeURIComponent(token)}`;

      // ======================================================
      // ENVIAR E-MAIL
      // ======================================================

      await enviarEmailRecuperacaoSenha({
        para:
          usuario.email,

        nome:
          usuario.nome,

        link
      });

      // ======================================================
      // AUDITORIA
      // ======================================================
      //
      // NÃO registramos:
      // - token
      // - token_hash
      // - link
      //

      if (usuario.empresa_id) {
        const usuarioAuditoriaAnterior =
          req.usuario;

        req.usuario = {
          ...(usuarioAuditoriaAnterior || {}),
          id: usuario.id,
          empresa_id: usuario.empresa_id,
          nome: usuario.nome,
          email: usuario.email
        };

        try {
          await registrarAuditoria(req, {
            acao: 'criacao',
            entidade: 'recuperacao_senha',
            entidadeId: usuario.id,
            detalhes: {
              origem: 'recuperacao_senha'
            }
          });
        } finally {
          req.usuario =
            usuarioAuditoriaAnterior;
        }
      }

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

      return res.json(
        respostaPadrao
      );
    }
  }
);

// ============================================================
// POST /api/auth/redefinir-senha
// ============================================================

router.post(
  '/redefinir-senha',
  async (req, res) => {
    const {
      token,
      senha
    } = req.body || {};

    // ========================================================
    // VALIDAR CAMPOS
    // ========================================================

    if (
      !token ||
      !senha
    ) {
      return res.status(400).json({
        erro:
          'Informe o token e a nova senha.'
      });
    }

    // ========================================================
    // VALIDAR SENHA
    // ========================================================

    if (
      String(senha).length < 6
    ) {
      return res.status(400).json({
        erro:
          'A senha deve possuir pelo menos 6 caracteres.'
      });
    }

    // ========================================================
    // NORMALIZAR TOKEN
    // ========================================================

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
      // BUSCAR TOKEN
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
            u.ativo,
            u.empresa_id
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

      // ======================================================
      // TOKEN INVÁLIDO
      // ======================================================

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
      // USUÁRIO DESATIVADO
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
      // NOVA SENHA
      // ======================================================

      const novaSenhaHash =
        await bcrypt.hash(
          String(senha),
          12
        );

      // ======================================================
      // ATUALIZAR SENHA
      // ======================================================

      await client.query(
        `
        UPDATE usuarios
        SET senha = $1
        WHERE id = $2
        `,
        [
          novaSenhaHash,
          recuperacao.usuario_id
        ]
      );

      // ======================================================
      // INVALIDAR TODOS OS TOKENS
      // ======================================================

      await client.query(
        `
        UPDATE recuperacao_senha
        SET usado_em = NOW()
        WHERE usuario_id = $1
          AND usado_em IS NULL
        `,
        [
          recuperacao.usuario_id
        ]
      );

      // ======================================================
      // COMMIT
      // ======================================================

      await client.query(
        'COMMIT'
      );

      // ======================================================
      // AUDITORIA DA ALTERAÇÃO DE SENHA
      // ======================================================
      //
      // Não registramos:
      // - senha antiga
      // - senha nova
      // - hash
      // - token
      //

      if (recuperacao.empresa_id) {
        const usuarioAnterior =
          req.usuario;

        req.usuario = {
          ...(usuarioAnterior || {}),
          id:
            recuperacao.usuario_id,
          empresa_id:
            recuperacao.empresa_id,
          nome:
            recuperacao.nome,
          email:
            recuperacao.email
        };

        try {
          await registrarAuditoria(req, {
            acao: 'atualizacao',
            entidade: 'usuario',
            entidadeId:
              recuperacao.usuario_id,
            detalhes: {
              origem: 'redefinicao_senha',
              senha_alterada: true
            }
          });
        } finally {
          req.usuario =
            usuarioAnterior;
        }
      }

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
      } catch (_) {}

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
            AND
            (
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

      // ======================================================
      // USUÁRIO NÃO ENCONTRADO
      // ======================================================

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
      // USUÁRIO DESATIVADO
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
      // PERMISSÕES
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

// ============================================================
// EXPORTAR ROUTER
// ============================================================

module.exports = router;
