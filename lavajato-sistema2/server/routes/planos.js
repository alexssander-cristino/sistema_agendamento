const express = require('express');

const pool = require('../db');

const autenticar = require('../middleware/auth');
const somenteDev = require('../middleware/dev');

const {
  criarPlano,
  buscarPlano,
  atualizarPlano
} = require('../services/mercadoPago');

const router = express.Router();

// ============================================================
// AUTENTICAÇÃO
// ============================================================

router.use(autenticar);

// ============================================================
// PLANOS DISPONÍVEIS PARA EMPRESAS
// ============================================================

router.get('/disponiveis', async (req, res) => {
  try {
    // DEV não utiliza a tela de assinatura.
    if (req.usuario.perfil === 'dev') {
      return res.status(403).json({
        erro: 'A tela de assinatura é destinada às empresas.'
      });
    }

    if (!req.usuario.empresa_id) {
      return res.status(403).json({
        erro: 'Usuário não está vinculado a uma empresa.'
      });
    }

    const { rows } = await pool.query(`
      SELECT
        id,
        nome,
        descricao,
        valor,
        periodo
      FROM planos
      WHERE ativo = true
      ORDER BY valor ASC, id ASC
    `);

    return res.json(rows);

  } catch (err) {
    console.error(
      'Erro ao listar planos disponíveis:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível listar os planos disponíveis.'
    });
  }
});

// ============================================================
// PROTEÇÃO DAS ROTAS ADMINISTRATIVAS
// ============================================================

router.use(somenteDev);

// ============================================================
// LISTAR TODOS OS PLANOS
// ============================================================

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        nome,
        descricao,
        valor,
        periodo,
        ativo,
        mercado_pago_plan_id,
        criado_em,
        atualizado_em
      FROM planos
      ORDER BY id DESC
    `);

    return res.json(rows);

  } catch (err) {
    console.error(
      'Erro ao listar planos:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível listar os planos.'
    });
  }
});

// ============================================================
// BUSCAR PLANO
// ============================================================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `
      SELECT
        id,
        nome,
        descricao,
        valor,
        periodo,
        ativo,
        mercado_pago_plan_id,
        criado_em,
        atualizado_em
      FROM planos
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Plano não encontrado.'
      });
    }

    return res.json(rows[0]);

  } catch (err) {
    console.error(
      'Erro ao buscar plano:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível buscar o plano.'
    });
  }
});

// ============================================================
// CRIAR PLANO
//
// 1. Cria no PostgreSQL
// 2. Cria automaticamente no Mercado Pago
// 3. Salva o mercado_pago_plan_id
// ============================================================

