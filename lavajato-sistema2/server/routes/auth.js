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


// ============================================================
// PERMISSÕES DO ADMINISTRADOR
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
// FUNÇÃO - OBTER PERMISSÕES DO USUÁRIO
// ============================================================

async function obterPermissoesUsuario(usuario) {

  /*
   * DEV
   *
   * O DEV não utiliza as permissões da empresa.
   * O acesso às rotas DEV é controlado pelo middleware
   * somenteDev.
   */

  if (usuario.perfil === 'dev') {
    return [];
  }


  /*
   * ADMINISTRADOR
   *
   * Administrador possui todas as permissões
   * disponíveis para a própria empresa.
   */

  if (usuario.perfil === 'administrador') {
    return PERMISSOES_ADMINISTRADOR;
  }


  /*
   * FUNCIONÁRIO
   *
   * Funcionário possui somente as permissões
   * cadastradas em usuario_permissoes.
   */

  const {
    rows
  } = await pool.query(
    `
    SELECT
      p.codigo

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

  if (!JWT_SECRET) {
    throw new Error(
      'JWT_SECRET não configurado.'
    );
  }


  return jwt.sign(
    {
      id: usuario.id,

      empresa_id:
        usuario.empresa_id ??
        null,

      nome:
        usuario.nome,

      email:
        usuario.email,

      perfil:
        usuario.perfil
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

router.post(
  '/cadastro',
  async (req, res) => {

    const client =
      await pool.connect();


    try {

      /*
       * Aceita os dois formatos:
       *
       * {
       *   empresa: {
       *     nome: "Minha Empresa"
       *   }
       * }
       *
       * ou:
       *
       * {
       *   empresa_nome: "Minha Empresa"
       * }
       *
       * Isso evita problemas caso o frontend utilize
       * uma estrutura diferente.
       */

      const empresaRecebida =
        req.body?.empresa;

      const empresaNomeRecebido =
        typeof empresaRecebida === 'object'
          ? empresaRecebida?.nome
          : (
              typeof empresaRecebida === 'string'
                ? empresaRecebida
                : req.body?.empresa_nome
            );


      const nomeRecebido =
        req.body?.nome;

      const emailRecebido =
        req.body?.email;

      const senhaRecebida =
        req.body?.senha;


      // ======================================================
      // VALIDAÇÃO INICIAL
      // ======================================================

      if (
        !empresaNomeRecebido ||
        !nomeRecebido ||
        !emailRecebido ||
        !senhaRecebida
      ) {

        return res.status(400).json({
          erro:
            'Preencha todos os campos obrigatórios.'
        });

      }


      // ======================================================
      // NORMALIZAÇÃO
      // ======================================================

      const nomeEmpresa =
        String(
          empresaNomeRecebido
        ).trim();

      const nomeUsuario =
        String(
          nomeRecebido
        ).trim();

      const emailNormalizado =
        String(
          emailRecebido
        )
        .trim()
        .toLowerCase();

      const senha =
        String(
          senhaRecebida
        );


      // ======================================================
      // VALIDAÇÃO DOS CAMPOS
      // ======================================================

      if (!nomeEmpresa) {

        return res.status(400).json({
          erro:
            'Informe o nome da empresa.'
        });

      }


      if (!nomeUsuario) {

        return res.status(400).json({
          erro:
            'Informe seu nome.'
        });

      }


      if (!emailNormalizado) {

        return res.status(400).json({
          erro:
            'Informe um e-mail válido.'
        });

      }


      /*
       * Validação simples de e-mail.
       */

      const emailValido =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          .test(
            emailNormalizado
          );


      if (!emailValido) {

        return res.status(400).json({
          erro:
            'Informe um e-mail válido.'
        });

      }


      if (senha.length < 6) {

        return res.status(400).json({
          erro:
            'A senha deve possuir pelo menos 6 caracteres.'
        });

      }


      // ======================================================
      // INICIA TRANSAÇÃO
      // ======================================================

      await client.query(
        'BEGIN'
      );


      // ======================================================
      // VERIFICA E-MAIL EXISTENTE
      // ======================================================

      const usuarioExistente =
        await client.query(
          `
          SELECT
            id

          FROM usuarios

          WHERE LOWER(email) =
                LOWER($1)

          LIMIT 1
          `,
          [
            emailNormalizado
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
            'Este e-mail já está cadastrado.'
        });

      }


      // ======================================================
      // CRIA EMPRESA
      // ======================================================

      const empresaResult =
        await client.query(
          `
          INSERT INTO empresas (
            nome,
            email
          )

          VALUES (
            $1,
            $2
          )

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


      const novaEmpresa =
        empresaResult.rows[0];


      // ======================================================
      // CRIPTOGRAFA SENHA
      // ======================================================

      const senhaHash =
        await bcrypt.hash(
          senha,
          10
        );


      // ======================================================
      // CRIA USUÁRIO ADMINISTRADOR
      // ======================================================

      const usuarioResult =
        await client.query(
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


      const novoUsuario =
        usuarioResult.rows[0];


      // ======================================================
      // FINALIZA TRANSAÇÃO
      // ======================================================

      await client.query(
        'COMMIT'
      );


      // ======================================================
      // PERMISSÕES
      // ======================================================

      const permissoes =
        await obterPermissoesUsuario(
          novoUsuario
        );


      // ======================================================
      // TOKEN
      // ======================================================

      const token =
        gerarToken(
          novoUsuario
        );


      // ======================================================
      // RESPOSTA
      // ======================================================

      return res.status(201).json({

        mensagem:
          'Cadastro realizado com sucesso.',

        token,

        usuario: {

          id:
            novoUsuario.id,

          nome:
            novoUsuario.nome,

          email:
            novoUsuario.email,

          perfil:
            novoUsuario.perfil,

          empresa_id:
            novoUsuario.empresa_id,

          permissoes

        },

        empresa: {

          id:
            novaEmpresa.id,

          nome:
            novaEmpresa.nome,

          email:
            novaEmpresa.email

        }

      });


    } catch (err) {

      /*
       * Caso qualquer operação da transação falhe,
       * tenta desfazer tudo.
       */

      try {

        await client.query(
          'ROLLBACK'
        );

      } catch (_) {
        // Ignora erro do rollback.
      }


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
// LOGIN
// ============================================================

router.post(
  '/login',
  async (req, res) => {

    try {

      const emailRecebido =
        req.body?.email;

      const senhaRecebida =
        req.body?.senha;


      // ======================================================
      // VALIDAÇÃO
      // ======================================================

      if (
        !emailRecebido ||
        !senhaRecebida
      ) {

        return res.status(400).json({
          erro:
            'Informe e-mail e senha.'
        });

      }


      const emailNormalizado =
        String(
          emailRecebido
        )
        .trim()
        .toLowerCase();

      const senha =
        String(
          senhaRecebida
        );


      // ======================================================
      // BUSCA USUÁRIO
      // ======================================================

      const {
        rows
      } = await pool.query(
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

        WHERE LOWER(u.email) =
              LOWER($1)

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

        return res.status(401).json({
          erro:
            'E-mail ou senha inválidos.'
        });

      }


      const usuario =
        rows[0];


      // ======================================================
      // USUÁRIO ATIVO
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
      // EMPRESA OBRIGATÓRIA
      // ======================================================

      if (
        usuario.perfil !== 'dev' &&
        !usuario.empresa_id
      ) {

        return res.status(403).json({
          erro:
            'Usuário não está vinculado a uma empresa.'
        });

      }


      // ======================================================
      // EMPRESA ATIVA
      // ======================================================

      if (
        usuario.perfil !== 'dev' &&
        usuario.empresa_ativo === false
      ) {

        return res.status(403).json({
          erro:
            'A empresa deste usuário está desativada.'
        });

      }


      // ======================================================
      // COMPARA SENHA
      // ======================================================

      const senhaValida =
        await bcrypt.compare(
          senha,
          usuario.senha
        );


      if (!senhaValida) {

        return res.status(401).json({
          erro:
            'E-mail ou senha inválidos.'
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
      // TOKEN
      // ======================================================

      const token =
        gerarToken(
          usuario
        );


      // ======================================================
      // EMPRESA
      // ======================================================

      let empresa =
        null;


      if (
        usuario.empresa_id
      ) {

        empresa = {

          id:
            usuario.empresa_id,

          nome:
            usuario.empresa_nome,

          email:
            usuario.empresa_email,

          telefone:
            usuario.empresa_telefone,

          ativo:
            usuario.empresa_ativo

        };

      }


      // ======================================================
      // RESPOSTA
      // ======================================================

      return res.status(200).json({

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

          empresa_id:
            usuario.empresa_id ??
            null,

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
        erro:
          'Não foi possível realizar o login.'
      });

    }

  }
);


// ============================================================
// ME
// ============================================================

router.get(
  '/me',
  autenticar,
  async (req, res) => {

    try {

      // ======================================================
      // BUSCA USUÁRIO
      // ======================================================

      const {
        rows
      } = await pool.query(
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


      // ======================================================
      // USUÁRIO NÃO ENCONTRADO
      // ======================================================

      if (
        rows.length === 0
      ) {

        return res.status(401).json({
          erro:
            'Usuário não encontrado.'
        });

      }


      const usuario =
        rows[0];


      // ======================================================
      // USUÁRIO ATIVO
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
      // EMPRESA OBRIGATÓRIA
      // ======================================================

      if (
        usuario.perfil !== 'dev' &&
        !usuario.empresa_id
      ) {

        return res.status(403).json({
          erro:
            'Usuário não está vinculado a uma empresa.'
        });

      }


      // ======================================================
      // EMPRESA ATIVA
      // ======================================================

      if (
        usuario.perfil !== 'dev' &&
        usuario.empresa_ativo === false
      ) {

        return res.status(403).json({
          erro:
            'A empresa deste usuário está desativada.'
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
      // EMPRESA
      // ======================================================

      let empresa =
        null;


      if (
        usuario.empresa_id
      ) {

        empresa = {

          id:
            usuario.empresa_id,

          nome:
            usuario.empresa_nome,

          email:
            usuario.empresa_email,

          telefone:
            usuario.empresa_telefone,

          ativo:
            usuario.empresa_ativo

        };

      }


      // ======================================================
      // RESPOSTA
      // ======================================================

      return res.status(200).json({

        usuario: {

          id:
            usuario.id,

          nome:
            usuario.nome,

          email:
            usuario.email,

          perfil:
            usuario.perfil,

          empresa_id:
            usuario.empresa_id ??
            null,

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
        erro:
          'Não foi possível obter os dados do usuário.'
      });

    }

  }
);


// ============================================================
// EXPORT
// ============================================================

module.exports = router;
