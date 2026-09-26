const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const autenticar = require('../middleware/auth');

const {
  buscarCodigosPermissoesUsuario,
  substituirPermissoesUsuario,
  buscarTodasPermissoes
} = require('../services/permissoes');

const router = express.Router();

router.use(autenticar);

// ============================================================
// CONSTANTES
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
// MIDDLEWARE
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
// FUNÇÕES AUXILIARES
// ============================================================

function normalizarPermissoes(permissoes) {
  if (!Array.isArray(permissoes)) {
    return [];
  }

  return [
    ...new Set(
      permissoes
        .map((codigo) => String(codigo).trim())
        .filter(Boolean)
    )
  ];
}

async function validarListaPermissoes(permissoes) {
  const permissoesNormalizadas =
    normalizarPermissoes(permissoes);

  const permissoesDisponiveis =
    await buscarTodasPermissoes();

  const codigosDisponiveis =
    permissoesDisponiveis.map(
      (permissao) => permissao.codigo
    );

  const permissoesInvalidas =
    permissoesNormalizadas.filter(
      (codigo) =>
        !codigosDisponiveis.includes(codigo)
    );

  return {
    permissoes: permissoesNormalizadas,
    permissoesInvalidas
  };
}

function converterBoolean(valor, valorPadrao) {
  if (valor === undefined || valor === null) {
    return valorPadrao;
  }

  if (typeof valor === 'boolean') {
    return valor;
  }

  if (typeof valor === 'string') {
    return valor.toLowerCase() === 'true';
  }

  return Boolean(valor);
}

// ============================================================
// GET /api/usuarios
// Lista usuários da empresa
// ============================================================

router.get(
  '/',
  somenteAdministrador,
  async (req, res) => {
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
            criado_em,
            atualizado_em
         FROM usuarios
         WHERE empresa_id = $1
         ORDER BY nome ASC`,
        [empresaId]
      );

      const usuarios = await Promise.all(
        rows.map(async (usuario) => {
          let permissoes = [];

          if (usuario.perfil === 'administrador') {
            permissoes = [
              ...PERMISSOES_ADMINISTRADOR
            ];
          } else {
            permissoes =
              await buscarCodigosPermissoesUsuario(
                usuario.id
              );
          }

          return {
            ...usuario,
            permissoes
          };
        })
      );

      return res.json(usuarios);

    } catch (err) {
      console.error(
        'Erro ao listar usuários:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível carregar os usuários.'
      });
    }
  }
);

// ============================================================
// GET /api/usuarios/permissoes
// Lista todas as permissões disponíveis
// ============================================================

router.get(
  '/permissoes',
  somenteAdministrador,
  async (req, res) => {
    try {
      const permissoes =
        await buscarTodasPermissoes();

      return res.json(permissoes);

    } catch (err) {
      console.error(
        'Erro ao listar permissões:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível carregar as permissões.'
      });
    }
  }
);

// ============================================================
// GET /api/usuarios/:id/permissoes
// Consulta permissões de um usuário
// ============================================================

router.get(
  '/:id/permissoes',
  somenteAdministrador,
  async (req, res) => {
    const { id } = req.params;
    const empresaId = req.usuario.empresa_id;

    try {
      const existente = await pool.query(
        `SELECT
            id,
            nome,
            email,
            perfil,
            ativo
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
          erro:
            'Usuário não encontrado.'
        });
      }

      const usuario =
        existente.rows[0];

      let permissoes = [];

      if (usuario.perfil === 'administrador') {
        permissoes = [
          ...PERMISSOES_ADMINISTRADOR
        ];
      } else {
        permissoes =
          await buscarCodigosPermissoesUsuario(
            usuario.id
          );
      }

      return res.json({
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          perfil: usuario.perfil,
          ativo: usuario.ativo
        },
        permissoes
      });

    } catch (err) {
      console.error(
        'Erro ao consultar permissões:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível carregar as permissões.'
      });
    }
  }
);

// ============================================================
// POST /api/usuarios
// Cria usuário
// ============================================================

