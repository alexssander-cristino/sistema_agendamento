const express = require('express');

const pool = require('../db');

const autenticar =
  require('../middleware/auth');

const verificarAssinatura =
  require('../middleware/assinatura');

const router = express.Router();


// ============================================================
// MIDDLEWARES GLOBAIS
// ============================================================

router.use(autenticar);

router.use(verificarAssinatura);


// ============================================================
// PERMISSÃO
// ============================================================
//
// Apenas administrador da empresa pode consultar os logs.
//
// O empresa_id SEMPRE vem do usuário autenticado.
// Nunca confiamos em empresa_id enviado pela requisição.
// ============================================================

function verificarPermissaoLogs(
  req,
  res,
  next
) {

  try {

    if (
      !req.usuario ||
      !req.usuario.id
    ) {

      return res.status(401).json({
        erro:
          'Usuário não autenticado.'
      });

    }


    if (
      !req.usuario.empresa_id
    ) {

      return res.status(403).json({
        erro:
          'Usuário não está vinculado a uma empresa.'
      });

    }


    if (
      req.usuario.perfil ===
      'administrador'
    ) {

      return next();

    }


    return res.status(403).json({
      erro:
        'Apenas administradores podem acessar os logs de auditoria.'
    });

  } catch (err) {

    console.error(
      'Erro ao verificar permissão dos logs:',
      err
    );

    return res.status(500).json({
      erro:
        'Não foi possível verificar a permissão.'
    });

  }

}


router.use(
  verificarPermissaoLogs
);


// ============================================================
// HEADERS
// ============================================================