router.post('/', async (req, res) => {
  let planoCriado = null;

  try {
    const {
      nome,
      descricao,
      valor,
      periodo
    } = req.body;

    // ========================================================
    // VALIDAR NOME
    // ========================================================

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({
        erro: 'Informe o nome do plano.'
      });
    }

    // ========================================================
    // VALIDAR VALOR
    // ========================================================

    if (
      valor === undefined ||
      valor === null ||
      valor === ''
    ) {
      return res.status(400).json({
        erro: 'Informe o valor do plano.'
      });
    }

    const valorNumerico =
      Number(valor);

    if (
      !Number.isFinite(valorNumerico) ||
      valorNumerico <= 0
    ) {
      return res.status(400).json({
        erro:
          'Informe um valor válido maior que zero.'
      });
    }

    // ========================================================
    // VALIDAR PERÍODO
    // ========================================================

    const periodoFinal =
      periodo || 'mensal';

    if (
      ![
        'mensal',
        'trimestral',
        'semestral',
        'anual'
      ].includes(periodoFinal)
    ) {
      return res.status(400).json({
        erro: 'Período inválido.'
      });
    }

    // ========================================================
    // CRIAR PLANO LOCAL
    // ========================================================

    const { rows } =
      await pool.query(
        `
        INSERT INTO planos (
          nome,
          descricao,
          valor,
          periodo
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
          id,
          nome,
          descricao,
          valor,
          periodo,
          ativo,
          mercado_pago_plan_id,
          criado_em,
          atualizado_em
        `,
        [
          String(nome).trim(),

          descricao
            ? String(descricao).trim()
            : null,

          valorNumerico,

          periodoFinal
        ]
      );

    planoCriado =
      rows[0];

    // ========================================================
    // CRIAR PLANO NO MERCADO PAGO
    // ========================================================

    let mercadoPagoPlano;

    try {
      mercadoPagoPlano =
        await criarPlano({
          nome:
            planoCriado.nome,

          descricao:
            planoCriado.descricao,

          valor:
            Number(planoCriado.valor),

          periodo:
            planoCriado.periodo,

          backUrl:
            process.env.APP_URL
        });

    } catch (mercadoPagoError) {
      console.error(
        'Erro ao criar plano no Mercado Pago:',
        mercadoPagoError
      );

      // ======================================================
      // DESFAZER PLANO LOCAL
      // ======================================================

      try {
        await pool.query(
          `
          DELETE FROM planos
          WHERE id = $1
          `,
          [planoCriado.id]
        );
      } catch (deleteError) {
        console.error(
          'Erro ao desfazer plano após falha no Mercado Pago:',
          deleteError
        );
      }

      return res.status(
        mercadoPagoError.status || 502
      ).json({
        erro:
          mercadoPagoError.message ||
          'Não foi possível criar o plano no Mercado Pago.',

        detalhes:
          mercadoPagoError.data || null
      });
    }

    // ========================================================
    // VALIDAR RESPOSTA DO MERCADO PAGO
    // ========================================================

    if (
      !mercadoPagoPlano ||
      !mercadoPagoPlano.id
    ) {
      console.error(
        'Mercado Pago não retornou ID do plano:',
        mercadoPagoPlano
      );

      try {
        await pool.query(
          `
          DELETE FROM planos
          WHERE id = $1
          `,
          [planoCriado.id]
        );
      } catch (deleteError) {
        console.error(
          'Erro ao desfazer plano local:',
          deleteError
        );
      }

      return res.status(502).json({
        erro:
          'Mercado Pago não retornou o ID do plano.',

        resposta:
          mercadoPagoPlano || null
      });
    }

    // ========================================================
    // SALVAR ID DO MERCADO PAGO
    // ========================================================

    const planoAtualizado =
      await pool.query(
        `
        UPDATE planos

        SET
          mercado_pago_plan_id = $1,
          atualizado_em = NOW()

        WHERE id = $2

        RETURNING
          id,
          nome,
          descricao,
          valor,
          periodo,
          ativo,
          mercado_pago_plan_id,
          criado_em,
          atualizado_em
        `,
        [
          String(
            mercadoPagoPlano.id
          ),

          planoCriado.id
        ]
      );

    // ========================================================
    // RESPOSTA
    // ========================================================

    return res.status(201).json({
      ok: true,

      mensagem:
        'Plano criado no Orvix e no Mercado Pago com sucesso.',

      plano:
        planoAtualizado.rows[0],

      mercado_pago: {
        id:
          mercadoPagoPlano.id,

        init_point:
          mercadoPagoPlano.init_point || null,

        status:
          mercadoPagoPlano.status || null
      }
    });

  } catch (err) {
    console.error(
      'Erro ao criar plano:',
      err
    );

    // ========================================================
    // TENTAR LIMPAR PLANO LOCAL
    // ========================================================

    if (
      planoCriado &&
      planoCriado.id
    ) {
      try {
        await pool.query(
          `
          DELETE FROM planos
          WHERE id = $1
          `,
          [planoCriado.id]
        );
      } catch (deleteError) {
        console.error(
          'Erro ao desfazer plano após falha:',
          deleteError
        );
      }
    }

    return res.status(
      err.status || 500
    ).json({
      erro:
        err.message ||
        'Não foi possível criar o plano.'
    });
  }
});