router.post(
  '/',
  somenteAdministrador,
  async (req, res) => {
    const empresaId =
      req.usuario.empresa_id;

    const {
      nome,
      email,
      senha,
      perfil,
      permissoes
    } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({
        erro:
          'Informe nome, e-mail e senha.'
      });
    }

    if (String(senha).length < 6) {
      return res.status(400).json({
        erro:
          'A senha deve possuir pelo menos 6 caracteres.'
      });
    }

    const perfilFinal =
      perfil === 'administrador'
        ? 'administrador'
        : 'funcionario';

    try {
      // ========================================================
      // VERIFICA E-MAIL
      // ========================================================

      const usuarioExistente =
        await pool.query(
          `SELECT id
           FROM usuarios
           WHERE LOWER(email) = LOWER($1)`,
          [String(email).trim()]
        );

      if (usuarioExistente.rows.length > 0) {
        return res.status(409).json({
          erro:
            'Já existe um usuário cadastrado com esse e-mail.'
        });
      }

      // ========================================================
      // PERMISSÕES
      // ========================================================

      let permissoesFinais = [];

      if (perfilFinal === 'funcionario') {
        const validacao =
          await validarListaPermissoes(
            permissoes
          );

        if (
          validacao.permissoesInvalidas.length > 0
        ) {
          return res.status(400).json({
            erro:
              'Uma ou mais permissões informadas são inválidas.',
            permissoes_invalidas:
              validacao.permissoesInvalidas
          });
        }

        permissoesFinais =
          validacao.permissoes;
      }

      // ========================================================
      // SENHA
      // ========================================================

      const senhaHash =
        await bcrypt.hash(
          senha,
          12
        );

      // ========================================================
      // CRIA USUÁRIO
      // ========================================================

      const { rows } =
        await pool.query(
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
              criado_em,
              atualizado_em`,
          [
            empresaId,
            String(nome).trim(),
            String(email).trim().toLowerCase(),
            senhaHash,
            perfilFinal
          ]
        );

      const usuario =
        rows[0];

      // ========================================================
      // SALVA PERMISSÕES
      // ========================================================

      /*
       * Funcionário:
       * salva exatamente as permissões selecionadas.
       *
       * Administrador:
       * também gravamos todas no banco. Assim o banco fica
       * consistente e a resposta do sistema bate com o que
       * aparece na tela.
       */

      const permissoesParaSalvar =
        perfilFinal === 'administrador'
          ? PERMISSOES_ADMINISTRADOR
          : permissoesFinais;

      await substituirPermissoesUsuario(
        usuario.id,
        permissoesParaSalvar
      );

      // ========================================================
      // CONFIRMA O QUE REALMENTE FOI SALVO
      // ========================================================

      const permissoesSalvas =
        usuario.perfil === 'administrador'
          ? [
              ...PERMISSOES_ADMINISTRADOR
            ]
          : await buscarCodigosPermissoesUsuario(
              usuario.id
            );

      return res.status(201).json({
        mensagem:
          'Usuário criado com sucesso.',

        usuario: {
          ...usuario,
          permissoes:
            permissoesSalvas
        }
      });

    } catch (err) {
      console.error(
        'Erro ao criar usuário:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível criar o usuário.'
      });
    }
  }
);

// ============================================================
// PUT /api/usuarios/:id
// Atualiza dados, cargo, status e permissões
// ============================================================

router.put(
  '/:id',
  somenteAdministrador,
  async (req, res) => {
    const { id } =
      req.params;

    const empresaId =
      req.usuario.empresa_id;

    const {
      nome,
      email,
      perfil,
      ativo,
      permissoes
    } = req.body;

    try {
      // ========================================================
      // BUSCAR USUÁRIO
      // ========================================================

      const existente =
        await pool.query(
          `SELECT
              id,
              empresa_id,
              nome,
              email,
              perfil,
              ativo,
              criado_em,
              atualizado_em
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
          erro:
            'Usuário não encontrado.'
        });
      }

      const usuarioAtual =
        existente.rows[0];

      // ========================================================
      // NÃO PERMITIR DESATIVAR A PRÓPRIA CONTA
      // ========================================================

      const novoAtivo =
        converterBoolean(
          ativo,
          usuarioAtual.ativo
        );

      if (
        Number(id) ===
          Number(req.usuario.id) &&
        novoAtivo === false
      ) {
        return res.status(400).json({
          erro:
            'Você não pode desativar o próprio usuário.'
        });
      }

      // ========================================================
      // NOVO PERFIL
      // ========================================================

      const novoPerfil =
        perfil === 'administrador' ||
        perfil === 'funcionario'
          ? perfil
          : usuarioAtual.perfil;

      // ========================================================
      // NÃO PERMITIR REBAIXAR O ÚLTIMO ADMINISTRADOR
      // ========================================================

      if (
        Number(id) !==
          Number(req.usuario.id) &&
        usuarioAtual.perfil ===
          'administrador' &&
        novoPerfil ===
          'funcionario'
      ) {
        const administradores =
          await pool.query(
            `SELECT COUNT(*) AS total
             FROM usuarios
             WHERE empresa_id = $1
               AND perfil = 'administrador'
               AND ativo = TRUE`,
            [empresaId]
          );

        const totalAdministradores =
          Number(
            administradores.rows[0].total
          );

        if (
          totalAdministradores <= 1
        ) {
          return res.status(400).json({
            erro:
              'A empresa precisa possuir pelo menos um administrador ativo.'
          });
        }
      }

      // ========================================================
      // VERIFICAR E-MAIL
      // ========================================================

      const novoEmail =
        email !== undefined
          ? String(email)
              .trim()
              .toLowerCase()
          : usuarioAtual.email;

      if (
        novoEmail !==
        String(usuarioAtual.email)
          .trim()
          .toLowerCase()
      ) {
        const emailExistente =
          await pool.query(
            `SELECT id
             FROM usuarios
             WHERE LOWER(email) = LOWER($1)
               AND id <> $2`,
            [
              novoEmail,
              id
            ]
          );

        if (
          emailExistente.rows.length > 0
        ) {
          return res.status(409).json({
            erro:
              'Já existe outro usuário com esse e-mail.'
          });
        }
      }

      const novoNome =
        nome !== undefined
          ? String(nome).trim()
          : usuarioAtual.nome;

      // ========================================================
      // VALIDAR PERMISSÕES ANTES DE ALTERAR O USUÁRIO
      // ========================================================

      let permissoesFinais = [];

      /*
       * IMPORTANTE:
       *
       * Array.isArray(permissoes) precisa ser usado aqui.
       *
       * Se o frontend mandar:
       *
       *   permissoes: []
       *
       * isso significa que o usuário NÃO possui nenhuma
       * permissão e precisamos apagar as antigas.
       *
       * Não podemos tratar [] como "não veio".
       */

      if (
        novoPerfil ===
        'administrador'
      ) {
        permissoesFinais = [
          ...PERMISSOES_ADMINISTRADOR
        ];

      } else if (
        Array.isArray(permissoes)
      ) {
        const validacao =
          await validarListaPermissoes(
            permissoes
          );

        if (
          validacao.permissoesInvalidas.length > 0
        ) {
          return res.status(400).json({
            erro:
              'Uma ou mais permissões informadas são inválidas.',
            permissoes_invalidas:
              validacao.permissoesInvalidas
          });
        }

        permissoesFinais =
          validacao.permissoes;

      } else {
        /*
         * Se o frontend não mandou o campo permissões,
         * mantemos as permissões atuais.
         *
         * Isso evita apagar permissões em uma atualização
         * que não tenha relação com elas.
         */

        permissoesFinais =
          await buscarCodigosPermissoesUsuario(
            usuarioAtual.id
          );
      }

      // ========================================================
      // ATUALIZAR USUÁRIO
      // ========================================================

      const { rows } =
        await pool.query(
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

      const usuario =
        rows[0];

      // ========================================================
      // SALVAR PERMISSÕES
      // ========================================================

      /*
       * AGORA SEMPRE substituímos as permissões.
       *
       * Funcionário com 3 permissões:
       *     -> salva as 3.
       *
       * Funcionário com []:
       *     -> apaga todas.
       *
       * Administrador:
       *     -> salva todas.
       */

      await substituirPermissoesUsuario(
        usuario.id,
        permissoesFinais
      );

      // ========================================================
      // BUSCAR NOVAMENTE DO BANCO
      // ========================================================

      const permissoesSalvas =
        usuario.perfil ===
          'administrador'
          ? [
              ...PERMISSOES_ADMINISTRADOR
            ]
          : await buscarCodigosPermissoesUsuario(
              usuario.id
            );

      // ========================================================
      // RESPOSTA
      // ========================================================

      return res.json({
        mensagem:
          'Usuário atualizado com sucesso.',

        usuario: {
          ...usuario,
          permissoes:
            permissoesSalvas
        }
      });

    } catch (err) {
      console.error(
        'Erro ao atualizar usuário:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível atualizar o usuário.'
      });
    }
  }
);

