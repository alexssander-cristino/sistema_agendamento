const express = require('express');

const router = express.Router();

const pool = require('../db');

const autenticar = require('../middleware/auth');

const somenteDev = require('../middleware/dev');

const {
  mercadoPagoRequest,
  criarPlano,
  buscarPlano,
  criarAssinatura,
  buscarAssinatura,
  buscarPagamentoAutorizado
} = require('../services/mercadoPago');


// ============================================================
// AUTENTICAÇÃO
// ============================================================

router.use(autenticar);

router.use(somenteDev);


// ============================================================
// TESTAR MERCADO PAGO
// GET /api/mercado-pago/teste
// ============================================================
router.get('/teste', async (req, res) => {
  try {
    const resultado = await mercadoPagoRequest(
      '/v1/payment_methods',
      {
        method: 'GET'
      }
    );

    res.json({
      ok: true,
      mercado_pago: 'conectado',
      quantidade_metodos: Array.isArray(resultado)
        ? resultado.length
        : null
    });

  } catch (err) {
    console.error(
      'Erro no teste Mercado Pago:',
      err
    );

    res.status(err.status || 500).json({
      ok: false,
      erro: err.message
    });
  }
});


// ============================================================
// CRIAR PLANO NO MERCADO PAGO
// POST /api/mercado-pago/planos/:id/criar
// ============================================================

router.post(
  '/planos/:id/criar',
  async (req, res) => {

    const planoId =
      Number(req.params.id);

    if (
      !Number.isInteger(planoId) ||
      planoId <= 0
    ) {
      return res.status(400).json({
        erro: 'ID do plano inválido.'
      });
    }

    try {

      const result =
        await pool.query(
          `
            SELECT
              id,
              nome,
              descricao,
              valor,
              periodo,
              ativo,
              mercado_pago_plan_id

            FROM planos

            WHERE id = $1

            LIMIT 1
          `,
          [planoId]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          erro: 'Plano não encontrado.'
        });
      }

      const plano =
        result.rows[0];


      if (
        plano.mercado_pago_plan_id
      ) {
        return res.status(409).json({
          erro:
            'Este plano já está vinculado ao Mercado Pago.',

          mercado_pago_plan_id:
            plano.mercado_pago_plan_id
        });
      }


      if (!plano.ativo) {
        return res.status(400).json({
          erro:
            'Não é possível criar um plano inativo.'
        });
      }


      const mercadoPagoPlano =
        await criarPlano({
          nome:
            plano.nome,

          descricao:
            plano.descricao,

          valor:
            plano.valor,

          periodo:
            plano.periodo,

          backUrl:
            process.env.APP_URL
        });


      if (
        !mercadoPagoPlano ||
        !mercadoPagoPlano.id
      ) {
        return res.status(502).json({
          erro:
            'Mercado Pago não retornou o ID do plano.',

          resposta:
            mercadoPagoPlano
        });
      }


      await pool.query(
        `
          UPDATE planos

          SET
            mercado_pago_plan_id = $1,
            atualizado_em = NOW()

          WHERE id = $2
        `,
        [
          String(
            mercadoPagoPlano.id
          ),

          planoId
        ]
      );


      return res.status(201).json({

        ok: true,

        mensagem:
          'Plano criado no Mercado Pago.',

        plano: {

          id:
            plano.id,

          nome:
            plano.nome,

          mercado_pago_plan_id:
            mercadoPagoPlano.id

        },

        mercado_pago:
          mercadoPagoPlano

      });

    } catch (err) {

      console.error(
        'Erro ao criar plano no Mercado Pago:',
        err
      );

      return res.status(
        err.status || 500
      ).json({

        erro:
          err.message ||
          'Não foi possível criar o plano no Mercado Pago.',

        detalhes:
          err.data || null

      });
    }
  }
);


// ============================================================
// CONSULTAR PLANO
// GET /api/mercado-pago/planos/:id
// ============================================================

