const express = require('express');
const pool = require('../db');

const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');

const router = express.Router();

// ============================================================
// MIDDLEWARES GLOBAIS
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

const MOEDAS_VALIDAS = [
  'BRL',
  'USD',
  'EUR'
];

const FORMATOS_DATA_VALIDOS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD'
];

const FORMATOS_HORA_VALIDOS = [
  '24h',
  '12h'
];

const IDIOMAS_VALIDOS = [
  'pt-BR',
  'en-US',
  'es-ES'
];

const FUSOS_VALIDOS = [
  'America/Sao_Paulo',
  'America/Fortaleza',
  'America/Recife',
  'America/Manaus',
  'America/Belem',
  'America/Cuiaba',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Rio_Branco',
  'America/Noronha',
  'UTC'
];

const INTERVALOS_AGENDA_VALIDOS = [
  15,
  30,
  45,
  60,
  90,
  120
];

// ============================================================
// LIMITES
// ============================================================

const LIMITES = {
  nome: 150,
  nomeExibicao: 150,
  email: 254,
  telefone: 30,
  nicho: 30,
  cor: 7,
  logoUrl: 500,
  rodapeDocumentos: 500,
  bodyCampos: 40,
  bodyString: 1000
};

// ============================================================
// CAMPOS RETORNADOS
// ============================================================