// ============================================================
// PATCH /api/usuarios/:id/permissoes
// Substitui as permissões de um funcionário
// ============================================================

router.patch(
  '/:id/permissoes',
  somenteAdministrador,
  async (req, res) => {
    const { id } =
      req.params;

    const empresaId =
      req.usuario.empresa_id;

    const {
      permissoes
    } = req.body;

    if (!Array.isArray(permissoes)) {
      return res.status(400).json({
        erro:
          'Informe as permissões em formato de lista.'
      });
    }

    try {
      const existente =
        await pool.query(
          `SELECT
              id,
              nome,
              email,
              perfil,
              ativo
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
          erro:
            'Usuário não encontrado.'
        });
      }

      const usuario =
        existente.rows[0];

      // ========================================================
      // ADMINISTRADOR
      // ========================================================

      if (
        usuario.perfil ===
        'administrador'
      ) {
        await substituirPermissoesUsuario(
          usuario.id,
          PERMISSOES_ADMINISTRADOR
        );

        return res.json({
          mensagem:
            'Administrador possui acesso total.',

          usuario: {
            ...usuario,
            permissoes:
              PERMISSOES_ADMINISTRADOR
          }
        });
      }

      // ========================================================
      // VALIDAR PERMISSÕES
      // ========================================================

      const validacao =
        await validarListaPermissoes(
          permissoes
        );

      if (
        validacao.permissoesInvalidas.length > 0
      ) {
        return res.status(400).json({
          erro:
            'Uma ou mais permissões informadas são inválidas.',
          permissoes_invalidas:
            validacao.permissoesInvalidas
        });
      }

      // ========================================================
      // SALVAR
      // ========================================================

      await substituirPermissoesUsuario(
        usuario.id,
        validacao.permissoes
      );

      // ========================================================
      // CONFIRMAR NO BANCO
      // ========================================================

      const novasPermissoes =
        await buscarCodigosPermissoesUsuario(
          usuario.id
        );

      return res.json({
        mensagem:
          'Permissões atualizadas com sucesso.',

        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          perfil: usuario.perfil,
          ativo: usuario.ativo,
          permissoes:
            novasPermissoes
        }
      });

    } catch (err) {
      console.error(
        'Erro ao atualizar permissões:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível atualizar as permissões.'
      });
    }
  }
);

// ============================================================
// PATCH /api/usuarios/:id/senha
// Altera senha
// ============================================================

router.patch(
  '/:id/senha',
  somenteAdministrador,
  async (req, res) => {
    const { id } =
      req.params;

    const empresaId =
      req.usuario.empresa_id;

    const { senha } =
      req.body;

    if (!senha) {
      return res.status(400).json({
        erro:
          'Informe a nova senha.'
      });
    }

    if (String(senha).length < 6) {
      return res.status(400).json({
        erro:
          'A senha deve possuir pelo menos 6 caracteres.'
      });
    }

    try {
      const existente =
        await pool.query(
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
          erro:
            'Usuário não encontrado.'
        });
      }

      const senhaHash =
        await bcrypt.hash(
          senha,
          12
        );

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

      return res.json({
        mensagem:
          'Senha alterada com sucesso.'
      });

    } catch (err) {
      console.error(
        'Erro ao alterar senha:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível alterar a senha.'
      });
    }
  }
);

// ============================================================
// PATCH /api/usuarios/:id/status
// Ativa ou desativa usuário
// ============================================================

router.patch(
  '/:id/status',
  somenteAdministrador,
  async (req, res) => {
    const { id } =
      req.params;

    const empresaId =
      req.usuario.empresa_id;

    const { ativo } =
      req.body;

    if (typeof ativo !== 'boolean') {
      return res.status(400).json({
        erro:
          'Informe o status do usuário.'
      });
    }

    try {
      const existente =
        await pool.query(
          `SELECT
              id,
              perfil,
              ativo
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
          erro:
            'Usuário não encontrado.'
        });
      }

      const usuario =
        existente.rows[0];

      // ========================================================
      // NÃO PODE DESATIVAR A PRÓPRIA CONTA
      // ========================================================

      if (
        Number(id) ===
          Number(req.usuario.id) &&
        ativo === false
      ) {
        return res.status(400).json({
          erro:
            'Você não pode desativar o próprio usuário.'
        });
      }

      // ========================================================
      // NÃO DEIXAR EMPRESA SEM ADMINISTRADOR
      // ========================================================

      if (
        usuario.perfil ===
          'administrador' &&
        usuario.ativo === true &&
        ativo === false
      ) {
        const administradores =
          await pool.query(
            `SELECT COUNT(*) AS total
             FROM usuarios
             WHERE empresa_id = $1
               AND perfil = 'administrador'
               AND ativo = TRUE`,
            [empresaId]
          );

        const totalAdministradores =
          Number(
            administradores.rows[0].total
          );

        if (
          totalAdministradores <= 1
        ) {
          return res.status(400).json({
            erro:
              'A empresa precisa possuir pelo menos um administrador ativo.'
          });
        }
      }

      const { rows } =
        await pool.query(
          `UPDATE usuarios
           SET
              ativo = $1,
              atualizado_em = NOW()
           WHERE id = $2
             AND empresa_id = $3
           RETURNING
              id,
              nome,
              email,
              perfil,
              ativo,
              atualizado_em`,
          [
            ativo,
            id,
            empresaId
          ]
        );

      return res.json({
        mensagem:
          ativo
            ? 'Usuário ativado com sucesso.'
            : 'Usuário desativado com sucesso.',

        usuario:
          rows[0]
      });

    } catch (err) {
      console.error(
        'Erro ao alterar status:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível alterar o status do usuário.'
      });
    }
  }
);

