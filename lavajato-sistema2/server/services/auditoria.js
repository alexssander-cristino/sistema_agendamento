const pool = require('../db');

/**
 * ============================================================
 * ORVIX — SERVIÇO DE AUDITORIA
 * ============================================================
 *
 * Centraliza o registro das ações realizadas pelos usuários.
 *
 * Estrutura atual da tabela logs_auditoria:
 *
 * empresa_id
 * usuario_id
 * acao
 * entidade
 * entidade_id
 * detalhes
 * criado_em
 *
 * IMPORTANTE:
 * - A empresa é obtida do usuário autenticado.
 * - Nunca confiar em empresa_id enviado pelo frontend.
 * - Falhas de auditoria não devem derrubar a operação principal.
 *
 * ============================================================
 */

async function registrarAuditoria(req, dados = {}) {
  try {

    const usuario =
      req?.usuario || {};

    // ==========================================================
    // EMPRESA
    // ==========================================================

    const empresaId =
      usuario.empresa_id ??
      usuario.empresaId ??
      null;


    // ==========================================================
    // USUÁRIO
    // ==========================================================

    const usuarioId =
      usuario.id ??
      null;


    if (!empresaId) {

      console.warn(
        '[AUDITORIA] Registro ignorado: usuário sem empresa_id.'
      );

      return null;
    }


    // ==========================================================
    // AÇÃO
    // ==========================================================

    const acao =
      String(
        dados.acao || ''
      ).trim();


    // ==========================================================
    // ENTIDADE
    // ==========================================================
    //
    // Suporta tanto:
    //
    // entidade: 'cliente'
    //
    // quanto o formato antigo:
    //
    // modulo: 'clientes'
    //
    // ==========================================================

    const entidade =
      String(
        dados.entidade ||
        dados.modulo ||
        ''
      ).trim();


    if (!acao || !entidade) {

      console.warn(
        '[AUDITORIA] Registro ignorado: ação ou entidade não informada.'
      );

      return null;
    }


    // ==========================================================
    // ID DO REGISTRO
    // ==========================================================

    const valorEntidadeId =
      dados.entidadeId ??
      dados.registroId ??
      null;

    let entidadeId = null;

    if (
      valorEntidadeId !== null &&
      valorEntidadeId !== undefined &&
      valorEntidadeId !== ''
    ) {

      const convertido =
        Number(valorEntidadeId);

      if (
        Number.isInteger(convertido) &&
        convertido > 0
      ) {

        entidadeId = convertido;

      }

    }


    // ==========================================================
    // DETALHES
    // ==========================================================
    //
    // O campo detalhes é JSONB.
    //
    // Mantemos compatibilidade com o formato antigo:
    //
    // descricao
    // dadosAnteriores
    // dadosNovos
    // ip
    // userAgent
    //
    // Assim, as rotas antigas que já chamam
    // registrarAuditoria() continuam funcionando.
    //
    // ==========================================================

    const detalhes = montarDetalhes(
      req,
      dados
    );


    // ==========================================================
    // EXECUTOR
    // ==========================================================
    //
    // Normalmente usamos o pool.
    //
    // Caso uma rota futuramente envie:
    //
    // client: client
    //
    // o log poderá ser gravado dentro da mesma transação.
    //
    // ==========================================================

    const executor =
      dados.client &&
      typeof dados.client.query === 'function'
        ? dados.client
        : pool;


    // ==========================================================
    // INSERT
    // ==========================================================

    const { rows } =
      await executor.query(
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
            $6::jsonb,
            CURRENT_TIMESTAMP
          )
          RETURNING *
        `,
        [
          empresaId,
          usuarioId,
          acao,
          entidade,
          entidadeId,
          detalhes
        ]
      );


    return rows[0] || null;

  } catch (erro) {

    /**
     * ========================================================
     * IMPORTANTE
     * ========================================================
     *
     * Auditoria nunca deve derrubar uma operação legítima.
     *
     * Exemplo:
     *
     * cliente foi criado
     * ↓
     * auditoria falhou
     * ↓
     * cliente continua criado
     *
     * ========================================================
     */

    console.error(
      '[AUDITORIA] Erro ao registrar log:',
      {
        erro:
          erro.message,

        codigo:
          erro.code,

        tabela:
          'logs_auditoria'
      }
    );

    return null;
  }
}


/**
 * ============================================================
 * MONTAR DETALHES
 * ============================================================
 */

function montarDetalhes(
  req,
  dados
) {

  const detalhes = {};


  // ==========================================================
  // DESCRIÇÃO
  // ==========================================================

  if (
    dados.descricao !== undefined &&
    dados.descricao !== null
  ) {

    detalhes.descricao =
      String(
        dados.descricao
      );

  }


  // ==========================================================
  // DADOS ANTERIORES
  // ==========================================================

  if (
    dados.dadosAnteriores !== undefined &&
    dados.dadosAnteriores !== null
  ) {

    detalhes.dados_anteriores =
      normalizarJson(
        dados.dadosAnteriores
      );

  }


  // ==========================================================
  // DADOS NOVOS
  // ==========================================================

  if (
    dados.dadosNovos !== undefined &&
    dados.dadosNovos !== null
  ) {

    detalhes.dados_novos =
      normalizarJson(
        dados.dadosNovos
      );

  }


  // ==========================================================
  // IP
  // ==========================================================

  const ip =
    obterIp(req);

  if (ip) {

    detalhes.ip =
      ip;

  }


  // ==========================================================
  // USER AGENT
  // ==========================================================

  const userAgent =
    req?.headers?.['user-agent'] ||
    null;

  if (userAgent) {

    detalhes.user_agent =
      String(
        userAgent
      ).slice(0, 500);

  }


  // ==========================================================
  // DETALHES PERSONALIZADOS
  // ==========================================================
  //
  // Permite que uma rota envie:
  //
  // detalhes: {
  //   nome: 'João',
  //   telefone: '...'
  // }
  //
  // ==========================================================

  if (
    dados.detalhes !== undefined &&
    dados.detalhes !== null
  ) {

    const detalhesPersonalizados =
      normalizarJson(
        dados.detalhes
      );

    if (
      detalhesPersonalizados &&
      typeof detalhesPersonalizados === 'object' &&
      !Array.isArray(detalhesPersonalizados)
    ) {

      Object.assign(
        detalhes,
        detalhesPersonalizados
      );

    }

  }


  // ==========================================================
  // JSON FINAL
  // ==========================================================

  if (
    Object.keys(detalhes).length === 0
  ) {

    return null;

  }


  return JSON.stringify(
    detalhes
  );
}


/**
 * ============================================================
 * IP DO CLIENTE
 * ============================================================
 */

function obterIp(req) {

  if (!req) {
    return null;
  }


  const forwarded =
    req.headers?.['x-forwarded-for'];


  if (forwarded) {

    return String(
      forwarded
    )
      .split(',')[0]
      .trim()
      .slice(0, 100);

  }


  return (
    req.ip ||
    req.socket?.remoteAddress ||
    null
  );
}


/**
 * ============================================================
 * NORMALIZAÇÃO DE JSON
 * ============================================================
 */

function normalizarJson(valor) {

  if (
    valor === undefined ||
    valor === null
  ) {

    return null;

  }


  try {

    JSON.stringify(
      valor
    );

    return valor;

  } catch (_) {

    return null;

  }
}


/**
 * ============================================================
 * EXPORTAÇÃO
 * ============================================================
 */

module.exports = {
  registrarAuditoria
};