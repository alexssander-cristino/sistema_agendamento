
const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);

// ============================================================
// UTILITÁRIOS
// ============================================================

function obterEmpresaId(req) {
  return req.usuario?.empresa_id || null;
}

function normalizarTelefone(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function validarEmail(valor) {
  if (!valor) return true;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function prepararDados(body = {}) {
  return {
    nome: String(body.nome || '').trim(),
    telefone: String(body.telefone || '').trim() || null,
    email: String(body.email || '').trim() || null,
    documento: String(body.documento || '').trim() || null,
    data_nascimento: String(body.data_nascimento || '').trim() || null,
    endereco: String(body.endereco || '').trim() || null,
    observacoes: String(body.observacoes || '').trim() || null
  };
}

function validarDados(dados) {
  if (!dados.nome) {
    return 'Informe o nome do cliente.';
  }

  if (dados.nome.length > 150) {
    return 'O nome deve ter no máximo 150 caracteres.';
  }

  if (dados.telefone && dados.telefone.length > 30) {
    return 'O telefone deve ter no máximo 30 caracteres.';
  }

  if (dados.email && dados.email.length > 254) {
    return 'O e-mail deve ter no máximo 254 caracteres.';
  }

  if (!validarEmail(dados.email)) {
    return 'Informe um endereço de e-mail válido.';
  }

  if (dados.documento && dados.documento.length > 18) {
    return 'O documento deve ter no máximo 18 caracteres.';
  }

  if (dados.endereco && dados.endereco.length > 250) {
    return 'O endereço deve ter no máximo 250 caracteres.';
  }

  if (dados.observacoes && dados.observacoes.length > 5000) {
    return 'As observações devem ter no máximo 5.000 caracteres.';
  }

  if (
    dados.data_nascimento &&
    !/^\d{4}-\d{2}-\d{2}$/.test(dados.data_nascimento)
  ) {
    return 'Informe uma data de nascimento válida.';
  }

  return null;
}

function erroBanco(res, err, mensagem) {
  console.error(mensagem, err);

  if (err.code === '23505') {
    return res.status(409).json({
      erro: 'Já existe um registro com esses dados.'
    });
  }

  return res.status(500).json({
    erro: mensagem
  });
}

// ============================================================
// GET /api/clientes?busca=...
//
// Lista clientes cadastrados e clientes identificados apenas
// por agendamentos antigos.
//
// REGRA PARA CLIENTES CADASTRADOS:
// Os indicadores são calculados EXCLUSIVAMENTE com base em
// agendamentos cujo cliente_id corresponde ao ID do cadastro.
//
// Não associar atendimentos pelo telefone ou nome nessa
// consulta, pois isso pode misturar históricos de pessoas.
//
// Os agendamentos antigos sem cliente_id podem aparecer na
// lista separada de históricos, sem serem contabilizados
// nos indicadores do cliente cadastrado.
// ============================================================

router.get('/', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const busca = String(req.query.busca || '').trim();

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

  if (!busca) {
    return res.json([]);
  }

  try {
    const termo = `%${busca}%`;

    // ========================================================
    // CLIENTES CADASTRADOS
    //
    // Importante:
    // a.cliente_id = c.id é a única associação permitida aqui.
    // ========================================================

    const cadastrados = await pool.query(
      `
        SELECT
          c.id,
          c.nome AS cliente,
          c.telefone,
          c.email,
          c.documento,
          c.data_nascimento,
          c.endereco,
          c.observacoes,
          c.ativo,
          c.criado_em,
          c.atualizado_em,

          COALESCE(e.nicho, 'generico') AS nicho_empresa,

          COUNT(a.id)::int AS total_atendimentos,

          COUNT(a.id) FILTER (
            WHERE lower(COALESCE(a.status, '')) = 'concluido'
          )::int AS atendimentos_concluidos,

          COALESCE(
            SUM(a.valor) FILTER (
              WHERE lower(COALESCE(a.status, '')) = 'concluido'
            ),
            0
          ) AS total_gasto,

          MAX(a.data) AS ultima_visita,

          CASE
            WHEN regexp_replace(
              COALESCE(c.telefone, ''),
              '[^0-9]', '', 'g'
            ) <> ''
            THEN 'tel:' || regexp_replace(
              COALESCE(c.telefone, ''),
              '[^0-9]', '', 'g'
            )
            ELSE 'nome:' || lower(trim(c.nome))
          END AS cliente_chave

        FROM clientes c

        LEFT JOIN empresas e
          ON e.id = c.empresa_id

        LEFT JOIN agendamentos a
          ON a.empresa_id = c.empresa_id
         AND a.cliente_id = c.id

        WHERE c.empresa_id = $1
          AND c.ativo = TRUE
          AND (
            c.nome ILIKE $2
            OR COALESCE(c.telefone, '') ILIKE $2
            OR COALESCE(c.email, '') ILIKE $2
            OR COALESCE(c.documento, '') ILIKE $2
          )

        GROUP BY c.id, e.nicho

        ORDER BY
          MAX(a.data) DESC NULLS LAST,
          c.nome ASC

        LIMIT 100
      `,
      [empresaId, termo]
    );

    // ========================================================
    // CLIENTES IDENTIFICADOS APENAS NO HISTÓRICO
    //
    // São agendamentos antigos que não possuem cliente_id.
    //
    // Não incluir aqui agendamentos que já estejam vinculados
    // a um cadastro de cliente.
    //
    // Quando o telefone pertence a um cliente cadastrado,
    // não criar um segundo cliente histórico com esse telefone.
    // ========================================================

    const historicos = await pool.query(
      `
        SELECT
          NULL::bigint AS id,

          (
            array_agg(
              a.cliente
              ORDER BY
                a.data DESC NULLS LAST,
                a.hora DESC NULLS LAST,
                a.id DESC
            )
          )[1] AS cliente,

          (
            array_agg(
              a.telefone
              ORDER BY
                a.data DESC NULLS LAST,
                a.hora DESC NULLS LAST,
                a.id DESC
            )
          )[1] AS telefone,

          NULL::varchar AS email,
          NULL::varchar AS documento,
          NULL::date AS data_nascimento,
          NULL::varchar AS endereco,
          NULL::text AS observacoes,

          TRUE AS ativo,

          NULL::timestamptz AS criado_em,
          NULL::timestamptz AS atualizado_em,

          COALESCE(e.nicho, 'generico') AS nicho_empresa,

          COUNT(*)::int AS total_atendimentos,

          COUNT(*) FILTER (
            WHERE lower(COALESCE(a.status, '')) = 'concluido'
          )::int AS atendimentos_concluidos,

          COALESCE(
            SUM(a.valor) FILTER (
              WHERE lower(COALESCE(a.status, '')) = 'concluido'
            ),
            0
          ) AS total_gasto,

          MAX(a.data) AS ultima_visita,

          CASE
            WHEN regexp_replace(
              COALESCE(a.telefone, ''),
              '[^0-9]', '', 'g'
            ) <> ''
            THEN 'tel:' || regexp_replace(
              COALESCE(a.telefone, ''),
              '[^0-9]', '', 'g'
            )
            ELSE 'nome:' || lower(trim(a.cliente))
          END AS cliente_chave

        FROM agendamentos a

        INNER JOIN empresas e
          ON e.id = a.empresa_id

        WHERE a.empresa_id = $1
          AND a.cliente_id IS NULL
          AND (
            a.cliente ILIKE $2
            OR COALESCE(a.telefone, '') ILIKE $2
          )

          AND NOT EXISTS (
            SELECT 1
            FROM clientes c
            WHERE c.empresa_id = a.empresa_id
              AND c.ativo = TRUE
              AND (
                (
                  regexp_replace(
                    COALESCE(c.telefone, ''),
                    '[^0-9]', '', 'g'
                  ) <> ''
                  AND regexp_replace(
                    COALESCE(a.telefone, ''),
                    '[^0-9]', '', 'g'
                  ) = regexp_replace(
                    COALESCE(c.telefone, ''),
                    '[^0-9]', '', 'g'
                  )
                )
                OR
                (
                  regexp_replace(
                    COALESCE(c.telefone, ''),
                    '[^0-9]', '', 'g'
                  ) = ''
                  AND lower(trim(c.nome)) =
                      lower(trim(a.cliente))
                )
              )
          )

        GROUP BY
          e.nicho,
          CASE
            WHEN regexp_replace(
              COALESCE(a.telefone, ''),
              '[^0-9]', '', 'g'
            ) <> ''
            THEN 'tel:' || regexp_replace(
              COALESCE(a.telefone, ''),
              '[^0-9]', '', 'g'
            )
            ELSE 'nome:' || lower(trim(a.cliente))
          END

        ORDER BY MAX(a.data) DESC NULLS LAST

        LIMIT 100
      `,
      [empresaId, termo]
    );

    const resultado = [
      ...cadastrados.rows,
      ...historicos.rows
    ];

    resultado.sort((a, b) => {
      if (a.id && !b.id) return -1;
      if (!a.id && b.id) return 1;

      return String(b.ultima_visita || '').localeCompare(
        String(a.ultima_visita || '')
      );
    });

    return res.json(resultado.slice(0, 100));
  } catch (err) {
    return erroBanco(
      res,
      err,
      'Não foi possível carregar os clientes.'
    );
  }
});

// ============================================================
// GET /api/clientes/historico
//
// Consulta o histórico de um cliente.
//
// Se cliente_id for informado, retorna exclusivamente os
// agendamentos vinculados àquele ID e à empresa autenticada.
//
// Não utiliza telefone ou nome como alternativa quando o ID
// foi fornecido.
//
// Sem cliente_id, permite consultar históricos antigos sem
// cadastro, por telefone ou nome, mas somente quando o
// agendamento ainda possui cliente_id NULL.
// ============================================================

router.get('/historico', async (req, res) => {
  const empresaId = obterEmpresaId(req);

  const clienteIdInformado = String(
    req.query.cliente_id || ''
  ).trim();

  const telefone = String(
    req.query.telefone || ''
  ).trim();

  const nomeCliente = String(
    req.query.cliente || ''
  ).trim();

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

  if (!clienteIdInformado && !telefone && !nomeCliente) {
    return res.status(400).json({
      erro: 'Informe o ID, telefone ou nome do cliente.'
    });
  }

  try {
    let filtro;
    let parametro;

    if (clienteIdInformado) {
      const clienteId = Number(clienteIdInformado);

      if (
        !Number.isSafeInteger(clienteId) ||
        clienteId <= 0
      ) {
        return res.status(400).json({
          erro: 'Identificador de cliente inválido.'
        });
      }

      const cadastro = await pool.query(
        `
          SELECT id
          FROM clientes
          WHERE id = $1
            AND empresa_id = $2
            AND ativo = TRUE
          LIMIT 1
        `,
        [clienteId, empresaId]
      );

      if (!cadastro.rows.length) {
        return res.status(404).json({
          erro: 'Cliente não encontrado.'
        });
      }

      // Vínculo estrito: não procurar por telefone ou nome.
      filtro = 'a.cliente_id = $2';
      parametro = clienteId;
    } else if (telefone) {
      const telefoneNormalizado = normalizarTelefone(telefone);

      if (!telefoneNormalizado) {
        return res.status(400).json({
          erro: 'Telefone inválido.'
        });
      }

      // Apenas registros antigos sem cliente_id.
      filtro = `
        a.cliente_id IS NULL
        AND regexp_replace(
          COALESCE(a.telefone, ''),
          '[^0-9]', '', 'g'
        ) = $2
      `;

      parametro = telefoneNormalizado;
    } else {
      // Apenas registros antigos sem cliente_id.
      filtro = `
        a.cliente_id IS NULL
        AND lower(trim(a.cliente)) = lower(trim($2))
      `;

      parametro = nomeCliente;
    }

    const { rows } = await pool.query(
      `
        SELECT
          a.id,
          a.cliente_id,
          a.cliente,
          a.telefone,

          COALESCE(e.nicho, 'generico') AS nicho_empresa,

          a.veiculo,
          a.placa,
          a.servico_id,
          s.nome AS servico_nome,
          a.data,
          a.hora,
          a.valor,
          a.status,
          a.status_pagamento,
          a.forma_pagamento,
          a.observacoes

        FROM agendamentos a

        INNER JOIN empresas e
          ON e.id = a.empresa_id

        LEFT JOIN servicos s
          ON s.id = a.servico_id
         AND s.empresa_id = a.empresa_id

        WHERE a.empresa_id = $1
          AND ${filtro}

        ORDER BY
          a.data DESC NULLS LAST,
          a.hora DESC NULLS LAST,
          a.id DESC
      `,
      [empresaId, parametro]
    );

    return res.json(rows);
  } catch (err) {
    return erroBanco(
      res,
      err,
      'Não foi possível carregar o histórico.'
    );
  }
});

// ============================================================
// GET /api/clientes/:id
//
// Consulta um cliente cadastrado para edição ou agendamento.
// ============================================================

router.get('/:id', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const id = Number(req.params.id);

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({
      erro: 'Identificador de cliente inválido.'
    });
  }

  try {
    const { rows } = await pool.query(
      `
        SELECT
          c.id,
          c.nome,
          c.telefone,
          c.email,
          c.documento,
          c.data_nascimento,
          c.endereco,
          c.observacoes,
          c.ativo,
          c.criado_em,
          c.atualizado_em,

          COALESCE(e.nicho, 'generico') AS nicho_empresa

        FROM clientes c

        LEFT JOIN empresas e
          ON e.id = c.empresa_id

        WHERE c.id = $1
          AND c.empresa_id = $2
          AND c.ativo = TRUE

        LIMIT 1
      `,
      [id, empresaId]
    );

    if (!rows.length) {
      return res.status(404).json({
        erro: 'Cliente não encontrado.'
      });
    }

    return res.json(rows[0]);
  } catch (err) {
    return erroBanco(
      res,
      err,
      'Não foi possível consultar o cliente.'
    );
  }
});

