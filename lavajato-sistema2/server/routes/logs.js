const express = require('express');

const router = express.Router();

const pool = require('../db');

const {
  autenticar
} = require('../middleware/auth');

const {
  verificarAssinatura
} = require('../middleware/assinatura');


/**
 * ============================================================
 * ORVIX — LOGS DE AUDITORIA
 * ============================================================
 */

router.use(autenticar);
router.use(verificarAssinatura);


/**
 * ============================================================
 * PERMISSÃO
 * ============================================================
 *
 * Somente administrador da própria empresa.
 *
 * ============================================================
 */

function verificarAdministrador(req, res, next) {
  const usuario = req.usuario || {};

  if (
    usuario.perfil === 'administrador' ||
    usuario.perfil === 'dev'
  ) {
    return next();
  }

  return res.status(403).json({
    erro: 'Acesso negado.',
    mensagem:
      'Apenas administradores podem consultar os logs de auditoria.'
  });
}

router.use(verificarAdministrador);


/**
 * ============================================================
 * GET /api/logs
 * ============================================================
 *
 * Filtros:
 *
 * ?pagina=1
 * &limite=50
 * &modulo=clientes
 * &acao=CRIAR
 * &usuario_id=10
 * &data_inicio=2026-10-01
 * &data_fim=2026-10-08
 *
 * ============================================================
 */

router.get('/', async (req, res) => {
  const empresaId = req.usuario?.empresa_id;

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Empresa não identificada.'
    });
  }

  try {
    let pagina = Number(req.query.pagina || 1);
    let limite = Number(req.query.limite || 50);

    if (!Number.isInteger(pagina) || pagina < 1) {
      pagina = 1;
    }

    if (
      !Number.isInteger(limite) ||
      limite < 1
    ) {
      limite = 50;
    }

    /**
     * Limite máximo para evitar consultas exageradas.
     */
    limite = Math.min(limite, 100);

    const offset = (pagina - 1) * limite;

    const filtros = [
      'empresa_id = $1'
    ];

    const valores = [empresaId];

    let parametro = 2;


    /**
     * --------------------------------------------------------
     * MÓDULO
     * --------------------------------------------------------
     */

    if (req.query.modulo) {
      filtros.push(
        `modulo = $${parametro}`
      );

      valores.push(
        String(req.query.modulo).trim()
      );

      parametro++;
    }


    /**
     * --------------------------------------------------------
     * AÇÃO
     * --------------------------------------------------------
     */

    if (req.query.acao) {
      filtros.push(
        `acao = $${parametro}`
      );

      valores.push(
        String(req.query.acao).trim()
      );

      parametro++;
    }


    /**
     * --------------------------------------------------------
     * USUÁRIO
     * --------------------------------------------------------
     */

    if (req.query.usuario_id) {
      const usuarioId =
        Number(req.query.usuario_id);

      if (
        Number.isInteger(usuarioId) &&
        usuarioId > 0
      ) {
        filtros.push(
          `usuario_id = $${parametro}`
        );

        valores.push(usuarioId);

        parametro++;
      }
    }


    /**
     * --------------------------------------------------------
     * DATA INICIAL
     * --------------------------------------------------------
     */

    if (req.query.data_inicio) {
      filtros.push(
        `criado_em >= $${parametro}::date`
      );

      valores.push(
        String(req.query.data_inicio)
      );

      parametro++;
    }


    /**
     * --------------------------------------------------------
     * DATA FINAL
     * --------------------------------------------------------
     */

    if (req.query.data_fim) {
      filtros.push(
        `criado_em < ($${parametro}::date + INTERVAL '1 day')`
      );

      valores.push(
        String(req.query.data_fim)
      );

      parametro++;
    }


    const where =
      filtros.join(' AND ');


    /**
     * ========================================================
     * TOTAL
     * ========================================================
     */

    const resultadoTotal =
      await pool.query(
        `
          SELECT COUNT(*)::integer AS total
          FROM logs_auditoria
          WHERE ${where}
        `,
        valores
      );

    const total =
      resultadoTotal.rows[0]?.total || 0;


    /**
     * ========================================================
     * LOGS
     * ========================================================
     */

    const valoresConsulta = [
      ...valores,
      limite,
      offset
    ];

    const { rows } =
      await pool.query(
        `
          SELECT
            id,
            usuario_id,
            usuario_nome,
            acao,
            modulo,
            descricao,
            registro_id,
            ip,
            user_agent,
            dados_anteriores,
            dados_novos,
            criado_em
          FROM logs_auditoria
          WHERE ${where}
          ORDER BY criado_em DESC
          LIMIT $${parametro}
          OFFSET $${parametro + 1}
        `,
        valoresConsulta
      );


    return res.json({
      logs: rows,

      paginacao: {
        pagina,
        limite,
        total,
        total_paginas:
          Math.ceil(total / limite)
      }
    });

  } catch (erro) {
    console.error(
      'Erro ao consultar logs:',
      erro
    );

    return res.status(500).json({
      erro: 'Não foi possível consultar os logs.'
    });
  }
});


module.exports = router;