// ============================================================
// DELETE /api/usuarios/:id
// Exclui usuário
// ============================================================

router.delete(
  '/:id',
  somenteAdministrador,
  async (req, res) => {
    const { id } =
      req.params;

    const empresaId =
      req.usuario.empresa_id;

    if (
      Number(id) ===
      Number(req.usuario.id)
    ) {
      return res.status(400).json({
        erro:
          'Você não pode excluir o próprio usuário.'
      });
    }

    try {
      const existente =
        await pool.query(
          `SELECT
              id,
              perfil,
              ativo
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
          erro:
            'Usuário não encontrado.'
        });
      }

      const usuario =
        existente.rows[0];

      // ========================================================
      // NÃO DEIXAR EMPRESA SEM ADMINISTRADOR
      // ========================================================

      if (
        usuario.perfil ===
          'administrador' &&
        usuario.ativo === true
      ) {
        const administradores =
          await pool.query(
            `SELECT COUNT(*) AS total
             FROM usuarios
             WHERE empresa_id = $1
               AND perfil = 'administrador'
               AND ativo = TRUE`,
            [empresaId]
          );

        const totalAdministradores =
          Number(
            administradores.rows[0].total
          );

        if (
          totalAdministradores <= 1
        ) {
          return res.status(400).json({
            erro:
              'A empresa precisa possuir pelo menos um administrador ativo.'
          });
        }
      }

      // ========================================================
      // EXCLUIR PERMISSÕES PRIMEIRO
      // ========================================================

      await pool.query(
        `DELETE FROM usuario_permissoes
         WHERE usuario_id = $1`,
        [id]
      );

      // ========================================================
      // EXCLUIR USUÁRIO
      // ========================================================

      await pool.query(
        `DELETE FROM usuarios
         WHERE id = $1
           AND empresa_id = $2`,
        [
          id,
          empresaId
        ]
      );

      return res.status(204).end();

    } catch (err) {
      console.error(
        'Erro ao remover usuário:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível remover o usuário.'
      });
    }
  }
);

module.exports = router;
