const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const exigirPermissao = require('../middleware/permissao');

const router = express.Router();

// Todas as rotas de agendamentos exigem autenticação
router.use(autenticar);

const SELECT_BASE = `
  SELECT a.*, s.nome AS servico_nome
  FROM agendamentos a
  LEFT JOIN servicos s
    ON s.id = a.servico_id
   AND s.empresa_id = a.empresa_id
`;


// ============================================================
// GET /api/agendamentos
// ============================================================

router.get('/', async (req, res) => {
  const { data, de, ate, busca } = req.query;
  const empresaId = req.usuario.empresa_id;

  try {

    if (busca) {
      const termo = `%${busca}%`;

      const { rows } = await pool.query(
        `${SELECT_BASE}
         WHERE a.empresa_id = $1
           AND (
             a.cliente ILIKE $2
             OR a.telefone ILIKE $2
             OR a.placa ILIKE $2
           )
         ORDER BY a.data DESC, a.hora DESC`,
        [empresaId, termo]
      );

      return res.json(rows);
    }

    if (data) {
      const { rows } = await pool.query(
        `${SELECT_BASE}
         WHERE a.empresa_id = $1
           AND a.data = $2
         ORDER BY a.hora ASC`,
        [empresaId, data]
      );

      return res.json(rows);
    }

    if (de && ate) {
      const { rows } = await pool.query(
        `${SELECT_BASE}
         WHERE a.empresa_id = $1
           AND a.data BETWEEN $2 AND $3
         ORDER BY a.data ASC, a.hora ASC`,
        [empresaId, de, ate]
      );

      return res.json(rows);
    }

    const { rows } = await pool.query(
      `${SELECT_BASE}
       WHERE a.empresa_id = $1
       ORDER BY a.data ASC, a.hora ASC`,
      [empresaId]
    );

    res.json(rows);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      erro: 'Não foi possível carregar os agendamentos.'
    });
  }
});


// ============================================================
// POST /api/agendamentos
// ============================================================

router.post('/', async (req, res) => {

  const empresaId = req.usuario.empresa_id;

  const {
    cliente,
    telefone,
    veiculo,
    placa,
    servico_id,
    data,
    hora,
    valor,
    observacoes
  } = req.body;

  if (!cliente || !data || !hora || !servico_id) {
    return res.status(400).json({
      erro: 'Informe cliente, serviço, data e hora.'
    });
  }

  try {

    // Garante que o serviço pertence à empresa logada
    const servico = await pool.query(
      `SELECT id
       FROM servicos
       WHERE id = $1
         AND empresa_id = $2
         AND ativo = TRUE`,
      [servico_id, empresaId]
    );

    if (servico.rows.length === 0) {
      return res.status(400).json({
        erro: 'Serviço não encontrado para esta empresa.'
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO agendamentos
        (
          empresa_id,
          cliente,
          telefone,
          veiculo,
          placa,
          servico_id,
          data,
          hora,
          valor,
          observacoes
        )
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        empresaId,
        cliente,
        telefone || null,
        veiculo || null,
        placa || null,
        servico_id,
        data,
        hora,
        valor || 0,
        observacoes || null
      ]
    );

    res.status(201).json(rows[0]);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      erro: 'Não foi possível criar o agendamento.'
    });
  }
});


// ============================================================
// PATCH /api/agendamentos/:id
// ============================================================

router.patch('/:id', async (req, res) => {

  const { id } = req.params;
  const empresaId = req.usuario.empresa_id;

  try {

    // Verifica se o agendamento pertence à empresa
    const existente = await pool.query(
      `SELECT *
       FROM agendamentos
       WHERE id = $1
         AND empresa_id = $2`,
      [id, empresaId]
    );

    if (existente.rows.length === 0) {
      return res.status(404).json({
        erro: 'Agendamento não encontrado.'
      });
    }

    // Verifica alteração de forma de pagamento
    if (
      req.body.forma_pagamento !== undefined &&
      req.body.status_pagamento === undefined
    ) {

      const atual = existente.rows[0];

      if (atual.status_pagamento === 'pago') {
        return res.status(400).json({
          erro: 'Pagamento já confirmado — desfaça a confirmação antes de trocar a forma de pagamento.'
        });
      }
    }


    // Se estiver alterando o serviço,
    // garante que pertence à mesma empresa
    if (req.body.servico_id !== undefined) {

      const servico = await pool.query(
        `SELECT id
         FROM servicos
         WHERE id = $1
           AND empresa_id = $2
           AND ativo = TRUE`,
        [req.body.servico_id, empresaId]
      );

      if (servico.rows.length === 0) {
        return res.status(400).json({
          erro: 'Serviço não encontrado para esta empresa.'
        });
      }
    }


    const campos = [
      'cliente',
      'telefone',
      'veiculo',
      'placa',
      'servico_id',
      'data',
      'hora',
      'valor',
      'status',
      'status_pagamento',
      'forma_pagamento',
      'observacoes'
    ];

    const sets = [];
    const valores = [];

    let i = 1;

    for (const campo of campos) {

      if (req.body[campo] !== undefined) {

        sets.push(`${campo} = $${i}`);

        valores.push(req.body[campo]);

        i++;
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({
        erro: 'Nenhum campo para atualizar.'
      });
    }

    valores.push(id);
    valores.push(empresaId);

    const { rows } = await pool.query(
      `UPDATE agendamentos
       SET ${sets.join(', ')}
       WHERE id = $${i}
         AND empresa_id = $${i + 1}
       RETURNING *`,
      valores
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Agendamento não encontrado.'
      });
    }

    res.json(rows[0]);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      erro: 'Não foi possível atualizar o agendamento.'
    });
  }
});


// ============================================================
// DELETE /api/agendamentos/:id
// ============================================================

router.delete('/:id', async (req, res) => {

  const { id } = req.params;
  const empresaId = req.usuario.empresa_id;

  try {

    const resultado = await pool.query(
      `DELETE FROM agendamentos
       WHERE id = $1
         AND empresa_id = $2`,
      [id, empresaId]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        erro: 'Agendamento não encontrado.'
      });
    }

    res.status(204).end();

  } catch (err) {

    console.error(err);

    res.status(500).json({
      erro: 'Não foi possível remover o agendamento.'
    });
  }
});


module.exports = router;