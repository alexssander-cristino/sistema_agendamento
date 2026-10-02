const pool = require('../db');

// ============================================================
// MIDDLEWARE - VERIFICAR ASSINATURA DA EMPRESA
// ============================================================

async function verificarAssinatura(req, res, next) {
  try {
    /*
     * ========================================================
     * DEV
     * ========================================================
     *
     * O DEV não pertence a uma empresa e não precisa
     * possuir assinatura.
     *
     * Ele possui acesso administrativo ao SaaS.
     */
    if (req.usuario?.perfil === 'dev') {
      return next();
    }

    /*
     * ========================================================
     * VERIFICAR USUÁRIO AUTENTICADO
     * ========================================================
     */

    if (!req.usuario) {
      return res.status(401).json({
        erro: 'Não autenticado.'
      });
    }

    /*
     * ========================================================
     * VERIFICAR EMPRESA
     * ========================================================
     */

    const empresaId =
      req.usuario.empresa_id;

    if (!empresaId) {
      return res.status(403).json({
        erro: 'Usuário não está vinculado a uma empresa.',
        codigo: 'EMPRESA_NAO_VINCULADA'
      });
    }

    /*
     * ========================================================
     * VERIFICAR SE A EMPRESA EXISTE E ESTÁ ATIVA
     * ========================================================
     */

    const empresaResult = await pool.query(
      `
      SELECT
        id,
        nome,
        ativo
      FROM empresas
      WHERE id = $1
      LIMIT 1
      `,
      [
        empresaId
      ]
    );

    if (empresaResult.rows.length === 0) {
      return res.status(403).json({
        erro: 'Empresa não encontrada.',
        codigo: 'EMPRESA_NAO_ENCONTRADA'
      });
    }

    const empresa =
      empresaResult.rows[0];

    /*
     * Empresa desativada não pode utilizar o sistema.
     */
    if (!empresa.ativo) {
      return res.status(403).json({
        erro: 'A empresa está desativada.',
        codigo: 'EMPRESA_DESATIVADA'
      });
    }

    /*
     * ========================================================
     * BUSCAR ASSINATURA DA EMPRESA
     * ========================================================
     *
     * Procuramos uma assinatura que ainda represente
     * o estado atual da empresa.
     *
     * Como existe um índice único impedindo múltiplas
     * assinaturas simultâneas nos estados:
     *
     * pendente
     * ativa
     * pausada
     * inadimplente
     *
     * podemos buscar a mais recente.
     */

    const assinaturaResult = await pool.query(
      `
      SELECT
        a.id,
        a.empresa_id,
        a.plano_id,
        a.status,
        a.mercado_pago_id,
        a.inicio_em,
        a.proxima_cobranca_em,
        a.cancelada_em,

        p.nome AS plano_nome,
        p.valor AS plano_valor,
        p.periodo AS plano_periodo

      FROM assinaturas a

      LEFT JOIN planos p
        ON p.id = a.plano_id

      WHERE a.empresa_id = $1

      ORDER BY a.id DESC

      LIMIT 1
      `,
      [
        empresaId
      ]
    );

    /*
     * ========================================================
     * EMPRESA SEM ASSINATURA
     * ========================================================
     */

    if (assinaturaResult.rows.length === 0) {
      return res.status(403).json({
        erro: 'A empresa não possui uma assinatura.',
        codigo: 'SEM_ASSINATURA',
        assinatura: null
      });
    }

    const assinatura =
      assinaturaResult.rows[0];

    /*
     * ========================================================
     * STATUS DA ASSINATURA
     * ========================================================
     */

    /*
     * PENDENTE
     *
     * A empresa iniciou o processo de assinatura,
     * mas o pagamento/ativação ainda não foi concluído.
     */
    if (assinatura.status === 'pendente') {
      return res.status(403).json({
        erro: 'A assinatura está pendente de pagamento.',
        codigo: 'ASSINATURA_PENDENTE',

        assinatura: {
          id: assinatura.id,
          plano_id: assinatura.plano_id,
          plano_nome: assinatura.plano_nome,
          status: assinatura.status,
          mercado_pago_id:
            assinatura.mercado_pago_id
        }
      });
    }

    /*
     * PAUSADA
     */
    if (assinatura.status === 'pausada') {
      return res.status(403).json({
        erro: 'A assinatura está pausada.',
        codigo: 'ASSINATURA_PAUSADA',

        assinatura: {
          id: assinatura.id,
          plano_id: assinatura.plano_id,
          plano_nome: assinatura.plano_nome,
          status: assinatura.status
        }
      });
    }

    /*
     * INADIMPLENTE
     *
     * O pagamento não foi realizado ou houve algum
     * problema com a cobrança.
     */
    if (assinatura.status === 'inadimplente') {
      return res.status(403).json({
        erro: 'A assinatura está inadimplente.',
        codigo: 'ASSINATURA_INADIMPLENTE',

        assinatura: {
          id: assinatura.id,
          plano_id: assinatura.plano_id,
          plano_nome: assinatura.plano_nome,
          status: assinatura.status,
          proxima_cobranca_em:
            assinatura.proxima_cobranca_em
        }
      });
    }

    /*
     * CANCELADA
     */
    if (assinatura.status === 'cancelada') {
      return res.status(403).json({
        erro: 'A assinatura está cancelada.',
        codigo: 'ASSINATURA_CANCELADA',

        assinatura: {
          id: assinatura.id,
          plano_id: assinatura.plano_id,
          plano_nome: assinatura.plano_nome,
          status: assinatura.status,
          cancelada_em:
            assinatura.cancelada_em
        }
      });
    }

    /*
     * ========================================================
     * ASSINATURA ATIVA
     * ========================================================
     */

    if (assinatura.status === 'ativa') {
      /*
       * Se existir uma data de próxima cobrança
       * e ela já passou, a assinatura não deve
       * continuar liberando o sistema.
       *
       * Nesse momento não alteramos o status no banco.
       *
       * O webhook do Mercado Pago será responsável
       * por manter o status sincronizado.
       *
       * Aqui fazemos uma proteção adicional para impedir
       * acesso caso a data já tenha vencido.
       */

      if (
        assinatura.proxima_cobranca_em &&
        new Date(
          assinatura.proxima_cobranca_em
        ).getTime() <= Date.now()
      ) {
        return res.status(403).json({
          erro: 'A assinatura está vencida.',
          codigo: 'ASSINATURA_VENCIDA',

          assinatura: {
            id: assinatura.id,
            plano_id: assinatura.plano_id,
            plano_nome: assinatura.plano_nome,
            status: assinatura.status,
            proxima_cobranca_em:
              assinatura.proxima_cobranca_em
          }
        });
      }

      /*
       * ======================================================
       * ASSINATURA LIBERADA
       * ======================================================
       */

      req.assinatura = {
        id: assinatura.id,
        empresa_id: assinatura.empresa_id,
        plano_id: assinatura.plano_id,
        plano_nome: assinatura.plano_nome,
        plano_valor: assinatura.plano_valor,
        plano_periodo: assinatura.plano_periodo,
        status: assinatura.status,
        mercado_pago_id:
          assinatura.mercado_pago_id,
        inicio_em:
          assinatura.inicio_em,
        proxima_cobranca_em:
          assinatura.proxima_cobranca_em,
        cancelada_em:
          assinatura.cancelada_em
      };

      return next();
    }

    /*
     * ========================================================
     * STATUS DESCONHECIDO
     * ========================================================
     */

    console.error(
      'Status de assinatura desconhecido:',
      assinatura.status,
      'Empresa:',
      empresaId
    );

    return res.status(403).json({
      erro: 'O status da assinatura é inválido.',
      codigo: 'STATUS_ASSINATURA_INVALIDO'
    });

  } catch (err) {
    console.error(
      'Erro ao verificar assinatura:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível verificar a assinatura.'
    });
  }
}

module.exports = verificarAssinatura;