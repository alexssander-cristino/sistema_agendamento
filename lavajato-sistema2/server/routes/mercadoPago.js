const express = require('express');

const router = express.Router();

const pool = require('../db');

const autenticar =
  require('../middleware/auth');

const somenteDev =
  require('../middleware/dev');

const {
  mercadoPagoRequest,
  criarPlano,
  buscarPlano,
  criarAssinatura,
  buscarAssinatura,
  atualizarAssinatura,
  atualizarValorAssinatura,
  buscarPagamentoAutorizado
} = require('../services/mercadoPago');


// ============================================================
// AUTENTICAÇÃO
// ============================================================

router.use(autenticar);


// ============================================================
// CHAVE PÚBLICA
// GET /api/mercado-pago/public-key
//
// Pode ser usada pelo frontend.
// Nunca retorna o Access Token.
// ============================================================

router.get(
  '/public-key',
  (req, res) => {

    const publicKey =
      process.env.MERCADO_PAGO_PUBLIC_KEY;

    if (!publicKey) {
      return res.status(500).json({
        erro:
          'MERCADO_PAGO_PUBLIC_KEY não foi configurada.'
      });
    }

    return res.json({
      public_key:
        publicKey
    });
  }
);


// ============================================================
// CRIAR ASSINATURA
//
// IMPORTANTE:
// Esta rota NÃO é somente DEV.
//
// Usuário normal:
// empresa_id vem do token.
//
// DEV:
// empresa_id pode ser enviado no body
// para escolher qual empresa será testada.
// ============================================================

