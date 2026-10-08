const pool = require('../db');

/**
 * ============================================================
 * ORVIX — SERVIÇO DE AUDITORIA
 * ============================================================
 *
 * Centraliza o registro das ações realizadas pelos usuários.
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
    const usuario = req.usuario || {};

    const empresaId =
      usuario.empresa_id ??
      usuario.empresaId ??
      null;

    const usuarioId =
      usuario.id ??
      null;

    if (!empresaId) {
      console.warn(
        '[AUDITORIA] Registro ignorado: usuário sem empresa_id.'
      );

      return null;
    }

    const acao = String(dados.acao || '').trim();
    const modulo = String(dados.modulo || '').trim();

    if (!acao || !modulo) {
      console.warn(
        '[AUDITORIA] Registro ignorado: ação ou módulo não informado.'
      );

      return null;
    }

    const descricao =
      dados.descricao != null
        ? String(dados.descricao)
        : null;

    const registroId =
      dados.registroId != null
        ? Number(dados.registroId)
        : null;

    const usuarioNome =
      dados.usuarioNome ||
      usuario.nome ||
      usuario.email ||
      null;

    const ip =
      obterIp(req);

    const userAgent =
      req.headers?.['user-agent'] ||
      null;

    const dadosAnteriores =
      normalizarJson(dados.dadosAnteriores);

    const dadosNovos =
      normalizarJson(dados.dadosNovos);

    const { rows } = await pool.query(
      `
        INSERT INTO logs_auditoria (
          empresa_id,
          usuario_id,
          usuario_nome,
          acao,
          modulo,
          descricao,
          registro_id,
          ip,
          user_agent,
          dados_anteriores,
          dados_novos
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11
        )
        RETURNING *
      `,
      [
        empresaId,
        usuarioId,
        usuarioNome,
        acao,
        modulo,
        descricao,
        Number.isFinite(registroId)
          ? registroId
          : null,
        ip,
        userAgent,
        dadosAnteriores,
        dadosNovos
      ]
    );

    return rows[0] || null;

  } catch (erro) {
    /**
     * Auditoria nunca deve derrubar uma operação legítima.
     */
    console.error(
      '[AUDITORIA] Erro ao registrar log:',
      erro.message
    );

    return null;
  }
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
    return String(forwarded)
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
    JSON.stringify(valor);

    return valor;
  } catch (_) {
    return null;
  }
}


module.exports = {
  registrarAuditoria
};