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
  atualizarAssinatura,
  atualizarValorAssinatura,
  buscarPagamentoAutorizado
} = require('../services/mercadoPago');

router.use(autenticar);

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function numeroPositivo(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0;
}

function erroDetalhes(err) {
  return process.env.NODE_ENV === 'production'
    ? undefined
    : err?.message;
}

/**
 * Obtém e valida a URL pública para retorno do Mercado Pago.
 *
 * Variáveis aceitas:
 * APP_URL
 * FRONTEND_URL
 * CLIENT_URL
 *
 * Configure apenas uma delas com a URL pública real do Orvix.
 * Se informar um caminho, como /assinaturas.html, ele será mantido.
 */
function obterUrlAplicacao() {
  const valor =
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL;

  if (!valor || !String(valor).trim()) {
    throw new Error(
      'URL pública não configurada. Defina APP_URL, FRONTEND_URL ou CLIENT_URL nas variáveis de ambiente do servidor.'
    );
  }

  let url;

  try {
    url = new URL(String(valor).trim());
  } catch {
    throw new Error(
      'A URL pública configurada é inválida. Informe uma URL completa, incluindo https://.'
    );
  }

  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'A URL de retorno deve ser um endereço HTTP ou HTTPS válido.'
    );
  }

  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol !== 'https:'
  ) {
    throw new Error(
      'Em produção, a URL pública deve utilizar HTTPS.'
    );
  }

  url.hash = '';

  return url.toString();
}

/**
 * Envia erros das rotas no mesmo formato.
 */
function responderErro(res, err, mensagemPadrao) {
  const status = Number(err?.status);

  return res.status(
    status >= 400 && status <= 599 ? status : 500
  ).json({
    erro: mensagemPadrao || err?.message ||
      'Não foi possível concluir a operação.',
    detalhes: err?.data || erroDetalhes(err)
  });
}

// ============================================================
// CHAVE PÚBLICA
// GET /api/mercado-pago/public-key
// ============================================================

router.get('/public-key', (req, res) => {
  const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY;

  if (!publicKey) {
    return res.status(500).json({
      erro: 'MERCADO_PAGO_PUBLIC_KEY não foi configurada.'
    });
  }

  return res.json({
    public_key: publicKey
  });
});

// ============================================================
// CRIAR ASSINATURA
// POST /api/mercado-pago/assinaturas
// ============================================================