router.get(
  '/planos/:id',
  async (req, res) => {

    const planoId =
      Number(req.params.id);

    if (
      !Number.isInteger(planoId) ||
      planoId <= 0
    ) {
      return res.status(400).json({
        erro: 'ID do plano inválido.'
      });
    }

    try {

      const result =
        await pool.query(
          `
            SELECT
              id,
              nome,
              mercado_pago_plan_id

            FROM planos

            WHERE id = $1

            LIMIT 1
          `,
          [planoId]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          erro:
            'Plano não encontrado.'
        });
      }

      const plano =
        result.rows[0];


      if (
        !plano.mercado_pago_plan_id
      ) {
        return res.status(400).json({
          erro:
            'Este plano ainda não foi criado no Mercado Pago.'
        });
      }


      const mercadoPagoPlano =
        await buscarPlano(
          plano.mercado_pago_plan_id
        );


      return res.json({

        ok: true,

        plano: {

          id:
            plano.id,

          nome:
            plano.nome,

          mercado_pago_plan_id:
            plano.mercado_pago_plan_id

        },

        mercado_pago:
          mercadoPagoPlano

      });

    } catch (err) {

      console.error(
        'Erro ao consultar plano no Mercado Pago:',
        err
      );

      return res.status(
        err.status || 500
      ).json({

        erro:
          err.message ||
          'Não foi possível consultar o plano.',

        detalhes:
          err.data || null

      });
    }
  }
);


// ============================================================
// CRIAR ASSINATURA
// POST /api/mercado-pago/assinaturas
// ============================================================

router.post(
  '/assinaturas',
  async (req, res) => {

    const {
      plano_id,
      email,
      nome
    } = req.body;


    if (
      !plano_id ||
      !email
    ) {
      return res.status(400).json({
        erro:
          'plano_id e email são obrigatórios.'
      });
    }


    try {

      const result =
        await pool.query(
          `
            SELECT
              id,
              nome,
              mercado_pago_plan_id

            FROM planos

            WHERE id = $1

            LIMIT 1
          `,
          [Number(plano_id)]
        );


      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          erro:
            'Plano não encontrado.'
        });
      }


      const plano =
        result.rows[0];


      if (
        !plano.mercado_pago_plan_id
      ) {
        return res.status(400).json({
          erro:
            'O plano ainda não possui integração com o Mercado Pago.'
        });
      }


      const assinatura =
        await criarAssinatura({

          planoMercadoPagoId:
            plano.mercado_pago_plan_id,

          email,

          nome:
            nome ||
            plano.nome,

          backUrl:
            process.env.APP_URL

        });


      return res.status(201).json({

        ok: true,

        mensagem:
          'Assinatura criada no Mercado Pago.',

        assinatura:
          assinatura

      });

    } catch (err) {

      console.error(
        'Erro ao criar assinatura:',
        err
      );

      return res.status(
        err.status || 500
      ).json({

        erro:
          err.message ||
          'Não foi possível criar a assinatura.',

        detalhes:
          err.data || null

      });
    }
  }
);


// ============================================================
// CONSULTAR ASSINATURA
// GET /api/mercado-pago/assinaturas/:id
// ============================================================

router.get(
  '/assinaturas/:id',
  async (req, res) => {

    try {

      const assinatura =
        await require(
          '../services/mercadoPago'
        ).buscarAssinatura(
          req.params.id
        );


      return res.json({

        ok: true,

        assinatura

      });

    } catch (err) {

      console.error(
        'Erro ao consultar assinatura:',
        err
      );

      return res.status(
        err.status || 500
      ).json({

        erro:
          err.message,

        detalhes:
          err.data || null

      });
    }
  }
);


// ============================================================
// CONSULTAR PAGAMENTO AUTORIZADO
// GET /api/mercado-pago/pagamentos/:id
// ============================================================

router.get(
  '/pagamentos/:id',
  async (req, res) => {

    try {

      const pagamento =
        await buscarPagamentoAutorizado(
          req.params.id
        );


      return res.json({

        ok: true,

        pagamento

      });

    } catch (err) {

      console.error(
        'Erro ao consultar pagamento:',
        err
      );

      return res.status(
        err.status || 500
      ).json({

        erro:
          err.message,

        detalhes:
          err.data || null

      });
    }
  }
);


module.exports = router;
