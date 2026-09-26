const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const autenticar = require('../middleware/auth');

const {
  buscarPermissoesUsuario,
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
  if (
    req.usuario.perfil !== 'administrador'
  ) {
    return res.status(403).json({
      erro:
        'Acesso permitido somente para administradores.'
    });
  }

  next();
}

// ============================================================
// FUNÇÃO AUXILIAR
// Valida permissões recebidas
// ============================================================

async function validarPermissoes(permissoes) {
  if (!Array.isArray(permissoes)) {
    return {
      validas: false,
      invalidas: []
    };
  }

  const permissoesDisponiveis =
    await buscarTodasPermissoes();

  const codigosDisponiveis =
    permissoesDisponiveis.map(
      (permissao) =>
        permissao.codigo
    );

  const permissoesInvalidas =
    permissoes.filter(
      (codigo) =>
        !codigosDisponiveis.includes(
          codigo
        )
    );

  return {
    validas:
      permissoesInvalidas.length === 0,

    invalidas:
      permissoesInvalidas
  };
}

// ============================================================
// GET /api/usuarios
// Lista usuários da empresa
// ============================================================

router.get(
  '/',
  somenteAdministrador,
  async (req, res) => {
    const empresaId =
      req.usuario.empresa_id;

    try {
      const { rows } =
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
           WHERE empresa_id = $1
           ORDER BY nome ASC`,
          [empresaId]
        );

      const usuarios =
        await Promise.all(
          rows.map(
            async (usuario) => {
              const permissoes =
                usuario.perfil ===
                'administrador'
                  ? PERMISSOES_ADMINISTRADOR
                  : await buscarCodigosPermissoesUsuario(
                      usuario.id
                    );

              return {
                ...usuario,
                permissoes
              };
            }
          )
        );

      res.json(usuarios);

    } catch (err) {
      console.error(
        'Erro ao listar usuários:',
        err
      );

      res.status(500).json({
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

      res.json(permissoes);

    } catch (err) {
      console.error(
        'Erro ao listar permissões:',
        err
      );

      res.status(500).json({
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

    const empresaId =
      req.usuario.empresa_id;

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

      if (
        existente.rows.length === 0
      ) {
        return res.status(404).json({
          erro:
            'Usuário não encontrado.'
        });
      }

      const usuario =
        existente.rows[0];

      const permissoes =
        usuario.perfil ===
        'administrador'
          ? PERMISSOES_ADMINISTRADOR
          : await buscarCodigosPermissoesUsuario(
              usuario.id
            );

      res.json({
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

      res.status(500).json({
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

    // ========================================================
    // VALIDAÇÕES
    // ========================================================

    if (
      !nome ||
      !email ||
      !senha
    ) {
      return res.status(400).json({
        erro:
          'Informe nome, e-mail e senha.'
      });
    }

    if (senha.length < 6) {
      return res.status(400).json({
        erro:
          'A senha deve possuir pelo menos 6 caracteres.'
      });
    }

    const perfilFinal =
      perfil === 'administrador'
        ? 'administrador'
        : 'funcionario';

    // ========================================================
    // VALIDAR PERMISSÕES ANTES DE CRIAR
    // ========================================================

    let permissoesFinais = [];

    if (
      perfilFinal === 'funcionario'
    ) {
      permissoesFinais =
        Array.isArray(permissoes)
          ? permissoes
          : [];

      const resultado =
        await validarPermissoes(
          permissoesFinais
        );

      if (!resultado.validas) {
        return res.status(400).json({
          erro:
            'Uma ou mais permissões informadas são inválidas.',

          permissoes_invalidas:
            resultado.invalidas
        });
      }
    }

    try {
      // ======================================================
      // Verifica usuário existente
      // ======================================================

      const usuarioExistente =
        await pool.query(
          `SELECT id
           FROM usuarios
           WHERE LOWER(email) = LOWER($1)`,
          [email]
        );

      if (
        usuarioExistente.rows.length > 0
      ) {
        return res.status(409).json({
          erro:
            'Já existe um usuário cadastrado com esse e-mail.'
        });
      }

      // ======================================================
      // Cria senha
      // ======================================================

      const senhaHash =
        await bcrypt.hash(
          senha,
          12
        );

      // ======================================================
      // Cria usuário
      // ======================================================

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
            nome,
            email,
            senhaHash,
            perfilFinal
          ]
        );

      const usuario =
        rows[0];

      // ======================================================
      // Salva permissões
      // ======================================================

      if (
        perfilFinal ===
        'administrador'
      ) {
        await substituirPermissoesUsuario(
          usuario.id,
          []
        );
      } else {
        await substituirPermissoesUsuario(
          usuario.id,
          permissoesFinais
        );
      }

      // ======================================================
      // Busca permissões salvas
      // ======================================================

      const permissoesSalvas =
        perfilFinal ===
        'administrador'
          ? PERMISSOES_ADMINISTRADOR
          : await buscarCodigosPermissoesUsuario(
              usuario.id
            );

      // ======================================================
      // Resposta
      // ======================================================

      res.status(201).json({
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

      res.status(500).json({
        erro:
          'Não foi possível criar o usuário.'
      });
    }
  }
);

// ============================================================
// PUT /api/usuarios/:id
// Atualiza dados, cargo, permissões e status
// ============================================================

router.put(
  '/:id',
  somenteAdministrador,
  async (req, res) => {
    const { id } = req.params;

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
      // ======================================================
      // Busca usuário
      // ======================================================

      const existente =
        await pool.query(
          `SELECT *
           FROM usuarios
           WHERE id = $1
             AND empresa_id = $2`,
          [
            id,
            empresaId
          ]
        );

      if (
        existente.rows.length === 0
      ) {
        return res.status(404).json({
          erro:
            'Usuário não encontrado.'
        });
      }

      const usuarioAtual =
        existente.rows[0];

      // ======================================================
      // NÃO PERMITIR DESATIVAR A PRÓPRIA CONTA
      // ======================================================

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

      // ======================================================
      // NÃO PERMITIR QUE O ÚLTIMO ADMIN
      // SEJA REBAIXADO
      // ======================================================

      if (
        Number(id) !==
          Number(req.usuario.id) &&
        usuarioAtual.perfil ===
          'administrador' &&
        perfil === 'funcionario'
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
            administradores.rows[0]
              .total
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

      // ======================================================
      // VERIFICAR E-MAIL
      // ======================================================

      if (
        email !== undefined
      ) {
        const emailExistente =
          await pool.query(
            `SELECT id
             FROM usuarios
             WHERE LOWER(email) = LOWER($1)
               AND id <> $2`,
            [
              email,
              id
            ]
          );

        if (
          emailExistente.rows.length >
          0
        ) {
          return res.status(409).json({
            erro:
              'Já existe outro usuário com esse e-mail.'
          });
        }
      }

      // ======================================================
      // NOVOS VALORES
      // ======================================================

      const novoNome =
        nome !== undefined
          ? nome
          : usuarioAtual.nome;

      const novoEmail =
        email !== undefined
          ? email
          : usuarioAtual.email;

      const novoPerfil =
        perfil === 'administrador' ||
        perfil === 'funcionario'
          ? perfil
          : usuarioAtual.perfil;

      const novoAtivo =
        ativo !== undefined
          ? Boolean(ativo)
          : usuarioAtual.ativo;

      // ======================================================
      // VALIDAR PERMISSÕES
      // ======================================================

      let permissoesFinais = [];

      if (
        novoPerfil ===
        'funcionario'
      ) {
        if (
          Array.isArray(permissoes)
        ) {
          permissoesFinais =
            permissoes;
        } else {
          // Se não vier no request,
          // mantém as atuais.
          permissoesFinais =
            await buscarCodigosPermissoesUsuario(
              usuarioAtual.id
            );
        }

        const resultado =
          await validarPermissoes(
            permissoesFinais
          );

        if (!resultado.validas) {
          return res.status(400).json({
            erro:
              'Uma ou mais permissões informadas são inválidas.',

            permissoes_invalidas:
              resultado.invalidas
          });
        }
      }

      // ======================================================
      // ATUALIZA USUÁRIO
      // ======================================================

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

      // ======================================================
      // ADMINISTRADOR
      // Não precisa de permissões individuais
      // ======================================================

      if (
        novoPerfil ===
        'administrador'
      ) {
        await substituirPermissoesUsuario(
          usuario.id,
          []
        );
      }

      // ======================================================
      // FUNCIONÁRIO
      // Salva permissões selecionadas
      // ======================================================

      else {
        await substituirPermissoesUsuario(
          usuario.id,
          permissoesFinais
        );
      }

      // ======================================================
      // BUSCA PERMISSÕES FINAIS
      // ======================================================

      const permissoesSalvas =
        novoPerfil ===
        'administrador'
          ? PERMISSOES_ADMINISTRADOR
          : await buscarCodigosPermissoesUsuario(
              usuario.id
            );

      // ======================================================
      // RESPOSTA
      // ======================================================

      res.json({
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

      res.status(500).json({
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
    const { id } = req.params;

    const empresaId =
      req.usuario.empresa_id;

    const {
      permissoes
    } = req.body;

    // ========================================================
    // VALIDAÇÃO
    // ========================================================

    if (
      !Array.isArray(permissoes)
    ) {
      return res.status(400).json({
        erro:
          'Informe as permissões em formato de lista.'
      });
    }

    try {
      // ======================================================
      // Busca usuário
      // ======================================================

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

      if (
        existente.rows.length === 0
      ) {
        return res.status(404).json({
          erro:
            'Usuário não encontrado.'
        });
      }

      const usuario =
        existente.rows[0];

      // ======================================================
      // ADMINISTRADOR TEM ACESSO TOTAL
      // ======================================================

      if (
        usuario.perfil ===
        'administrador'
      ) {
        return res.status(400).json({
          erro:
            'Administradores possuem acesso total. As permissões individuais não precisam ser configuradas.'
        });
      }

      // ======================================================
      // VALIDAR PERMISSÕES
      // ======================================================

      const resultado =
        await validarPermissoes(
          permissoes
        );

      if (!resultado.validas) {
        return res.status(400).json({
          erro:
            'Uma ou mais permissões informadas são inválidas.',

          permissoes_invalidas:
            resultado.invalidas
        });
      }

      // ======================================================
      // SALVA PERMISSÕES
      // ======================================================

      await substituirPermissoesUsuario(
        usuario.id,
        permissoes
      );

      // ======================================================
      // BUSCA PERMISSÕES SALVAS
      // ======================================================

      const novasPermissoes =
        await buscarCodigosPermissoesUsuario(
          usuario.id
        );

      // ======================================================
      // RESPOSTA
      // ======================================================

      res.json({
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

      res.status(500).json({
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
    const { id } = req.params;

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

    if (senha.length < 6) {
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

      if (
        existente.rows.length === 0
      ) {
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

      res.json({
        mensagem:
          'Senha alterada com sucesso.'
      });

    } catch (err) {
      console.error(
        'Erro ao alterar senha:',
        err
      );

      res.status(500).json({
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
    const { id } = req.params;

    const empresaId =
      req.usuario.empresa_id;

    const { ativo } =
      req.body;

    if (
      typeof ativo !== 'boolean'
    ) {
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

      if (
        existente.rows.length === 0
      ) {
        return res.status(404).json({
          erro:
            'Usuário não encontrado.'
        });
      }

      const usuario =
        existente.rows[0];

      // ======================================================
      // NÃO PODE DESATIVAR A PRÓPRIA CONTA
      // ======================================================

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

      // ======================================================
      // NÃO DEIXAR EMPRESA SEM ADMINISTRADOR
      // ======================================================

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
            administradores.rows[0]
              .total
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

      // ======================================================
      // ATUALIZA STATUS
      // ======================================================

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

      res.json({
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

      res.status(500).json({
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
    const { id } = req.params;

    const empresaId =
      req.usuario.empresa_id;

    // ========================================================
    // NÃO PODE EXCLUIR A PRÓPRIA CONTA
    // ========================================================

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

      if (
        existente.rows.length === 0
      ) {
        return res.status(404).json({
          erro:
            'Usuário não encontrado.'
        });
      }

      const usuario =
        existente.rows[0];

      // ======================================================
      // NÃO DEIXAR EMPRESA SEM ADMINISTRADOR
      // ======================================================

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
            administradores.rows[0]
              .total
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

      // ======================================================
      // EXCLUI USUÁRIO
      // ======================================================

      await pool.query(
        `DELETE FROM usuarios
         WHERE id = $1
           AND empresa_id = $2`,
        [
          id,
          empresaId
        ]
      );

      res.status(204).end();

    } catch (err) {
      console.error(
        'Erro ao remover usuário:',
        err
      );

      res.status(500).json({
        erro:
          'Não foi possível remover o usuário.'
      });
    }
  }
);

module.exports = router;