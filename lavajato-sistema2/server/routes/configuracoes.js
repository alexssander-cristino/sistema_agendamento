const express = require('express');
const pool = require('../db');

const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');

const router = express.Router();

// ============================================================
// MIDDLEWARES GLOBAIS DA ROTA
// ============================================================

router.use(autenticar);
router.use(verificarAssinatura);

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const PERMISSAO_CONFIGURACOES = 'configuracoes';

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
// LIMITES
// ============================================================

const LIMITES = {
  nome: 150,
  email: 254,
  telefone: 30,
  nicho: 30,
  cor: 7,

  // Proteção adicional
  bodyCampos: 20,
  bodyString: 1000
};

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
// CAMPOS PERMITIDOS
// ============================================================

const CAMPOS_PERMITIDOS = new Set([
  'nome',
  'email',
  'telefone',
  'nicho',
  'cor_primaria',
  'cor_destaque',
  'cor_fundo'
]);

// ============================================================
// VERIFICA PERMISSÃO
// ============================================================

async function verificarPermissaoConfiguracoes(req, res, next) {
  try {

    // ----------------------------------------------------------
    // Validação básica do usuário autenticado
    // ----------------------------------------------------------

    if (!req.usuario || !req.usuario.id) {
      return res.status(401).json({
        erro: 'Usuário não autenticado.'
      });
    }

    if (!req.usuario.empresa_id) {
      return res.status(403).json({
        erro: 'Usuário não está vinculado a uma empresa.'
      });
    }

    // ----------------------------------------------------------
    // Administrador possui acesso completo
    // ----------------------------------------------------------

    if (req.usuario.perfil === 'administrador') {
      return next();
    }

    // ----------------------------------------------------------
    // Verifica permissão específica
    // ----------------------------------------------------------

    const { rows } = await pool.query(
      `
        SELECT 1
        FROM usuario_permissoes up
        INNER JOIN permissoes p
          ON p.id = up.permissao_id
        WHERE up.usuario_id = $1
          AND p.codigo = $2
        LIMIT 1
      `,
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

    return next();

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
// VALIDA STRING
// ============================================================

function validarString(valor, limite) {

  return (
    typeof valor === 'string' &&
    valor.trim().length > 0 &&
    valor.trim().length <= limite
  );
}

// ============================================================
// VALIDA E-MAIL
// ============================================================

function validarEmail(email) {

  if (typeof email !== 'string') {
    return false;
  }

  const valor = email.trim();

  if (
    valor.length === 0 ||
    valor.length > LIMITES.email
  ) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

// ============================================================
// VALIDA COR HEXADECIMAL
//
// Aceita:
// #000
// #FFF
// #000000
// #FFFFFF
// ============================================================

function validarCor(cor) {

  if (typeof cor !== 'string') {
    return false;
  }

  const valor = cor.trim();

  if (valor.length > LIMITES.cor) {
    return false;
  }

  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(valor);
}

// ============================================================
// NORMALIZA COR
// ============================================================

function normalizarCor(cor) {
  return cor.trim().toLowerCase();
}

// ============================================================
// VERIFICA SE CAMPO FOI ENVIADO
// ============================================================

function campoFoiEnviado(valor) {

  return (
    valor !== undefined &&
    valor !== null
  );
}

// ============================================================
// COR FOI ENVIADA?
// ============================================================

function corFoiEnviada(cor) {

  return (
    cor !== undefined &&
    cor !== null &&
    cor !== ''
  );
}

// ============================================================
// ENCONTRA CAMPOS DESCONHECIDOS
// ============================================================

function encontrarCamposDesconhecidos(body) {

  return Object.keys(body || {}).filter(
    campo => !CAMPOS_PERMITIDOS.has(campo)
  );
}

// ============================================================
// VALIDA BODY
// ============================================================

function validarBody(body) {

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return {
      valido: false,
      erro: 'O corpo da requisição é inválido.'
    };
  }

  const quantidadeCampos = Object.keys(body).length;

  if (quantidadeCampos > LIMITES.bodyCampos) {
    return {
      valido: false,
      erro: 'Quantidade de campos enviada excede o limite permitido.'
    };
  }

  return {
    valido: true
  };
}

// ============================================================
// PROTEÇÃO CONTRA STRINGS EXCESSIVAMENTE GRANDES
// ============================================================

function validarTamanhoDasStrings(body) {

  for (const [campo, valor] of Object.entries(body)) {

    if (
      typeof valor === 'string' &&
      valor.length > LIMITES.bodyString
    ) {
      return {
        valido: false,
        campo
      };
    }
  }

  return {
    valido: true
  };
}

// ============================================================
// REMOVE HEADERS DESNECESSÁRIOS DA RESPOSTA
// ============================================================

function aplicarHeadersConfiguracoes(res) {

  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );

  res.setHeader(
    'Pragma',
    'no-cache'
  );

  res.setHeader(
    'Expires',
    '0'
  );

  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );
}

// ============================================================
// GET /api/configuracoes
// ============================================================

router.get(
  '/',
  verificarPermissaoConfiguracoes,
  async (req, res) => {

    aplicarHeadersConfiguracoes(res);

    try {

      // --------------------------------------------------------
      // Garante que a empresa pertence ao usuário
      // --------------------------------------------------------

      if (!req.usuario.empresa_id) {
        return res.status(403).json({
          erro: 'Usuário não possui empresa vinculada.'
        });
      }

      const { rows } = await pool.query(
        `
          SELECT ${CAMPOS_EMPRESA}
          FROM empresas
          WHERE id = $1
          LIMIT 1
        `,
        [
          req.usuario.empresa_id
        ]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          erro: 'Empresa não encontrada.'
        });
      }

      return res.status(200).json({
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
// ============================================================

router.put(
  '/',
  verificarPermissaoConfiguracoes,
  async (req, res) => {

    aplicarHeadersConfiguracoes(res);

    // ==========================================================
    // VALIDA BODY
    // ==========================================================

    const validacaoBody =
      validarBody(req.body);

    if (!validacaoBody.valido) {

      return res.status(400).json({
        erro: validacaoBody.erro
      });
    }

    const body = req.body;

    // ==========================================================
    // VALIDA TAMANHO DAS STRINGS
    // ==========================================================

    const validacaoStrings =
      validarTamanhoDasStrings(body);

    if (!validacaoStrings.valido) {

      return res.status(400).json({
        erro:
          'Um ou mais campos possuem conteúdo acima do limite permitido.',
        campo:
          validacaoStrings.campo
      });
    }

    // ==========================================================
    // PROTEÇÃO CONTRA CAMPOS DESCONHECIDOS
    // ==========================================================

    const camposDesconhecidos =
      encontrarCamposDesconhecidos(body);

    if (camposDesconhecidos.length > 0) {

      console.warn(
        'Tentativa de enviar campos não permitidos:',
        {
          usuario_id: req.usuario.id,
          empresa_id: req.usuario.empresa_id,
          campos: camposDesconhecidos
        }
      );

      return res.status(400).json({
        erro:
          'Um ou mais campos enviados não são permitidos.',
        campos:
          camposDesconhecidos
      });
    }

    // ==========================================================
    // GARANTE EMPRESA
    // ==========================================================

    if (!req.usuario.empresa_id) {

      return res.status(403).json({
        erro:
          'Usuário não está vinculado a uma empresa.'
      });
    }

    // ==========================================================
    // EXTRAI CAMPOS
    // ==========================================================

    const {
      nome,
      email,
      telefone,
      nicho,
      cor_primaria,
      cor_destaque,
      cor_fundo
    } = body;

    // ==========================================================
    // NOME
    // ==========================================================

    if (!validarString(nome, LIMITES.nome)) {

      return res.status(400).json({
        erro:
          `O nome da empresa deve ter entre 1 e ${LIMITES.nome} caracteres.`
      });
    }

    // ==========================================================
    // E-MAIL
    // ==========================================================

    if (!validarEmail(email)) {

      return res.status(400).json({
        erro:
          'Informe um e-mail válido.'
      });
    }

    // ==========================================================
    // TELEFONE
    // ==========================================================

    let telefoneLimpo = null;

    if (
      campoFoiEnviado(telefone) &&
      telefone !== ''
    ) {

      if (
        typeof telefone !== 'string' ||
        telefone.trim().length > LIMITES.telefone
      ) {

        return res.status(400).json({
          erro:
            `O telefone deve ter no máximo ${LIMITES.telefone} caracteres.`
        });
      }

      telefoneLimpo =
        telefone.trim();
    }

    // ==========================================================
    // NICHO
    // ==========================================================

    let nichoLimpo = null;

    if (
      campoFoiEnviado(nicho) &&
      nicho !== ''
    ) {

      if (
        typeof nicho !== 'string'
      ) {

        return res.status(400).json({
          erro:
            'Tipo de negócio inválido.'
        });
      }

      nichoLimpo =
        nicho
          .trim()
          .toLowerCase();

      if (
        !NICHOS_VALIDOS.includes(nichoLimpo)
      ) {

        return res.status(400).json({
          erro:
            'Tipo de negócio inválido.'
        });
      }
    }

    // ==========================================================
    // CORES
    // ==========================================================

    const cores = {
      cor_primaria,
      cor_destaque,
      cor_fundo
    };

    for (
      const [campo, valor]
      of Object.entries(cores)
    ) {

      if (
        corFoiEnviada(valor) &&
        !validarCor(valor)
      ) {

        console.error(
          'Cor recebida inválida:',
          {
            empresa_id:
              req.usuario.empresa_id,

            usuario_id:
              req.usuario.id,

            campo,

            valor
          }
        );

        return res.status(400).json({
          erro:
            'Uma ou mais cores informadas são inválidas.'
        });
      }
    }

    // ==========================================================
    // NORMALIZAÇÃO
    // ==========================================================

    const nomeLimpo =
      nome.trim();

    const emailLimpo =
      email.trim().toLowerCase();

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

    let client;

    try {

      client =
        await pool.connect();

      await client.query(
        'BEGIN'
      );

      // ========================================================
      // VERIFICA EMPRESA
      // ========================================================

      const empresaAtual =
        await client.query(
          `
            SELECT
              id,
              nome,
              email,
              telefone,
              nicho,
              cor_primaria,
              cor_destaque,
              cor_fundo
            FROM empresas
            WHERE id = $1
            LIMIT 1
            FOR UPDATE
          `,
          [
            req.usuario.empresa_id
          ]
        );

      if (
        empresaAtual.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          erro:
            'Empresa não encontrada.'
        });
      }

      // ========================================================
      // VERIFICA E-MAIL DUPLICADO
      // ========================================================

      const empresaExistente =
        await client.query(
          `
            SELECT id
            FROM empresas
            WHERE LOWER(email) = LOWER($1)
              AND id <> $2
            LIMIT 1
          `,
          [
            emailLimpo,
            req.usuario.empresa_id
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
            'Já existe outra empresa cadastrada com esse e-mail.'
        });
      }

      // ========================================================
      // ATUALIZA EMPRESA
      // ========================================================

      const { rows } =
        await client.query(
          `
            UPDATE empresas
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
            RETURNING ${CAMPOS_EMPRESA}
          `,
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

      if (
        rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          erro:
            'Empresa não encontrada.'
        });
      }

      // ========================================================
      // AUDITORIA
      //
      // Só executa se a tabela existir.
      // ========================================================

      try {

        await client.query(
          `
            INSERT INTO logs_auditoria (
              empresa_id,
              usuario_id,
              acao,
              entidade,
              entidade_id,
              detalhes,
              criado_em
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              CURRENT_TIMESTAMP
            )
          `,
          [
            req.usuario.empresa_id,
            req.usuario.id,
            'atualizacao',
            'empresa',
            req.usuario.empresa_id,
            JSON.stringify({
              origem: 'configuracoes',
              campos:
                Object.keys(body)
            })
          ]
        );

      } catch (auditError) {

        // ------------------------------------------------------
        // 42P01 = tabela inexistente
        // ------------------------------------------------------

        if (
          auditError.code !== '42P01'
        ) {

          throw auditError;
        }

        console.warn(
          'Tabela logs_auditoria ainda não configurada.'
        );
      }

      // ========================================================
      // COMMIT
      // ========================================================

      await client.query(
        'COMMIT'
      );

      // ========================================================
      // RESPOSTA
      // ========================================================

      return res.status(200).json({
        mensagem:
          'Configurações salvas com sucesso.',

        empresa:
          rows[0]
      });

    } catch (err) {

      // ========================================================
      // ROLLBACK
      // ========================================================

      if (client) {

        try {

          await client.query(
            'ROLLBACK'
          );

        } catch (rollbackError) {

          console.error(
            'Erro ao executar rollback:',
            rollbackError
          );
        }
      }

      // ========================================================
      // LOG DO ERRO
      // ========================================================

      console.error(
        'Erro ao atualizar configurações:',
        {
          empresa_id:
            req.usuario?.empresa_id,

          usuario_id:
            req.usuario?.id,

          erro:
            err.message,

          codigo:
            err.code
        }
      );

      // ========================================================
      // UNIQUE
      // ========================================================

      if (
        err.code === '23505'
      ) {

        return res.status(409).json({
          erro:
            'Já existe uma empresa cadastrada com esses dados.'
        });
      }

      // ========================================================
      // CHECK CONSTRAINT
      // ========================================================

      if (
        err.code === '23514'
      ) {

        return res.status(400).json({
          erro:
            'Um dos valores informados não é permitido.'
        });
      }

      // ========================================================
      // FOREIGN KEY
      // ========================================================

      if (
        err.code === '23503'
      ) {

        return res.status(400).json({
          erro:
            'Não foi possível atualizar os dados relacionados à empresa.'
        });
      }

      // ========================================================
      // STRING TOO LONG
      // ========================================================

      if (
        err.code === '22001'
      ) {

        return res.status(400).json({
          erro:
            'Um dos campos informados excede o tamanho permitido.'
        });
      }

      // ========================================================
      // VALOR INVÁLIDO
      // ========================================================

      if (
        err.code === '22P02'
      ) {

        return res.status(400).json({
          erro:
            'Um dos valores informados possui formato inválido.'
        });
      }

      // ========================================================
      // ERRO GENÉRICO
      // ========================================================

      return res.status(500).json({
        erro:
          'Não foi possível salvar as configurações.'
      });

    } finally {

      if (client) {
        client.release();
      }
    }
  }
);

// ============================================================
// EXPORTAÇÃO
// ============================================================

module.exports = router;