function aplicarHeadersLogs(res) {

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
// VALIDA DATA
// ============================================================

function validarData(
  valor
) {

  if (
    typeof valor !==
    'string'
  ) {

    return false;

  }

  return /^\d{4}-\d{2}-\d{2}$/
    .test(valor);

}


// ============================================================
// GET /api/logs
// ============================================================
//
// Filtros:
//
// ?pagina=1
// ?limite=50
// ?busca=alex
// ?acao=atualizacao
// ?entidade=empresa
// ?usuario_id=10
// ?data_inicio=2026-10-01
// ?data_fim=2026-10-08
//
// ============================================================

router.get(
  '/',
  async (req, res) => {

    aplicarHeadersLogs(res);


    const empresaId =
      req.usuario?.empresa_id;


    if (!empresaId) {

      return res.status(403).json({
        erro:
          'Empresa não identificada.'
      });

    }


    try {

      // ======================================================
      // PAGINAÇÃO
      // ======================================================

      let pagina =
        Number(
          req.query.pagina || 1
        );

      let limite =
        Number(
          req.query.limite || 50
        );


      if (
        !Number.isInteger(pagina) ||
        pagina < 1
      ) {

        pagina = 1;

      }


      if (
        !Number.isInteger(limite) ||
        limite < 1
      ) {

        limite = 50;

      }


      // Nunca permitir consultas gigantes.

      limite =
        Math.min(
          limite,
          100
        );


      const offset =
        (pagina - 1) *
        limite;


      // ======================================================
      // FILTROS
      // ======================================================

      const filtros = [
        'l.empresa_id = $1'
      ];

      const valores = [
        empresaId
      ];

      let parametro = 2;


      // ======================================================
      // BUSCA
      // ======================================================
      //
      // Pesquisa por:
      //
      // - nome do usuário
      // - ação
      // - entidade
      //
      // ======================================================

      if (
        req.query.busca
      ) {

        const busca =
          String(
            req.query.busca
          ).trim();


        if (busca) {

          filtros.push(`
            (
              COALESCE(u.nome, '') ILIKE $${parametro}
              OR COALESCE(l.acao, '') ILIKE $${parametro}
              OR COALESCE(l.entidade, '') ILIKE $${parametro}
            )
          `);

          valores.push(
            `%${busca}%`
          );

          parametro++;

        }

      }


      // ======================================================
      // AÇÃO
      // ======================================================

      if (
        req.query.acao
      ) {

        filtros.push(
          `l.acao = $${parametro}`
        );

        valores.push(
          String(
            req.query.acao
          ).trim()
        );

        parametro++;

      }


      // ======================================================
      // ENTIDADE
      // ======================================================

      if (
        req.query.entidade
      ) {

        filtros.push(
          `l.entidade = $${parametro}`
        );

        valores.push(
          String(
            req.query.entidade
          ).trim()
        );

        parametro++;

      }


      // ======================================================
      // USUÁRIO
      // ======================================================

      if (
        req.query.usuario_id
      ) {

        const usuarioId =
          Number(
            req.query.usuario_id
          );


        if (
          Number.isInteger(
            usuarioId
          ) &&
          usuarioId > 0
        ) {

          filtros.push(
            `l.usuario_id = $${parametro}`
          );

          valores.push(
            usuarioId
          );

          parametro++;

        }

      }


      // ======================================================
      // DATA INICIAL
      // ======================================================

      if (
        req.query.data_inicio
      ) {

        if (
          !validarData(
            req.query.data_inicio
          )
        ) {

          return res.status(400).json({
            erro:
              'Data inicial inválida.'
          });

        }


        filtros.push(
          `l.criado_em >= $${parametro}::date`
        );

        valores.push(
          req.query.data_inicio
        );

        parametro++;

      }


      // ======================================================
      // DATA FINAL
      // ======================================================

      if (
        req.query.data_fim
      ) {

        if (
          !validarData(
            req.query.data_fim
          )
        ) {

          return res.status(400).json({
            erro:
              'Data final inválida.'
          });

        }


        filtros.push(
          `l.criado_em < ($${parametro}::date + INTERVAL '1 day')`
        );

        valores.push(
          req.query.data_fim
        );

        parametro++;

      }


      const where =
        filtros.join(
          ' AND '
        );


      // ======================================================
      // TOTAL
      // ======================================================

      const resultadoTotal =
        await pool.query(
          `
            SELECT
              COUNT(*)::integer AS total

            FROM logs_auditoria l

            LEFT JOIN usuarios u
              ON u.id = l.usuario_id
             AND u.empresa_id = l.empresa_id

            WHERE ${where}
          `,
          valores
        );


      const total =
        resultadoTotal.rows[0]?.total ||
        0;


      // ======================================================
      // LOGS
      // ======================================================
      //
      // Agora retornamos também:
      //
      // usuario_nome
      //
      // para o frontend poder mostrar:
      //
      // "Alexssander"
      //
      // em vez de:
      //
      // "Usuário #6"
      //
      // ======================================================

      const valoresConsulta = [
        ...valores,
        limite,
        offset
      ];


      const {
        rows
      } =
        await pool.query(
          `
            SELECT
              l.id,
              l.usuario_id,

              COALESCE(
                NULLIF(
                  TRIM(u.nome),
                  ''
                ),
                'Usuário #' || l.usuario_id
              ) AS usuario_nome,

              l.acao,
              l.entidade,
              l.entidade_id,
              l.detalhes,
              l.criado_em

            FROM logs_auditoria l

            LEFT JOIN usuarios u
              ON u.id = l.usuario_id
             AND u.empresa_id = l.empresa_id

            WHERE ${where}

            ORDER BY
              l.criado_em DESC

            LIMIT $${parametro}

            OFFSET $${parametro + 1}
          `,
          valoresConsulta
        );


      // ======================================================
      // RESPOSTA
      // ======================================================

      return res.status(200).json({

        logs:
          rows,

        paginacao: {

          pagina,

          limite,

          total,

          total_paginas:
            Math.ceil(
              total / limite
            )

        }

      });

    } catch (err) {

      console.error(
        'Erro ao consultar logs:',
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
      // TABELA NÃO EXISTE
      // ======================================================

      if (
        err.code ===
        '42P01'
      ) {

        return res.status(500).json({
          erro:
            'A tabela de logs de auditoria ainda não foi criada no banco de dados.'
        });

      }


      return res.status(500).json({
        erro:
          'Não foi possível consultar os logs de auditoria.'
      });

    }

  }
);


// ============================================================
// EXPORTAÇÃO
// ============================================================

module.exports = router;