router.post(
  '/assinaturas',
  async (req, res) => {

    const {
      plano_id,
      email,
      nome,
      card_token_id,
      empresa_id
    } = req.body;


    if (
      !plano_id ||
      !email ||
      !card_token_id
    ) {
      return res.status(400).json({
        erro:
          'plano_id, email e card_token_id são obrigatórios.'
      });
    }


    // ========================================================
    // DEFINIR EMPRESA
    // ========================================================

    let empresaId =
      req.usuario.empresa_id;


    if (
      req.usuario.perfil === 'dev' &&
      empresa_id
    ) {
      empresaId =
        Number(empresa_id);
    }


    if (!empresaId) {
      return res.status(400).json({
        erro:
          'É necessário informar a empresa da assinatura.'
      });
    }


    if (
      !Number.isInteger(
        Number(empresaId)
      ) ||
      Number(empresaId) <= 0
    ) {
      return res.status(400).json({
        erro:
          'empresa_id inválido.'
      });
    }


    try {

      // ======================================================
      // BUSCAR EMPRESA
      // ======================================================

      const empresaResult =
        await pool.query(
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
            Number(empresaId)
          ]
        );


      if (
        empresaResult.rows.length === 0
      ) {
        return res.status(404).json({
          erro:
            'Empresa não encontrada.'
        });
      }


      const empresa =
        empresaResult.rows[0];


      if (!empresa.ativo) {
        return res.status(400).json({
          erro:
            'A empresa está desativada.'
        });
      }


      // ======================================================
      // BUSCAR PLANO
      // ======================================================

      const planoResult =
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
          [
            Number(plano_id)
          ]
        );


      if (
        planoResult.rows.length === 0
      ) {
        return res.status(404).json({
          erro:
            'Plano não encontrado.'
        });
      }


      const plano =
        planoResult.rows[0];


      if (!plano.ativo) {
        return res.status(400).json({
          erro:
            'Este plano está inativo.'
        });
      }


      if (
        !plano.mercado_pago_plan_id
      ) {
        return res.status(400).json({
          erro:
            'Este plano ainda não está integrado ao Mercado Pago.'
        });
      }


      // ======================================================
      // VERIFICAR ASSINATURA EXISTENTE
      // ======================================================

      const assinaturaExistente =
        await pool.query(
          `
            SELECT
              id,
              status,
              mercado_pago_id

            FROM assinaturas

            WHERE empresa_id = $1

              AND status IN (
                'pendente',
                'ativa',
                'pausada',
                'inadimplente'
              )

            ORDER BY id DESC

            LIMIT 1
          `,
          [
            Number(empresaId)
          ]
        );


      if (
        assinaturaExistente.rows.length > 0
      ) {

        const existente =
          assinaturaExistente.rows[0];

        return res.status(409).json({
          erro:
            'A empresa já possui uma assinatura em andamento.',

          assinatura: {
            id:
              existente.id,

            status:
              existente.status,

            mercado_pago_id:
              existente.mercado_pago_id
          }
        });
      }


      // ======================================================
      // CRIAR REGISTRO LOCAL
      // ======================================================

      const assinaturaLocal =
        await pool.query(
          `
            INSERT INTO assinaturas (
              empresa_id,
              plano_id,
              status,
              criado_em,
              atualizado_em
            )

            VALUES (
              $1,
              $2,
              'pendente',
              NOW(),
              NOW()
            )

            RETURNING
              id,
              empresa_id,
              plano_id,
              status,
              criado_em,
              atualizado_em
          `,
          [
            Number(empresaId),
            Number(plano_id)
          ]
        );


      const assinatura =
        assinaturaLocal.rows[0];


      try {

        // ====================================================
        // CRIAR ASSINATURA NO MERCADO PAGO
        // ====================================================

        const mercadoPagoAssinatura =
          await criarAssinatura({

            planoMercadoPagoId:
              plano.mercado_pago_plan_id,

            email:
              String(email).trim(),

            nome:
              nome ||
              plano.nome,

            cardTokenId:
              card_token_id,

            externalReference:
              String(
                assinatura.id
              ),

            backUrl:
              process.env.APP_URL
          });


        if (
          !mercadoPagoAssinatura ||
          !mercadoPagoAssinatura.id
        ) {

          throw new Error(
            'Mercado Pago não retornou o ID da assinatura.'
          );
        }


        // ====================================================
        // ATUALIZAR ASSINATURA LOCAL
        // ====================================================

        const proximaCobranca =
          mercadoPagoAssinatura
            ?.auto_recurring
            ?.next_payment_date ||
          mercadoPagoAssinatura
            ?.next_payment_date ||
          null;


        const inicio =
          mercadoPagoAssinatura
            ?.date_created ||
          new Date();


        const statusMercadoPago =
          String(
            mercadoPagoAssinatura.status ||
            ''
          ).toLowerCase();


        const statusLocal =
          statusMercadoPago ===
            'authorized'
            ? 'ativa'
            : 'pendente';


        const atualizada =
          await pool.query(
            `
              UPDATE assinaturas

              SET
                status = $1,
                mercado_pago_id = $2,
                inicio_em = $3,
                proxima_cobranca_em = $4,
                atualizado_em = NOW()

              WHERE id = $5

              RETURNING
                id,
                empresa_id,
                plano_id,
                status,
                mercado_pago_id,
                inicio_em,
                proxima_cobranca_em,
                cancelada_em,
                criado_em,
                atualizado_em
            `,
            [
              statusLocal,

              String(
                mercadoPagoAssinatura.id
              ),

              inicio,

              proximaCobranca,

              assinatura.id
            ]
          );


        return res.status(201).json({

          ok: true,

          mensagem:
            'Assinatura criada com sucesso.',

          assinatura:
            atualizada.rows[0],

          mercado_pago:
            mercadoPagoAssinatura
        });


      } catch (mercadoPagoError) {

        // ================================================
        // SE MERCADO PAGO FALHAR,
        // REMOVE A ASSINATURA LOCAL
        // ================================================

        await pool.query(
          `
            DELETE FROM assinaturas

            WHERE id = $1
          `,
          [
            assinatura.id
          ]
        );


        throw mercadoPagoError;
      }


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
// MINHA ASSINATURA
// GET /api/mercado-pago/minha-assinatura
//
// Usuários vinculados a uma empresa podem consultar
// a própria assinatura.
//
// Esta rota precisa ficar ANTES do somenteDev.
// ============================================================

router.get(
  '/minha-assinatura',
  async (req, res) => {

    const empresaId =
      req.usuario?.empresa_id;


    if (!empresaId) {
      return res.status(400).json({
        erro:
          'Usuário não está vinculado a uma empresa.'
      });
    }


    if (
      !Number.isInteger(
        Number(empresaId)
      ) ||
      Number(empresaId) <= 0
    ) {
      return res.status(400).json({
        erro:
          'Empresa do usuário é inválida.'
      });
    }


    try {

      const result =
        await pool.query(
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
              a.criado_em,
              a.atualizado_em,

              p.nome AS plano_nome,
              p.descricao AS plano_descricao,
              p.valor AS plano_valor,
              p.periodo AS plano_periodo,
              p.mercado_pago_plan_id

            FROM assinaturas a

            INNER JOIN planos p
              ON p.id = a.plano_id

            WHERE a.empresa_id = $1

            ORDER BY a.id DESC

            LIMIT 1
          `,
          [
            Number(empresaId)
          ]
        );


      // ======================================================
      // EMPRESA AINDA NÃO POSSUI ASSINATURA
      // ======================================================

      if (
        result.rows.length === 0
      ) {

        return res.json({

          ok: true,

          possui_assinatura:
            false,

          assinatura:
            null
        });
      }


      const assinatura =
        result.rows[0];


      // ======================================================
      // RETORNAR ASSINATURA
      // ======================================================

      return res.json({

        ok: true,

        possui_assinatura:
          true,

        assinatura: {

          id:
            assinatura.id,

          empresa_id:
            assinatura.empresa_id,

          plano_id:
            assinatura.plano_id,

          status:
            assinatura.status,

          mercado_pago_id:
            assinatura.mercado_pago_id,

          inicio_em:
            assinatura.inicio_em,

          proxima_cobranca_em:
            assinatura.proxima_cobranca_em,

          cancelada_em:
            assinatura.cancelada_em,

          criado_em:
            assinatura.criado_em,

          atualizado_em:
            assinatura.atualizado_em,

          plano: {

            id:
              assinatura.plano_id,

            nome:
              assinatura.plano_nome,

            descricao:
              assinatura.plano_descricao,

            valor:
              assinatura.plano_valor,

            periodo:
              assinatura.plano_periodo,

            mercado_pago_plan_id:
              assinatura.mercado_pago_plan_id
          }
        }
      });

    } catch (err) {

      console.error(
        'Erro ao consultar minha assinatura:',
        err
      );


      return res.status(500).json({

        erro:
          'Não foi possível consultar sua assinatura.',

        detalhes:
          process.env.NODE_ENV === 'production'
            ? null
            : err.message
      });
    }
  }
);

// ============================================================
// CANCELAR MINHA ASSINATURA
// POST /api/mercado-pago/minha-assinatura/cancelar
// ============================================================

router.post('/minha-assinatura/cancelar', async (req, res) => {
  const empresaId = Number(req.usuario?.empresa_id);

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    return res.status(400).json({
      erro: 'Usuário não está vinculado a uma empresa.'
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          mercado_pago_id,
          status
        FROM assinaturas
        WHERE empresa_id = $1
        ORDER BY id DESC
        LIMIT 1
      `,
      [empresaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        erro: 'Nenhuma assinatura foi encontrada.'
      });
    }

    const assinatura = result.rows[0];

    if (assinatura.status === 'cancelada') {
      return res.status(409).json({
        erro: 'Esta assinatura já está cancelada.'
      });
    }

    if (!assinatura.mercado_pago_id) {
      return res.status(409).json({
        erro: 'A assinatura não possui ID no Mercado Pago.'
      });
    }

    // Primeiro cancela no Mercado Pago.
    await atualizarAssinatura({
      mercadoPagoId: assinatura.mercado_pago_id,
      status: 'canceled'
    });

    // Só atualiza o banco depois da confirmação da API.
    const atualizada = await pool.query(
      `
        UPDATE assinaturas
        SET
          status = 'cancelada',
          cancelada_em = NOW(),
          atualizado_em = NOW()
        WHERE id = $1
          AND empresa_id = $2
        RETURNING
          id,
          status,
          mercado_pago_id,
          cancelada_em,
          atualizado_em
      `,
      [assinatura.id, empresaId]
    );

    return res.json({
      ok: true,
      mensagem: 'Assinatura cancelada no Mercado Pago.',
      assinatura: atualizada.rows[0]
    });
  } catch (err) {
    console.error('Erro ao cancelar assinatura:', err);

    return res.status(err.status || 500).json({
      erro: 'Não foi possível cancelar a assinatura.',
      detalhes:
        process.env.NODE_ENV === 'production'
          ? undefined
          : err.message
    });
  }
});

