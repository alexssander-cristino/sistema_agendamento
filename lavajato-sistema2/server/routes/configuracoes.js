const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');

const router = express.Router();

// ============================================================
// PERMISSÃO NECESSÁRIA
// ============================================================

const PERMISSAO_CONFIGURACOES = 'configuracoes';

// ============================================================
// VERIFICA PERMISSÃO
// ============================================================

async function verificarPermissaoConfiguracoes(req, res, next) {
  try {
    // Administrador possui acesso completo
    if (req.usuario.perfil === 'administrador') {
      return next();
    }

    const { rows } = await pool.query(
      `SELECT 1
       FROM usuario_permissoes up
       INNER JOIN permissoes p
         ON p.id = up.permissao_id
       WHERE up.usuario_id = $1
         AND p.codigo = $2
       LIMIT 1`,
      [
        req.usuario.id,
        PERMISSAO_CONFIGURACOES
      ]
    );

    if (rows.length === 0) {
      return res.status(403).json({
        erro: 'Você não possui permissão para acessar as configurações.'
      });
    }

    next();

  } catch (err) {
    console.error(
      'Erro ao verificar permissão de configurações:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível verificar a permissão.'
    });
  }
}

// ============================================================
// VALIDA COR HEXADECIMAL
// ============================================================

function validarCor(cor) {
  return (
    typeof cor === 'string' &&
    /^#[0-9A-Fa-f]{6}$/.test(cor)
  );
}

// ============================================================
// GET /api/configuracoes
// Busca dados da empresa
// ============================================================

router.get(
  '/',
  autenticar,
  verificarPermissaoConfiguracoes,
  async (req, res) => {
    try {

      const { rows } = await pool.query(
        `SELECT
            id,
            nome,
            email,
            telefone,
            cor_primaria,
            cor_destaque,
            cor_fundo,
            criado_em,
            atualizado_em
         FROM empresas
         WHERE id = $1
         LIMIT 1`,
        [
          req.usuario.empresa_id
        ]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          erro: 'Empresa não encontrada.'
        });
      }

      return res.json({
        empresa: rows[0]
      });

    } catch (err) {

      console.error(
        'Erro ao buscar configurações:',
        err
      );

      return res.status(500).json({
        erro: 'Não foi possível carregar as configurações.'
      });
    }
  }
);

// ============================================================
// PUT /api/configuracoes
// Atualiza dados da empresa
// ============================================================

router.put(
  '/',
  autenticar,
  verificarPermissaoConfiguracoes,
  async (req, res) => {

    const {
      nome,
      email,
      telefone,
      cor_primaria,
      cor_destaque,
      cor_fundo
    } = req.body;

    // ==========================================================
    // VALIDAÇÕES
    // ==========================================================

    if (!nome || !nome.trim()) {
      return res.status(400).json({
        erro: 'Informe o nome da lavação.'
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        erro: 'Informe o e-mail da empresa.'
      });
    }

    // ==========================================================
    // VALIDAÇÃO DAS CORES
    // ==========================================================

    if (
      !validarCor(cor_primaria) ||
      !validarCor(cor_destaque) ||
      !validarCor(cor_fundo)
    ) {
      return res.status(400).json({
        erro: 'Uma ou mais cores informadas são inválidas.'
      });
    }

    const nomeLimpo =
      nome.trim();

    const emailLimpo =
      email.trim().toLowerCase();

    const telefoneLimpo =
      telefone && telefone.trim()
        ? telefone.trim()
        : null;

    // Normaliza as cores
    const corPrimariaLimpa =
      cor_primaria.toLowerCase();

    const corDestaqueLimpa =
      cor_destaque.toLowerCase();

    const corFundoLimpa =
      cor_fundo.toLowerCase();

    try {

      // ========================================================
      // VERIFICA E-MAIL
      // ========================================================

      const empresaExistente =
        await pool.query(
          `SELECT id
           FROM empresas
           WHERE LOWER(email) = LOWER($1)
             AND id <> $2
           LIMIT 1`,
          [
            emailLimpo,
            req.usuario.empresa_id
          ]
        );

      if (
        empresaExistente.rows.length > 0
      ) {
        return res.status(409).json({
          erro:
            'Já existe outra empresa cadastrada com esse e-mail.'
        });
      }

      // ========================================================
      // ATUALIZA EMPRESA
      // ========================================================

      const { rows } =
        await pool.query(
          `UPDATE empresas
           SET
             nome = $1,
             email = $2,
             telefone = $3,
             cor_primaria = $4,
             cor_destaque = $5,
             cor_fundo = $6,
             atualizado_em = CURRENT_TIMESTAMP
           WHERE id = $7
           RETURNING
             id,
             nome,
             email,
             telefone,
             cor_primaria,
             cor_destaque,
             cor_fundo,
             criado_em,
             atualizado_em`,
          [
            nomeLimpo,
            emailLimpo,
            telefoneLimpo,
            corPrimariaLimpa,
            corDestaqueLimpa,
            corFundoLimpa,
            req.usuario.empresa_id
          ]
        );

      if (rows.length === 0) {
        return res.status(404).json({
          erro: 'Empresa não encontrada.'
        });
      }

      return res.json({
        mensagem:
          'Configurações salvas com sucesso.',

        empresa:
          rows[0]
      });

    } catch (err) {

      console.error(
        'Erro ao atualizar configurações:',
        err
      );

      return res.status(500).json({
        erro:
          'Não foi possível salvar as configurações.'
      });
    }
  }
);

module.exports = router;
