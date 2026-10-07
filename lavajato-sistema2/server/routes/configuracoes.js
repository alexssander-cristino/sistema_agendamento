const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');

const verificarAssinatura = require('../middleware/assinatura');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);

// ============================================================
// PERMISSÃO NECESSÁRIA
// ============================================================

const PERMISSAO_CONFIGURACOES = 'configuracoes';

// ============================================================
// NICHOS PERMITIDOS (devem bater com o front-end)
// ============================================================

const NICHOS_VALIDOS = [
  'lavajato',
  'barbearia',
  'clinica',
  'pet',
  'oficina',
  'personal',
  'generico'
];

// ============================================================
// CAMPOS RETORNADOS DA EMPRESA
// ============================================================

const CAMPOS_EMPRESA = `
  id,
  nome,
  email,
  telefone,
  nicho,
  cor_primaria,
  cor_destaque,
  cor_fundo,
  criado_em,
  atualizado_em
`;

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
// Aceita: #000000, #FFFFFF, #fff, #ABC
// ============================================================

function validarCor(cor) {
  if (typeof cor !== 'string') {
    return false;
  }

  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(cor.trim());
}

// ============================================================
// NORMALIZA COR
// ============================================================

function normalizarCor(cor) {
  return cor.trim().toLowerCase();
}

// ============================================================
// UMA COR FOI ENVIADA?
// ============================================================

function corFoiEnviada(cor) {
  return cor !== undefined && cor !== null && cor !== '';
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
        `SELECT ${CAMPOS_EMPRESA}
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
//
// Cores e nicho são OPCIONAIS: quando não enviados,
// o valor atual do banco é mantido.
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
      nicho,
      cor_primaria,
      cor_destaque,
      cor_fundo
    } = req.body;

    // ==========================================================
    // VALIDAÇÕES
    // ==========================================================

    if (!nome || typeof nome !== 'string' || !nome.trim()) {
      return res.status(400).json({
        erro: 'Informe o nome da empresa.'
      });
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        erro: 'Informe o e-mail da empresa.'
      });
    }

    // ==========================================================
    // VALIDAÇÃO DO NICHO (opcional)
    // ==========================================================

    let nichoLimpo = null;

    if (nicho !== undefined && nicho !== null && nicho !== '') {

      if (
        typeof nicho !== 'string' ||
        !NICHOS_VALIDOS.includes(nicho.trim())
      ) {
        return res.status(400).json({
          erro: 'Tipo de negócio inválido.'
        });
      }

      nichoLimpo = nicho.trim();
    }

    // ==========================================================
    // VALIDAÇÃO DAS CORES (opcionais)
    // ==========================================================

    const cores = {
      cor_primaria,
      cor_destaque,
      cor_fundo
    };

    for (const [campo, valor] of Object.entries(cores)) {

      if (corFoiEnviada(valor) && !validarCor(valor)) {

        console.error('Cor recebida inválida:', {
          campo,
          valor
        });

        return res.status(400).json({
          erro: 'Uma ou mais cores informadas são inválidas.'
        });
      }
    }

    // ==========================================================
    // NORMALIZAÇÃO DOS DADOS
    // ==========================================================

    const nomeLimpo =
      nome.trim();

    const emailLimpo =
      email.trim().toLowerCase();

    const telefoneLimpo =
      typeof telefone === 'string' && telefone.trim()
        ? telefone.trim()
        : null;

    // null = mantém o valor atual (COALESCE no UPDATE)

    const corPrimariaLimpa =
      corFoiEnviada(cor_primaria)
        ? normalizarCor(cor_primaria)
        : null;

    const corDestaqueLimpa =
      corFoiEnviada(cor_destaque)
        ? normalizarCor(cor_destaque)
        : null;

    const corFundoLimpa =
      corFoiEnviada(cor_fundo)
        ? normalizarCor(cor_fundo)
        : null;

    // ==========================================================
    // BANCO
    // ==========================================================

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

      if (empresaExistente.rows.length > 0) {
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
             nicho = COALESCE($4, nicho),
             cor_primaria = COALESCE($5, cor_primaria),
             cor_destaque = COALESCE($6, cor_destaque),
             cor_fundo = COALESCE($7, cor_fundo),
             atualizado_em = CURRENT_TIMESTAMP
           WHERE id = $8
           RETURNING ${CAMPOS_EMPRESA}`,
          [
            nomeLimpo,
            emailLimpo,
            telefoneLimpo,
            nichoLimpo,
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

      // ========================================================
      // RESPOSTA
      // ========================================================

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