// ============================================================
// TROCAR PLANO DA MINHA ASSINATURA
// POST /api/mercado-pago/minha-assinatura/trocar-plano
// Body: { "plano_id": 2 }
// ============================================================

router.post(
  '/minha-assinatura/trocar-plano',
  async (req, res) => {
    const empresaId = Number(req.usuario?.empresa_id);
    const planoId = Number(req.body?.plano_id);

    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      return res.status(400).json({
        erro: 'Usuário não está vinculado a uma empresa.'
      });
    }

    if (!Number.isInteger(planoId) || planoId <= 0) {
      return res.status(400).json({
        erro: 'Selecione um plano válido.'
      });
    }

    try {
      const assinaturaResult = await pool.query(
        `
          SELECT
            id,
            empresa_id,
            plano_id,
            status,
            mercado_pago_id
          FROM assinaturas
          WHERE empresa_id = $1
          ORDER BY id DESC
          LIMIT 1
        `,
        [empresaId]
      );

      if (assinaturaResult.rows.length === 0) {
        return res.status(404).json({
          erro: 'Nenhuma assinatura foi encontrada.'
        });
      }

      const assinatura = assinaturaResult.rows[0];

      if (assinatura.status !== 'ativa') {
        return res.status(409).json({
          erro: 'Somente assinaturas ativas podem trocar de plano.'
        });
      }

      if (!assinatura.mercado_pago_id) {
        return res.status(409).json({
          erro: 'A assinatura não possui ID no Mercado Pago.'
        });
      }

      if (Number(assinatura.plano_id) === planoId) {
        return res.status(400).json({
          erro: 'Sua empresa já utiliza este plano.'
        });
      }

      const planoResult = await pool.query(
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

      if (planoResult.rows.length === 0) {
        return res.status(404).json({
          erro: 'Plano não encontrado.'
        });
      }

      const novoPlano = planoResult.rows[0];

      if (!novoPlano.ativo) {
        return res.status(400).json({
          erro: 'O plano selecionado está inativo.'
        });
      }

      if (!novoPlano.mercado_pago_plan_id) {
        return res.status(400).json({
          erro: 'O plano ainda não está integrado ao Mercado Pago.'
        });
      }

      const planoAtualResult = await pool.query(
        `
          SELECT id, nome, valor, periodo
          FROM planos
          WHERE id = $1
          LIMIT 1
        `,
        [assinatura.plano_id]
      );

      if (planoAtualResult.rows.length === 0) {
        return res.status(409).json({
          erro: 'Não foi possível identificar o plano atual.'
        });
      }

      const planoAtual = planoAtualResult.rows[0];

      // A frequência não será alterada implicitamente.
      if (planoAtual.periodo !== novoPlano.periodo) {
        return res.status(409).json({
          erro:
            'A troca direta exige a mesma periodicidade. Para mudar de mensal para anual, por exemplo, será necessário um fluxo de nova autorização de cobrança.',
          codigo: 'PERIODICIDADE_DIFERENTE'
        });
      }

      // Atualiza a cobrança recorrente no Mercado Pago.
      await atualizarValorAssinatura({
        mercadoPagoId: assinatura.mercado_pago_id,
        valor: novoPlano.valor
      });

      // Só altera o plano local depois da resposta positiva da API.
      const atualizada = await pool.query(
        `
          UPDATE assinaturas
          SET
            plano_id = $1,
            atualizado_em = NOW()
          WHERE id = $2
            AND empresa_id = $3
            AND status = 'ativa'
          RETURNING
            id,
            empresa_id,
            plano_id,
            status,
            mercado_pago_id,
            atualizado_em
        `,
        [planoId, assinatura.id, empresaId]
      );

      if (atualizada.rows.length === 0) {
        return res.status(409).json({
          erro:
            'A cobrança foi atualizada, mas a assinatura local mudou durante a operação. Entre em contato com o suporte para conferência.'
        });
      }

      return res.json({
        ok: true,
        mensagem: 'Plano e valor recorrente atualizados.',
        assinatura: {
          ...atualizada.rows[0],
          plano: {
            id: novoPlano.id,
            nome: novoPlano.nome,
            descricao: novoPlano.descricao,
            valor: novoPlano.valor,
            periodo: novoPlano.periodo
          }
        }
      });
    } catch (err) {
      console.error('Erro ao trocar plano:', err);

      return res.status(err.status || 500).json({
        erro: 'Não foi possível trocar o plano.',
        detalhes:
          process.env.NODE_ENV === 'production'
            ? undefined
            : err.message
      });
    }
  }
);


