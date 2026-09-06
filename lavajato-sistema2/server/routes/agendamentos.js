const express = require('express');
const pool = require('../db');

const router = express.Router();

const SELECT_BASE = `
  SELECT a.*, s.nome AS servico_nome
  FROM agendamentos a
  LEFT JOIN servicos s ON s.id = a.servico_id
`;

// GET /api/agendamentos
// Filtros opcionais via query string:
//   ?data=YYYY-MM-DD              → um dia específico
//   ?de=YYYY-MM-DD&ate=YYYY-MM-DD → intervalo de datas
//   ?busca=texto                  → procura em cliente, telefone e placa (todo o histórico)
router.get('/', async (req, res) => {
  const { data, de, ate, busca } = req.query;
  try {
    if (busca) {
      const termo = `%${busca}%`;
      const { rows } = await pool.query(
        `${SELECT_BASE} WHERE a.cliente ILIKE $1 OR a.telefone ILIKE $1 OR a.placa ILIKE $1
         ORDER BY a.data DESC, a.hora DESC`,
        [termo]
      );
      return res.json(rows);
    }
    if (data) {
      const { rows } = await pool.query(
        `${SELECT_BASE} WHERE a.data = $1 ORDER BY a.hora ASC`,
        [data]
      );
      return res.json(rows);
    }
    if (de && ate) {
      const { rows } = await pool.query(
        `${SELECT_BASE} WHERE a.data BETWEEN $1 AND $2 ORDER BY a.data ASC, a.hora ASC`,
        [de, ate]
      );
      return res.json(rows);
    }
    const { rows } = await pool.query(`${SELECT_BASE} ORDER BY a.data ASC, a.hora ASC`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível carregar os agendamentos.' });
  }
});

// POST /api/agendamentos — cria um novo agendamento
router.post('/', async (req, res) => {
  const { cliente, telefone, veiculo, placa, servico_id, data, hora, valor, observacoes } = req.body;
  if (!cliente || !data || !hora || !servico_id) {
    return res.status(400).json({ erro: 'Informe cliente, serviço, data e hora.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO agendamentos
        (cliente, telefone, veiculo, placa, servico_id, data, hora, valor, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [cliente, telefone || null, veiculo || null, placa || null, servico_id, data, hora, valor || 0, observacoes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível criar o agendamento.' });
  }
});

// PATCH /api/agendamentos/:id — atualiza campos parciais
// (status, status_pagamento, forma_pagamento, valor, etc.)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;

  // trava: não deixa mudar a forma de pagamento se o pagamento já foi
  // confirmado, a menos que esta mesma requisição também esteja
  // desfazendo a confirmação (voltando status_pagamento para 'pendente')
  if (req.body.forma_pagamento !== undefined && req.body.status_pagamento === undefined) {
    const atual = await pool.query('SELECT status_pagamento FROM agendamentos WHERE id = $1', [id]);
    if (atual.rows[0] && atual.rows[0].status_pagamento === 'pago') {
      return res.status(400).json({ erro: 'Pagamento já confirmado — desfaça a confirmação antes de trocar a forma de pagamento.' });
    }
  }

  const campos = [
    'cliente', 'telefone', 'veiculo', 'placa', 'servico_id',
    'data', 'hora', 'valor', 'status', 'status_pagamento',
    'forma_pagamento', 'observacoes'
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
    return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
  }
  valores.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE agendamentos SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      valores
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Agendamento não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível atualizar o agendamento.' });
  }
});

// DELETE /api/agendamentos/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM agendamentos WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível remover o agendamento.' });
  }
});

module.exports = router;