// ============================================================
// POST /api/clientes
//
// Cadastra um cliente.
// ============================================================

router.post('/', async (req, res) => {
  const empresaId = obterEmpresaId(req);

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

  const dados = prepararDados(req.body);
  const erro = validarDados(dados);

  if (erro) {
    return res.status(400).json({ erro });
  }

  try {
    const { rows } = await pool.query(
      `
        INSERT INTO clientes (
          empresa_id,
          nome,
          telefone,
          email,
          documento,
          data_nascimento,
          endereco,
          observacoes,
          ativo,
          criado_em,
          atualizado_em
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          TRUE, NOW(), NOW()
        )
        RETURNING
          id,
          empresa_id,
          nome,
          telefone,
          email,
          documento,
          data_nascimento,
          endereco,
          observacoes,
          ativo,
          criado_em,
          atualizado_em
      `,
      [
        empresaId,
        dados.nome,
        dados.telefone,
        dados.email,
        dados.documento,
        dados.data_nascimento,
        dados.endereco,
        dados.observacoes
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    return erroBanco(
      res,
      err,
      'Não foi possível cadastrar o cliente.'
    );
  }
});

// ============================================================
// PATCH /api/clientes/:id
//
// Atualiza os dados de um cliente da empresa autenticada.
// ============================================================

router.patch('/:id', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const id = Number(req.params.id);

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({
      erro: 'Identificador de cliente inválido.'
    });
  }

  const dados = prepararDados(req.body);
  const erro = validarDados(dados);

  if (erro) {
    return res.status(400).json({ erro });
  }

  try {
    const { rows } = await pool.query(
      `
        UPDATE clientes
        SET
          nome = $1,
          telefone = $2,
          email = $3,
          documento = $4,
          data_nascimento = $5,
          endereco = $6,
          observacoes = $7,
          atualizado_em = NOW()

        WHERE id = $8
          AND empresa_id = $9
          AND ativo = TRUE

        RETURNING
          id,
          empresa_id,
          nome,
          telefone,
          email,
          documento,
          data_nascimento,
          endereco,
          observacoes,
          ativo,
          criado_em,
          atualizado_em
      `,
      [
        dados.nome,
        dados.telefone,
        dados.email,
        dados.documento,
        dados.data_nascimento,
        dados.endereco,
        dados.observacoes,
        id,
        empresaId
      ]
    );

    if (!rows.length) {
      return res.status(404).json({
        erro: 'Cliente não encontrado.'
      });
    }

    return res.json(rows[0]);
  } catch (err) {
    return erroBanco(
      res,
      err,
      'Não foi possível atualizar o cliente.'
    );
  }
});

// ============================================================
// DELETE /api/clientes/:id
//
// Desativa o cliente sem apagar o histórico.
// ============================================================

router.delete('/:id', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  const id = Number(req.params.id);

  if (!empresaId) {
    return res.status(403).json({
      erro: 'Não existe uma empresa vinculada à sessão.'
    });
  }

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({
      erro: 'Identificador de cliente inválido.'
    });
  }

  try {
    const { rowCount } = await pool.query(
      `
        UPDATE clientes
        SET
          ativo = FALSE,
          atualizado_em = NOW()

        WHERE id = $1
          AND empresa_id = $2
          AND ativo = TRUE
      `,
      [id, empresaId]
    );

    if (!rowCount) {
      return res.status(404).json({
        erro: 'Cliente não encontrado.'
      });
    }

    return res.json({
      mensagem: 'Cliente desativado com sucesso.'
    });
  } catch (err) {
    return erroBanco(
      res,
      err,
      'Não foi possível desativar o cliente.'
    );
  }
});

module.exports = router;