// ============================================================
// ROTAS EXCLUSIVAS DO DEV
// ============================================================

router.use(somenteDev);


// ============================================================
// TESTAR MERCADO PAGO
// GET /api/mercado-pago/teste
// ============================================================

router.get(
  '/teste',
  async (req, res) => {

    try {

      const resultado =
        await mercadoPagoRequest(
          '/v1/payment_methods',
          {
            method: 'GET'
          }
        );


      return res.json({

        ok: true,

        mercado_pago:
          'conectado',

        quantidade_metodos:
          Array.isArray(resultado)
            ? resultado.length
            : null
      });


    } catch (err) {

      console.error(
        'Erro no teste Mercado Pago:',
        err
      );


      return res.status(
        err.status || 500
      ).json({

        ok: false,

        erro:
          err.message ||
          'Erro ao conectar com o Mercado Pago.',

        detalhes:
          err.data || null
      });
    }
  }
);


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
        erro:
          'ID do plano inválido.'
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
          [
            planoId
          ]
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
        erro:
          'ID do plano inválido.'
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
          [
            planoId
          ]
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
// CONSULTAR ASSINATURA
// GET /api/mercado-pago/assinaturas/:id
// ============================================================

router.get(
  '/assinaturas/:id',
  async (req, res) => {

    try {

      const assinatura =
        await buscarAssinatura(
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
          err.message ||
          'Não foi possível consultar a assinatura.',

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
          err.message ||
          'Não foi possível consultar o pagamento.',

        detalhes:
          err.data || null
      });
    }
  }
);


// ============================================================
// EXPORTAR ROUTER
// ============================================================

module.exports = router;