// ============================================================
// EDITAR PLANO
//
// 1. Busca o plano atual
// 2. Valida os novos dados
// 3. Atualiza o plano no Mercado Pago
// 4. Se o Mercado Pago confirmar, atualiza o PostgreSQL
//
// Dessa forma, evitamos deixar o Orvix diferente do Mercado Pago.
// ============================================================

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const {
      nome,
      descricao,
      valor,
      periodo
    } = req.body;

    // ========================================================
    // VALIDAR ID
    // ========================================================

    const planoId =
      Number(id);

    if (
      !Number.isInteger(planoId) ||
      planoId <= 0
    ) {
      return res.status(400).json({
        erro: 'ID do plano inválido.'
      });
    }

    // ========================================================
    // BUSCAR PLANO ATUAL
    // ========================================================

    const planoAtualResult =
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
      planoAtualResult.rows.length === 0
    ) {
      return res.status(404).json({
        erro: 'Plano não encontrado.'
      });
    }

    const planoAtual =
      planoAtualResult.rows[0];

    // ========================================================
    // VALIDAR NOME
    // ========================================================

    if (
      !nome ||
      !String(nome).trim()
    ) {
      return res.status(400).json({
        erro: 'Informe o nome do plano.'
      });
    }

    // ========================================================
    // VALIDAR VALOR
    // ========================================================

    if (
      valor === undefined ||
      valor === null ||
      valor === ''
    ) {
      return res.status(400).json({
        erro: 'Informe o valor do plano.'
      });
    }

    const valorNumerico =
      Number(valor);

    if (
      !Number.isFinite(valorNumerico) ||
      valorNumerico <= 0
    ) {
      return res.status(400).json({
        erro:
          'Informe um valor válido maior que zero.'
      });
    }

    // ========================================================
    // VALIDAR PERÍODO
    // ========================================================

    const periodoFinal =
      periodo || 'mensal';

    if (
      ![
        'mensal',
        'trimestral',
        'semestral',
        'anual'
      ].includes(periodoFinal)
    ) {
      return res.status(400).json({
        erro: 'Período inválido.'
      });
    }

    // ========================================================
    // ATUALIZAR MERCADO PAGO
    // ========================================================

    let mercadoPagoPlano = null;

    if (
      planoAtual.mercado_pago_plan_id
    ) {
      try {
        mercadoPagoPlano =
          await atualizarPlano({
            mercadoPagoPlanId:
              planoAtual.mercado_pago_plan_id,

            nome:
              String(nome).trim(),

            descricao:
              descricao
                ? String(descricao).trim()
                : null,

            valor:
              valorNumerico,

            periodo:
              periodoFinal,

            backUrl:
              process.env.APP_URL
          });

      } catch (mercadoPagoError) {
        console.error(
          'Erro ao atualizar plano no Mercado Pago:',
          mercadoPagoError
        );

        return res.status(
          mercadoPagoError.status || 502
        ).json({
          erro:
            mercadoPagoError.message ||
            'Não foi possível atualizar o plano no Mercado Pago.',

          detalhes:
            mercadoPagoError.data || null
        });
      }

      // ======================================================
      // VALIDAR RESPOSTA
      // ======================================================

      if (
        !mercadoPagoPlano ||
        !mercadoPagoPlano.id
      ) {
        console.error(
          'Mercado Pago não retornou o plano atualizado:',
          mercadoPagoPlano
        );

        return res.status(502).json({
          erro:
            'Mercado Pago não retornou o plano atualizado.',

          resposta:
            mercadoPagoPlano || null
        });
      }
    }

    // ========================================================
    // ATUALIZAR PLANO NO POSTGRESQL
    // ========================================================

    const { rows } =
      await pool.query(
        `
        UPDATE planos

        SET
          nome = $1,
          descricao = $2,
          valor = $3,
          periodo = $4,
          atualizado_em = NOW()

        WHERE id = $5

        RETURNING
          id,
          nome,
          descricao,
          valor,
          periodo,
          ativo,
          mercado_pago_plan_id,
          criado_em,
          atualizado_em
        `,
        [
          String(nome).trim(),

          descricao
            ? String(descricao).trim()
            : null,

          valorNumerico,

          periodoFinal,

          planoId
        ]
      );

    const planoAtualizado =
      rows[0];

    // ========================================================
    // RESPOSTA
    // ========================================================

    return res.json({
      ok: true,

      mensagem:
        planoAtual.mercado_pago_plan_id
          ? 'Plano atualizado no Orvix e no Mercado Pago com sucesso.'
          : 'Plano atualizado no Orvix com sucesso.',

      plano:
        planoAtualizado,

      mercado_pago:
        mercadoPagoPlano
          ? {
              id:
                mercadoPagoPlano.id,

              status:
                mercadoPagoPlano.status || null,

              init_point:
                mercadoPagoPlano.init_point || null
            }
          : null
    });

  } catch (err) {
    console.error(
      'Erro ao editar plano:',
      err
    );

    return res.status(
      err.status || 500
    ).json({
      erro:
        err.message ||
        'Não foi possível editar o plano.'
    });
  }
});

// ============================================================
// ATIVAR / DESATIVAR
// ============================================================

router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    const { ativo } =
      req.body;

    if (
      typeof ativo !== 'boolean'
    ) {
      return res.status(400).json({
        erro:
          'O campo ativo deve ser verdadeiro ou falso.'
      });
    }

    const { rows } =
      await pool.query(
        `
        UPDATE planos

        SET
          ativo = $1,
          atualizado_em = NOW()

        WHERE id = $2

        RETURNING
          id,
          nome,
          descricao,
          valor,
          periodo,
          ativo,
          mercado_pago_plan_id,
          criado_em,
          atualizado_em
        `,
        [
          ativo,
          id
        ]
      );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Plano não encontrado.'
      });
    }

    return res.json(rows[0]);

  } catch (err) {
    console.error(
      'Erro ao alterar status do plano:',
      err
    );

    return res.status(500).json({
      erro:
        'Não foi possível alterar o status do plano.'
    });
  }
});