router.post('/assinaturas', async (req, res) => {
  const {
    plano_id,
    email,
    nome,
    card_token_id,
    empresa_id
  } = req.body || {};

  if (!plano_id || !email || !card_token_id) {
    return res.status(400).json({
      erro: 'plano_id, email e card_token_id são obrigatórios.'
    });
  }

  let empresaId = req.usuario.empresa_id;

  if (req.usuario.perfil === 'dev' && empresa_id) {
    empresaId = Number(empresa_id);
  }

  if (!numeroPositivo(empresaId)) {
    return res.status(400).json({
      erro: 'É necessário informar uma empresa válida.'
    });
  }

  if (!numeroPositivo(plano_id)) {
    return res.status(400).json({
      erro: 'Selecione um plano válido.'
    });
  }

  if (
    typeof email !== 'string' ||
    !email.trim() ||
    typeof card_token_id !== 'string' ||
    !card_token_id.trim()
  ) {
    return res.status(400).json({
      erro: 'Informe um e-mail e um token de cartão válidos.'
    });
  }

  // Validar a URL antes de inserir uma assinatura pendente.
  let backUrl;

  try {
    backUrl = obterUrlAplicacao();
  } catch (err) {
    return res.status(500).json({
      erro: err.message
    });
  }

  try {
    const empresaResult = await pool.query(
      `
        SELECT id, nome, ativo
        FROM empresas
        WHERE id = $1
        LIMIT 1
      `,
      [Number(empresaId)]
    );

    if (!empresaResult.rows.length) {
      return res.status(404).json({
        erro: 'Empresa não encontrada.'
      });
    }

    if (!empresaResult.rows[0].ativo) {
      return res.status(400).json({
        erro: 'A empresa está desativada.'
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
      [Number(plano_id)]
    );

    if (!planoResult.rows.length) {
      return res.status(404).json({
        erro: 'Plano não encontrado.'
      });
    }

    const plano = planoResult.rows[0];

    if (!plano.ativo || !plano.mercado_pago_plan_id) {
      return res.status(400).json({
        erro: !plano.ativo
          ? 'Este plano está inativo.'
          : 'Este plano ainda não está integrado ao Mercado Pago.'
      });
    }

    const existenteResult = await pool.query(
      `
        SELECT id, status, mercado_pago_id
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
      [Number(empresaId)]
    );

    if (existenteResult.rows.length) {
      return res.status(409).json({
        erro: 'A empresa já possui uma assinatura em andamento.',
        assinatura: existenteResult.rows[0]
      });
    }

    const localResult = await pool.query(
      `
        INSERT INTO assinaturas (
          empresa_id,
          plano_id,
          status,
          criado_em,
          atualizado_em
        )
        VALUES ($1, $2, 'pendente', NOW(), NOW())
        RETURNING id, empresa_id, plano_id, status
      `,
      [Number(empresaId), Number(plano_id)]
    );

    const local = localResult.rows[0];

    try {
      // ENVIA O card_token_id AO MERCADO PAGO
      const mp = await criarAssinatura({
        planoMercadoPagoId: plano.mercado_pago_plan_id,
        email: email.trim(),
        nome: nome || plano.nome,
        cardTokenId: card_token_id,
        externalReference: String(local.id),
        backUrl
      });

      if (!mp?.id) {
        throw new Error(
          'Mercado Pago não retornou o ID da assinatura.'
        );
      }

      const statusMP = String(mp.status || '').toLowerCase();

      const statusLocal = statusMP === 'authorized'
        ? 'ativa'
        : 'pendente';

      const atualizada = await pool.query(
        `
          UPDATE assinaturas
          SET
            status = $1,
            mercado_pago_id = $2,
            inicio_em = $3,
            proxima_cobranca_em = $4,
            atualizado_em = NOW()
          WHERE id = $5
          RETURNING *
        `,
        [
          statusLocal,
          String(mp.id),
          mp.date_created || new Date(),
          mp.auto_recurring?.next_payment_date ||
            mp.next_payment_date ||
            null,
          local.id
        ]
      );

      return res.status(201).json({
        ok: true,
        mensagem: 'Assinatura criada.',
        assinatura: atualizada.rows[0],
        mercado_pago: mp
      });
    } catch (err) {
      /*
       * Só exclui o registro local quando não há indício de que a
       * assinatura remota foi criada (sem resposta do Mercado Pago).
       */
      if (!err?.data) {
        await pool.query(
          `
            DELETE FROM assinaturas
            WHERE id = $1
              AND mercado_pago_id IS NULL
          `,
          [local.id]
        );
      }

      throw err;
    }
  } catch (err) {
    console.error('Erro ao criar assinatura:', err);

    return responderErro(
      res,
      err,
      'Não foi possível criar a assinatura.'
    );
  }
});

// ============================================================
// MINHA ASSINATURA
// Prioriza assinatura ativa sobre registros pendentes.
// ============================================================

router.get('/minha-assinatura', async (req, res) => {
  const empresaId = Number(req.usuario?.empresa_id);

  if (!numeroPositivo(empresaId)) {
    return res.status(400).json({
      erro: 'Usuário não está vinculado a uma empresa válida.'
    });
  }

  try {
    const result = await pool.query(
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
        INNER JOIN planos p ON p.id = a.plano_id
        WHERE a.empresa_id = $1
        ORDER BY
          CASE a.status
            WHEN 'ativa' THEN 1
            WHEN 'inadimplente' THEN 2
            WHEN 'pausada' THEN 3
            WHEN 'pendente' THEN 4
            ELSE 5
          END,
          a.id DESC
        LIMIT 1
      `,
      [empresaId]
    );

    if (!result.rows.length) {
      return res.json({
        ok: true,
        possui_assinatura: false,
        assinatura: null
      });
    }

    const a = result.rows[0];

    return res.json({
      ok: true,
      possui_assinatura: true,
      assinatura: {
        id: a.id,
        empresa_id: a.empresa_id,
        plano_id: a.plano_id,
        status: a.status,
        mercado_pago_id: a.mercado_pago_id,
        inicio_em: a.inicio_em,
        proxima_cobranca_em: a.proxima_cobranca_em,
        cancelada_em: a.cancelada_em,
        criado_em: a.criado_em,
        atualizado_em: a.atualizado_em,
        plano: {
          id: a.plano_id,
          nome: a.plano_nome,
          descricao: a.plano_descricao,
          valor: a.plano_valor,
          periodo: a.plano_periodo,
          mercado_pago_plan_id: a.mercado_pago_plan_id
        }
      }
    });
  } catch (err) {
    console.error('Erro ao consultar assinatura:', err);

    return responderErro(
      res,
      err,
      'Não foi possível consultar sua assinatura.'
    );
  }
});

// ============================================================
// CANCELAR MINHA ASSINATURA
// ============================================================

router.post('/minha-assinatura/cancelar', async (req, res) => {
  const empresaId = Number(req.usuario?.empresa_id);

  if (!numeroPositivo(empresaId)) {
    return res.status(400).json({
      erro: 'Usuário não está vinculado a uma empresa válida.'
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT id, mercado_pago_id, status
        FROM assinaturas
        WHERE empresa_id = $1
          AND status IN ('ativa', 'pausada', 'inadimplente')
        ORDER BY id DESC
        LIMIT 1
      `,
      [empresaId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        erro: 'Nenhuma assinatura ativa foi encontrada.'
      });
    }

    const assinatura = result.rows[0];

    if (!assinatura.mercado_pago_id) {
      return res.status(409).json({
        erro: 'A assinatura não possui ID no Mercado Pago.'
      });
    }

    await atualizarAssinatura({
      mercadoPagoId: assinatura.mercado_pago_id,
      status: 'canceled'
    });

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

    return responderErro(
      res,
      err,
      'Não foi possível cancelar a assinatura.'
    );
  }
});

// ============================================================
// TROCAR PLANO
//
// Mesma periodicidade: atualiza o valor da cobrança existente
// (não precisa de cartão).
//
// Periodicidade diferente: cria uma nova assinatura enviando um
// card_token_id novo ao Mercado Pago. Se a nova for autorizada,
// a antiga é cancelada.
// ============================================================

router.post(
  '/minha-assinatura/trocar-plano',
  async (req, res) => {
    const empresaId = Number(req.usuario?.empresa_id);
    const planoId = Number(req.body?.plano_id);

    if (!numeroPositivo(empresaId)) {
      return res.status(400).json({
        erro: 'Usuário não está vinculado a uma empresa válida.'
      });
    }

    if (!numeroPositivo(planoId)) {
      return res.status(400).json({
        erro: 'Selecione um plano válido.'
      });
    }

    try {
      const assinaturaResult = await pool.query(
        `
          SELECT
            a.id,
            a.empresa_id,
            a.plano_id,
            a.status,
            a.mercado_pago_id,
            p.nome AS plano_atual_nome,
            p.valor AS plano_atual_valor,
            p.periodo AS plano_atual_periodo
          FROM assinaturas a
          INNER JOIN planos p ON p.id = a.plano_id
          WHERE a.empresa_id = $1
            AND a.status IN ('ativa', 'pausada', 'inadimplente')
          ORDER BY a.id DESC
          LIMIT 1
        `,
        [empresaId]
      );

      if (!assinaturaResult.rows.length) {
        return res.status(404).json({
          erro: 'Nenhuma assinatura atual foi encontrada.'
        });
      }

      const atual = assinaturaResult.rows[0];

      if (atual.status !== 'ativa') {
        return res.status(409).json({
          erro: 'Somente assinaturas ativas podem trocar de plano.'
        });
      }

      if (!atual.mercado_pago_id) {
        return res.status(409).json({
          erro: 'A assinatura atual não possui ID no Mercado Pago.'
        });
      }

      if (Number(atual.plano_id) === planoId) {
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

      if (!planoResult.rows.length) {
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

      const periodoAtual = String(
        atual.plano_atual_periodo || ''
      ).trim().toLowerCase();

      const periodoNovo = String(
        novoPlano.periodo || ''
      ).trim().toLowerCase();

      // ----------------------------------------------------
      // PERIODICIDADE DIFERENTE: nova assinatura com cartão
      // ----------------------------------------------------
      if (periodoAtual !== periodoNovo) {
        const { card_token_id, email, nome } = req.body || {};

        if (
          typeof card_token_id !== 'string' ||
          !card_token_id.trim()
        ) {
          return res.status(400).json({
            erro: 'Para mudar a periodicidade, informe os dados do cartão.',
            codigo: 'CARTAO_NECESSARIO'
          });
        }

        const emailPagador = String(email || '').trim();

        if (!emailPagador) {
          return res.status(400).json({
            erro: 'Informe o e-mail do pagador.'
          });
        }

        let backUrl;

        try {
          backUrl = obterUrlAplicacao();
        } catch (err) {
          return res.status(500).json({
            erro: err.message
          });
        }

        // Evitar criar várias assinaturas pendentes.
        const pendenteResult = await pool.query(
          `
            SELECT id
            FROM assinaturas
            WHERE empresa_id = $1
              AND status = 'pendente'
            LIMIT 1
          `,
          [empresaId]
        );

        if (pendenteResult.rows.length) {
          return res.status(409).json({
            erro: 'Já existe uma assinatura pendente de confirmação.',
            codigo: 'AUTORIZACAO_PENDENTE'
          });
        }

        // A assinatura atual continua ativa durante o processo.
        const localResult = await pool.query(
          `
            INSERT INTO assinaturas (
              empresa_id,
              plano_id,
              status,
              criado_em,
              atualizado_em
            )
            VALUES ($1, $2, 'pendente', NOW(), NOW())
            RETURNING id
          `,
          [empresaId, planoId]
        );

        const novaId = localResult.rows[0].id;

        try {
          // ENVIA O card_token_id AO MERCADO PAGO
          const mp = await criarAssinatura({
            planoMercadoPagoId: novoPlano.mercado_pago_plan_id,
            email: emailPagador,
            nome: nome || novoPlano.nome,
            cardTokenId: card_token_id.trim(),
            externalReference: String(novaId),
            backUrl
          });

          if (!mp?.id) {
            throw new Error(
              'Mercado Pago não retornou o ID da assinatura.'
            );
          }

          const autorizada =
            String(mp.status || '').toLowerCase() === 'authorized';

          const nova = await pool.query(
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
                mercado_pago_id
            `,
            [
              autorizada ? 'ativa' : 'pendente',
              String(mp.id),
              mp.date_created || new Date(),
              mp.auto_recurring?.next_payment_date ||
                mp.next_payment_date ||
                null,
              novaId
            ]
          );

          let aviso;

          // Só cancela a assinatura antiga se a nova foi autorizada.
          if (autorizada) {
            try {
              await atualizarAssinatura({
                mercadoPagoId: atual.mercado_pago_id,
                status: 'canceled'
              });

              await pool.query(
                `
                  UPDATE assinaturas
                  SET
                    status = 'cancelada',
                    cancelada_em = NOW(),
                    atualizado_em = NOW()
                  WHERE id = $1
                    AND empresa_id = $2
                `,
                [atual.id, empresaId]
              );
            } catch (errCancelamento) {
              console.error(
                'Nova assinatura criada, mas falhou ao cancelar a antiga:',
                errCancelamento
              );

              aviso =
                'A nova assinatura foi criada, mas a antiga não pôde ser cancelada automaticamente. Entre em contato com o suporte.';
            }
          }

          return res.json({
            ok: true,
            codigo: autorizada
              ? 'PLANO_ATUALIZADO'
              : 'PLANO_PENDENTE',
            mensagem: autorizada
              ? 'Plano alterado com sucesso.'
              : 'Nova assinatura criada. Aguardando confirmação do pagamento; o plano atual continua ativo.',
            aviso,
            assinatura: nova.rows[0]
          });
        } catch (err) {
          // Sem resposta do Mercado Pago: remove o registro pendente.
          if (!err?.data) {
            await pool.query(
              `
                DELETE FROM assinaturas
                WHERE id = $1
                  AND empresa_id = $2
                  AND status = 'pendente'
                  AND mercado_pago_id IS NULL
              `,
              [novaId, empresaId]
            );
          }

          throw err;
        }
      }

      // ----------------------------------------------------
      // MESMA PERIODICIDADE: atualiza a assinatura existente
      // ----------------------------------------------------
      await atualizarValorAssinatura({
        mercadoPagoId: atual.mercado_pago_id,
        valor: Number(novoPlano.valor)
      });

      const atualizada = await pool.query(
        `
          UPDATE assinaturas
          SET
            plano_id = $1,
            atualizado_em = NOW()
          WHERE id = $2
            AND empresa_id = $3
            AND status = 'ativa'
            AND mercado_pago_id = $4
          RETURNING
            id,
            empresa_id,
            plano_id,
            status,
            mercado_pago_id,
            atualizado_em
        `,
        [
          planoId,
          atual.id,
          empresaId,
          atual.mercado_pago_id
        ]
      );

      if (!atualizada.rows.length) {
        return res.status(409).json({
          erro:
            'A cobrança foi atualizada, mas a assinatura local mudou. Entre em contato com o suporte.'
        });
      }

      return res.json({
        ok: true,
        codigo: 'PLANO_ATUALIZADO',
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

      return responderErro(
        res,
        err,
        'Não foi possível trocar o plano.'
      );
    }
  }
);

// ============================================================
// ROTAS EXCLUSIVAS DO DESENVOLVEDOR
// ============================================================

router.use(somenteDev);

// ============================================================
// TESTAR MERCADO PAGO
// GET /api/mercado-pago/teste
// ============================================================

router.get('/teste', async (req, res) => {
  try {
    const resultado = await mercadoPagoRequest(
      '/v1/payment_methods',
      { method: 'GET' }
    );

    return res.json({
      ok: true,
      mercado_pago: 'conectado',
      quantidade_metodos: Array.isArray(resultado)
        ? resultado.length
        : null
    });
  } catch (err) {
    console.error('Erro no teste Mercado Pago:', err);

    return responderErro(
      res,
      err,
      'Erro ao conectar com o Mercado Pago.'
    );
  }
});

// ============================================================
// CRIAR PLANO NO MERCADO PAGO
// POST /api/mercado-pago/planos/:id/criar
// ============================================================

router.post('/planos/:id/criar', async (req, res) => {
  const planoId = Number(req.params.id);

  if (!numeroPositivo(planoId)) {
    return res.status(400).json({
      erro: 'ID do plano inválido.'
    });
  }

  let backUrl;

  try {
    backUrl = obterUrlAplicacao();
  } catch (err) {
    return res.status(500).json({
      erro: err.message
    });
  }

  try {
    const result = await pool.query(
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

    if (!result.rows.length) {
      return res.status(404).json({
        erro: 'Plano não encontrado.'
      });
    }

    const plano = result.rows[0];

    if (plano.mercado_pago_plan_id) {
      return res.status(409).json({
        erro: 'Este plano já está vinculado ao Mercado Pago.',
        mercado_pago_plan_id: plano.mercado_pago_plan_id
      });
    }

    if (!plano.ativo) {
      return res.status(400).json({
        erro: 'Não é possível criar um plano inativo.'
      });
    }

    const mp = await criarPlano({
      nome: plano.nome,
      descricao: plano.descricao,
      valor: plano.valor,
      periodo: plano.periodo,
      backUrl
    });

    if (!mp?.id) {
      return res.status(502).json({
        erro: 'Mercado Pago não retornou o ID do plano.'
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
      [String(mp.id), planoId]
    );

    return res.status(201).json({
      ok: true,
      mensagem: 'Plano criado no Mercado Pago.',
      plano: {
        id: plano.id,
        nome: plano.nome,
        mercado_pago_plan_id: mp.id
      },
      mercado_pago: mp
    });
  } catch (err) {
    console.error('Erro ao criar plano no Mercado Pago:', err);

    return responderErro(
      res,
      err,
      'Não foi possível criar o plano no Mercado Pago.'
    );
  }
});

// ============================================================
// CONSULTAR PLANO
// GET /api/mercado-pago/planos/:id
// ============================================================

router.get('/planos/:id', async (req, res) => {
  const planoId = Number(req.params.id);

  if (!numeroPositivo(planoId)) {
    return res.status(400).json({
      erro: 'ID do plano inválido.'
    });
  }

  try {
    const result = await pool.query(
      `
        SELECT id, nome, mercado_pago_plan_id
        FROM planos
        WHERE id = $1
        LIMIT 1
      `,
      [planoId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        erro: 'Plano não encontrado.'
      });
    }

    const plano = result.rows[0];

    if (!plano.mercado_pago_plan_id) {
      return res.status(400).json({
        erro: 'Este plano ainda não foi criado no Mercado Pago.'
      });
    }

    const mp = await buscarPlano(plano.mercado_pago_plan_id);

    return res.json({
      ok: true,
      plano: {
        id: plano.id,
        nome: plano.nome,
        mercado_pago_plan_id: plano.mercado_pago_plan_id
      },
      mercado_pago: mp
    });
  } catch (err) {
    console.error('Erro ao consultar plano:', err);

    return responderErro(
      res,
      err,
      'Não foi possível consultar o plano.'
    );
  }
});

// ============================================================
// CONSULTAR ASSINATURA NO MERCADO PAGO
// GET /api/mercado-pago/assinaturas/:id
// ============================================================

router.get('/assinaturas/:id', async (req, res) => {
  const assinaturaId = String(req.params.id || '').trim();

  if (!assinaturaId) {
    return res.status(400).json({
      erro: 'ID da assinatura inválido.'
    });
  }

  try {
    const mp = await buscarAssinatura(assinaturaId);

    return res.json({
      ok: true,
      assinatura: mp
    });
  } catch (err) {
    console.error('Erro ao consultar assinatura:', err);

    return responderErro(
      res,
      err,
      'Não foi possível consultar a assinatura.'
    );
  }
});

// ============================================================
// CONSULTAR PAGAMENTO AUTORIZADO
// GET /api/mercado-pago/pagamentos/:id
// ============================================================

router.get('/pagamentos/:id', async (req, res) => {
  const pagamentoId = String(req.params.id || '').trim();

  if (!pagamentoId) {
    return res.status(400).json({
      erro: 'ID do pagamento inválido.'
    });
  }

  try {
    const pagamento = await buscarPagamentoAutorizado(
      pagamentoId
    );

    return res.json({
      ok: true,
      pagamento
    });
  } catch (err) {
    console.error('Erro ao consultar pagamento:', err);

    return responderErro(
      res,
      err,
      'Não foi possível consultar o pagamento.'
    );
  }
});

module.exports = router;