const CAMPOS_EMPRESA = `
  id,
  nome,
  email,
  telefone,
  nicho,

  nome_exibicao,
  logo_url,

  moeda,
  formato_data,
  formato_hora,
  fuso_horario,
  idioma,

  notificacoes_ativas,
  mostrar_valores,
  dashboard_inicial,
  modo_compacto,

  rodape_documentos,
  telefone_documentos,

  agenda_horario_inicio,
  agenda_horario_fim,
  agenda_intervalo,

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

  'nome_exibicao',
  'logo_url',

  'moeda',
  'formato_data',
  'formato_hora',
  'fuso_horario',
  'idioma',

  'notificacoes_ativas',
  'mostrar_valores',
  'dashboard_inicial',
  'modo_compacto',

  'rodape_documentos',
  'telefone_documentos',

  'agenda_horario_inicio',
  'agenda_horario_fim',
  'agenda_intervalo',

  'cor_primaria',
  'cor_destaque',
  'cor_fundo'
]);

// ============================================================
// VERIFICA PERMISSÃO
// ============================================================

async function verificarPermissaoConfiguracoes(req, res, next) {
  try {
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

    if (req.usuario.perfil === 'administrador') {
      return next();
    }

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
// HEADERS
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
// VALIDA STRING
// ============================================================

function validarString(valor, limite, permitirVazio = false) {
  if (typeof valor !== 'string') {
    return false;
  }

  const texto = valor.trim();

  if (!permitirVazio && texto.length === 0) {
    return false;
  }

  return texto.length <= limite;
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
// VALIDA COR
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
// VALIDA BOOLEAN
// ============================================================

function validarBoolean(valor) {
  return typeof valor === 'boolean';
}

// ============================================================
// CAMPO FOI ENVIADO
// ============================================================

function campoFoiEnviado(valor) {
  return valor !== undefined;
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

  if (quantidadeCampos === 0) {
    return {
      valido: false,
      erro: 'Nenhuma configuração foi enviada.'
    };
  }

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
// VALIDA TAMANHO DAS STRINGS
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
// CAMPOS DESCONHECIDOS
// ============================================================

function encontrarCamposDesconhecidos(body) {
  return Object.keys(body || {}).filter(
    campo => !CAMPOS_PERMITIDOS.has(campo)
  );
}

// ============================================================
// VALIDA HORA
// ============================================================

function validarHora(hora) {
  if (typeof hora !== 'string') {
    return false;
  }

  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(
    hora.trim()
  );
}

// ============================================================
// NORMALIZA HORA
// ============================================================

function normalizarHora(hora) {
  return hora.trim();
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

    // ========================================================
    // BODY
    // ========================================================

    const validacaoBody = validarBody(req.body);

    if (!validacaoBody.valido) {
      return res.status(400).json({
        erro: validacaoBody.erro
      });
    }

    const body = req.body;

    // ========================================================
    // TAMANHO
    // ========================================================

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

    // ========================================================
    // CAMPOS DESCONHECIDOS
    // ========================================================

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

    // ========================================================
    // CAMPOS ENVIADOS
    // ========================================================

    const {
      nome,
      email,
      telefone,
      nicho,

      nome_exibicao,
      logo_url,

      moeda,
      formato_data,
      formato_hora,
      fuso_horario,
      idioma,

      notificacoes_ativas,
      mostrar_valores,
      dashboard_inicial,
      modo_compacto,

      rodape_documentos,
      telefone_documentos,

      agenda_horario_inicio,
      agenda_horario_fim,
      agenda_intervalo,

      cor_primaria,
      cor_destaque,
      cor_fundo
    } = body;

    // ========================================================
    // VALIDAÇÕES
    // ========================================================

    if (
      campoFoiEnviado(nome) &&
      !validarString(nome, LIMITES.nome)
    ) {
      return res.status(400).json({
        erro:
          `O nome da empresa deve ter entre 1 e ${LIMITES.nome} caracteres.`
      });
    }

    if (
      campoFoiEnviado(email) &&
      !validarEmail(email)
    ) {
      return res.status(400).json({
        erro: 'Informe um e-mail válido.'
      });
    }

    if (
      campoFoiEnviado(telefone) &&
      telefone !== null &&
      telefone !== '' &&
      !validarString(
        telefone,
        LIMITES.telefone
      )
    ) {
      return res.status(400).json({
        erro:
          `O telefone deve ter no máximo ${LIMITES.telefone} caracteres.`
      });
    }

    // ========================================================
    // NICHO
    // ========================================================

    if (
      campoFoiEnviado(nicho) &&
      !NICHOS_VALIDOS.includes(
        String(nicho).trim().toLowerCase()
      )
    ) {
      return res.status(400).json({
        erro: 'Tipo de negócio inválido.'
      });
    }

    // ========================================================
    // NOME EXIBIÇÃO
    // ========================================================

    if (
      campoFoiEnviado(nome_exibicao) &&
      nome_exibicao !== null &&
      !validarString(
        nome_exibicao,
        LIMITES.nomeExibicao
      )
    ) {
      return res.status(400).json({
        erro:
          'O nome exibido possui tamanho inválido.'
      });
    }

    // ========================================================
    // LOGO
    // ========================================================

    if (
      campoFoiEnviado(logo_url) &&
      logo_url !== null &&
      logo_url !== '' &&
      !validarString(
        logo_url,
        LIMITES.logoUrl
      )
    ) {
      return res.status(400).json({
        erro:
          'O endereço da logo é inválido.'
      });
    }

    // ========================================================
    // MOEDA
    // ========================================================

    if (
      campoFoiEnviado(moeda) &&
      !MOEDAS_VALIDAS.includes(moeda)
    ) {
      return res.status(400).json({
        erro: 'Moeda selecionada é inválida.'
      });
    }

    // ========================================================
    // DATA
    // ========================================================

    if (
      campoFoiEnviado(formato_data) &&
      !FORMATOS_DATA_VALIDOS.includes(
        formato_data
      )
    ) {
      return res.status(400).json({
        erro: 'Formato de data inválido.'
      });
    }

    // ========================================================
    // HORA
    // ========================================================

    if (
      campoFoiEnviado(formato_hora) &&
      !FORMATOS_HORA_VALIDOS.includes(
        formato_hora
      )
    ) {
      return res.status(400).json({
        erro: 'Formato de hora inválido.'
      });
    }

    // ========================================================
    // FUSO
    // ========================================================

    if (
      campoFoiEnviado(fuso_horario) &&
      !FUSOS_VALIDOS.includes(
        fuso_horario
      )
    ) {
      return res.status(400).json({
        erro: 'Fuso horário inválido.'
      });
    }

    // ========================================================
    // IDIOMA
    // ========================================================

    if (
      campoFoiEnviado(idioma) &&
      !IDIOMAS_VALIDOS.includes(
        idioma
      )
    ) {
      return res.status(400).json({
        erro: 'Idioma selecionado é inválido.'
      });
    }

    // ========================================================
    // BOOLEANOS
    // ========================================================

    const booleanos = {
      notificacoes_ativas,
      mostrar_valores,
      dashboard_inicial,
      modo_compacto,
      telefone_documentos
    };

    for (
      const [campo, valor]
      of Object.entries(booleanos)
    ) {

      if (
        campoFoiEnviado(valor) &&
        !validarBoolean(valor)
      ) {
        return res.status(400).json({
          erro:
            `O campo ${campo} deve ser verdadeiro ou falso.`
        });
      }
    }

    // ========================================================
    // RODAPÉ
    // ========================================================

    if (
      campoFoiEnviado(rodape_documentos) &&
      rodape_documentos !== null &&
      !validarString(
        rodape_documentos,
        LIMITES.rodapeDocumentos,
        true
      )
    ) {
      return res.status(400).json({
        erro:
          'O rodapé dos documentos excede o limite permitido.'
      });
    }

    // ========================================================
    // HORÁRIO INICIAL
    // ========================================================

    if (
      campoFoiEnviado(agenda_horario_inicio) &&
      !validarHora(agenda_horario_inicio)
    ) {
      return res.status(400).json({
        erro:
          'Horário inicial da agenda inválido.'
      });
    }

    // ========================================================
    // HORÁRIO FINAL
    // ========================================================

    if (
      campoFoiEnviado(agenda_horario_fim) &&
      !validarHora(agenda_horario_fim)
    ) {
      return res.status(400).json({
        erro:
          'Horário final da agenda inválido.'
      });
    }

    // ========================================================
    // INTERVALO
    // ========================================================

    if (
      campoFoiEnviado(agenda_intervalo) &&
      !INTERVALOS_AGENDA_VALIDOS.includes(
        Number(agenda_intervalo)
      )
    ) {
      return res.status(400).json({
        erro:
          'Intervalo da agenda inválido.'
      });
    }

    // ========================================================
    // CORES
    // ========================================================

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
        campoFoiEnviado(valor) &&
        valor !== null &&
        valor !== '' &&
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

    // ========================================================
    // CLIENT
    // ========================================================

    let client;

    try {

      client = await pool.connect();

      await client.query('BEGIN');

      // ======================================================
      // EMPRESA ATUAL
      // ======================================================

      const empresaAtual =
        await client.query(
          `
            SELECT *
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

        await client.query('ROLLBACK');

        return res.status(404).json({
          erro: 'Empresa não encontrada.'
        });
      }

      // ======================================================
      // E-MAIL DUPLICADO
      // ======================================================

      if (campoFoiEnviado(email)) {

        const emailLimpo =
          email.trim().toLowerCase();

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

          await client.query('ROLLBACK');

          return res.status(409).json({
            erro:
              'Já existe outra empresa cadastrada com esse e-mail.'
          });
        }
      }

      // ======================================================
      // UPDATE DINÂMICO
      // ======================================================

      const camposUpdate = [];
      const valores = [];

      function adicionarCampo(campo, valor) {
        camposUpdate.push(
          `${campo} = $${valores.length + 1}`
        );

        valores.push(valor);
      }

      if (campoFoiEnviado(nome)) {
        adicionarCampo(
          'nome',
          nome.trim()
        );
      }

      if (campoFoiEnviado(email)) {
        adicionarCampo(
          'email',
          email.trim().toLowerCase()
        );
      }

      if (campoFoiEnviado(telefone)) {
        adicionarCampo(
          'telefone',
          telefone === ''
            ? null
            : telefone.trim()
        );
      }

      if (campoFoiEnviado(nicho)) {
        adicionarCampo(
          'nicho',
          nicho.trim().toLowerCase()
        );
      }

      if (campoFoiEnviado(nome_exibicao)) {
        adicionarCampo(
          'nome_exibicao',
          nome_exibicao === null
            ? null
            : nome_exibicao.trim()
        );
      }

      if (campoFoiEnviado(logo_url)) {
        adicionarCampo(
          'logo_url',
          logo_url === ''
            ? null
            : logo_url.trim()
        );
      }

      if (campoFoiEnviado(moeda)) {
        adicionarCampo(
          'moeda',
          moeda
        );
      }

      if (campoFoiEnviado(formato_data)) {
        adicionarCampo(
          'formato_data',
          formato_data
        );
      }

      if (campoFoiEnviado(formato_hora)) {
        adicionarCampo(
          'formato_hora',
          formato_hora
        );
      }

      if (campoFoiEnviado(fuso_horario)) {
        adicionarCampo(
          'fuso_horario',
          fuso_horario
        );
      }

      if (campoFoiEnviado(idioma)) {
        adicionarCampo(
          'idioma',
          idioma
        );
      }

      if (campoFoiEnviado(notificacoes_ativas)) {
        adicionarCampo(
          'notificacoes_ativas',
          notificacoes_ativas
        );
      }

      if (campoFoiEnviado(mostrar_valores)) {
        adicionarCampo(
          'mostrar_valores',
          mostrar_valores
        );
      }

      if (campoFoiEnviado(dashboard_inicial)) {
        adicionarCampo(
          'dashboard_inicial',
          dashboard_inicial
        );
      }

      if (campoFoiEnviado(modo_compacto)) {
        adicionarCampo(
          'modo_compacto',
          modo_compacto
        );
      }

      if (campoFoiEnviado(rodape_documentos)) {
        adicionarCampo(
          'rodape_documentos',
          rodape_documentos === ''
            ? null
            : rodape_documentos.trim()
        );
      }

      if (campoFoiEnviado(telefone_documentos)) {
        adicionarCampo(
          'telefone_documentos',
          telefone_documentos
        );
      }

      if (campoFoiEnviado(agenda_horario_inicio)) {
        adicionarCampo(
          'agenda_horario_inicio',
          normalizarHora(
            agenda_horario_inicio
          )
        );
      }

      if (campoFoiEnviado(agenda_horario_fim)) {
        adicionarCampo(
          'agenda_horario_fim',
          normalizarHora(
            agenda_horario_fim
          )
        );
      }

      if (campoFoiEnviado(agenda_intervalo)) {
        adicionarCampo(
          'agenda_intervalo',
          Number(agenda_intervalo)
        );
      }

      if (campoFoiEnviado(cor_primaria)) {
        adicionarCampo(
          'cor_primaria',
          cor_primaria === ''
            ? null
            : cor_primaria.trim().toLowerCase()
        );
      }

      if (campoFoiEnviado(cor_destaque)) {
        adicionarCampo(
          'cor_destaque',
          cor_destaque === ''
            ? null
            : cor_destaque.trim().toLowerCase()
        );
      }

      if (campoFoiEnviado(cor_fundo)) {
        adicionarCampo(
          'cor_fundo',
          cor_fundo === ''
            ? null
            : cor_fundo.trim().toLowerCase()
        );
      }

      // ======================================================
      // NENHUMA ALTERAÇÃO
      // ======================================================

      if (camposUpdate.length === 0) {

        await client.query('ROLLBACK');

        return res.status(400).json({
          erro:
            'Nenhuma configuração válida foi enviada.'
        });
      }

      // ======================================================
      // ATUALIZA
      // ======================================================

      valores.push(
        req.usuario.empresa_id
      );

      const { rows } =
        await client.query(
          `
            UPDATE empresas
            SET
              ${camposUpdate.join(', ')},
              atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $${valores.length}
            RETURNING ${CAMPOS_EMPRESA}
          `,
          valores
        );

      if (rows.length === 0) {

        await client.query('ROLLBACK');

        return res.status(404).json({
          erro:
            'Empresa não encontrada.'
        });
      }

      // ======================================================
      // AUDITORIA
      // ======================================================

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

        if (
          auditError.code !== '42P01'
        ) {
          throw auditError;
        }

        console.warn(
          'Tabela logs_auditoria ainda não configurada.'
        );
      }

      // ======================================================
      // COMMIT
      // ======================================================

      await client.query('COMMIT');

      // ======================================================
      // RESPOSTA
      // ======================================================

      return res.status(200).json({
        mensagem:
          'Configurações salvas com sucesso.',

        empresa:
          rows[0]
      });

    } catch (err) {

      if (client) {

        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error(
            'Erro ao executar rollback:',
            rollbackError
          );
        }
      }

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

      // ======================================================
      // UNIQUE
      // ======================================================

      if (err.code === '23505') {
        return res.status(409).json({
          erro:
            'Já existe uma empresa cadastrada com esses dados.'
        });
      }

      // ======================================================
      // CHECK
      // ======================================================

      if (err.code === '23514') {
        return res.status(400).json({
          erro:
            'Um dos valores informados não é permitido.'
        });
      }

      // ======================================================
      // FOREIGN KEY
      // ======================================================

      if (err.code === '23503') {
        return res.status(400).json({
          erro:
            'Não foi possível atualizar os dados relacionados à empresa.'
        });
      }

      // ======================================================
      // STRING TOO LONG
      // ======================================================

      if (err.code === '22001') {
        return res.status(400).json({
          erro:
            'Um dos campos informados excede o tamanho permitido.'
        });
      }

      // ======================================================
      // INVALID FORMAT
      // ======================================================

      if (err.code === '22P02') {
        return res.status(400).json({
          erro:
            'Um dos valores informados possui formato inválido.'
        });
      }

      // ======================================================
      // COLUNA/TABELA INEXISTENTE
      // ======================================================

      if (err.code === '42703') {
        return res.status(500).json({
          erro:
            'Uma ou mais configurações ainda não foram criadas no banco de dados.'
        });
      }

      // ======================================================
      // ERRO GENÉRICO
      // ======================================================

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