// ============================================================
// EXCLUIR PLANO
// ============================================================

router.delete('/:id', async (req, res) => {
  try {
    const { id } =
      req.params;

    // ========================================================
    // VERIFICAR ASSINATURAS
    // ========================================================

    const {
      rows: assinaturas
    } =
      await pool.query(
        `
        SELECT
          id
        FROM assinaturas
        WHERE plano_id = $1
        LIMIT 1
        `,
        [id]
      );

    if (
      assinaturas.length > 0
    ) {
      return res.status(409).json({
        erro:
          'Este plano possui assinaturas e não pode ser excluído. Desative o plano em vez disso.'
      });
    }

    // ========================================================
    // BUSCAR PLANO
    // ========================================================

    const planoResult =
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
        [id]
      );

    if (
      planoResult.rows.length === 0
    ) {
      return res.status(404).json({
        erro: 'Plano não encontrado.'
      });
    }

    const plano =
      planoResult.rows[0];

    // ========================================================
    // EXCLUIR PLANO LOCAL
    //
    // O plano do Mercado Pago não é excluído automaticamente.
    // ========================================================

    const { rows } =
      await pool.query(
        `
        DELETE FROM planos

        WHERE id = $1

        RETURNING id
        `,
        [id]
      );

    if (
      rows.length === 0
    ) {
      return res.status(404).json({
        erro: 'Plano não encontrado.'
      });
    }

    return res.json({
      ok: true,

      mensagem:
        'Plano excluído do Orvix com sucesso.',

      mercado_pago:
        plano.mercado_pago_plan_id
          ? {
              aviso:
                'O plano correspondente no Mercado Pago permanece existente.'
            }
          : null
    });

  } catch (err) {
    console.error(
      'Erro ao excluir plano:',
      err
    );

    return res.status(500).json({
      erro:
        'Não foi possível excluir o plano.'
    });
  }
});

// ============================================================
// SINCRONIZAR / CRIAR PLANO MANUALMENTE NO MERCADO PAGO
//
// POST /api/planos/:id/mercado-pago
//
// Mantida para planos antigos que foram criados antes da
// criação automática no Mercado Pago.
// ============================================================

router.post(
  '/:id/mercado-pago',
  async (req, res) => {
    try {
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

      // ======================================================
      // JÁ POSSUI VÍNCULO
      // ======================================================

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

      // ======================================================
      // PLANO PRECISA ESTAR ATIVO
      // ======================================================

      if (!plano.ativo) {
        return res.status(400).json({
          erro:
            'Não é possível criar um plano inativo.'
        });
      }

      // ======================================================
      // CRIAR NO MERCADO PAGO
      // ======================================================

      const mercadoPagoPlano =
        await criarPlano({
          nome:
            plano.nome,

          descricao:
            plano.descricao,

          valor:
            Number(plano.valor),

          periodo:
            plano.periodo,

          backUrl:
            process.env.APP_URL
        });

      // ======================================================
      // VALIDAR RESPOSTA
      // ======================================================

      if (
        !mercadoPagoPlano ||
        !mercadoPagoPlano.id
      ) {
        return res.status(502).json({
          erro:
            'Mercado Pago não retornou o ID do plano.',

          resposta:
            mercadoPagoPlano || null
        });
      }

      // ======================================================
      // SALVAR ID
      // ======================================================

      const atualizado =
        await pool.query(
          `
          UPDATE planos

          SET
            mercado_pago_plan_id = $1,
            atualizado_em = NOW()

          WHERE id = $2

          RETURNING
            id,
            nome,
            descricao,
            valor,
            periodo,
            ativo,
            mercado_pago_plan_id,
            criado_em,
            atualizado_em
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
          'Plano criado no Mercado Pago com sucesso.',

        plano:
          atualizado.rows[0],

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
// CONSULTAR PLANO NO MERCADO PAGO
//
// GET /api/planos/:id/mercado-pago
// ============================================================

router.get(
  '/:id/mercado-pago',
  async (req, res) => {
    try {
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
          erro: 'Plano não encontrado.'
        });
      }

      const plano =
        result.rows[0];

      if (
        !plano.mercado_pago_plan_id
      ) {
        return res.status(400).json({
          erro:
            'Este plano ainda não está vinculado ao Mercado Pago.'
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
          'Não foi possível consultar o plano no Mercado Pago.',

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