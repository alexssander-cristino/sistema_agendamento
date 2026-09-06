const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/despesas
// Filtros opcionais: ?de=YYYY-MM-DD&ate=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { de, ate } = req.query;
  try {
    if (de && ate) {
      const { rows } = await pool.query(
        'SELECT * FROM despesas WHERE data BETWEEN $1 AND $2 ORDER BY data DESC, id DESC',
        [de, ate]
      );
      return res.json(rows);
    }
    const { rows } = await pool.query('SELECT * FROM despesas ORDER BY data DESC, id DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível carregar as despesas.' });
  }
});

// POST /api/despesas — cria uma nova despesa
router.post('/', async (req, res) => {
  const { descricao, categoria, valor, data, observacoes } = req.body;
  if (!descricao || valor == null || !data) {
    return res.status(400).json({ erro: 'Informe descrição, valor e data da despesa.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO despesas (descricao, categoria, valor, data, observacoes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [descricao, categoria || 'Outros', valor, data, observacoes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível criar a despesa.' });
  }
});

// PUT /api/despesas/:id — edita uma despesa
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { descricao, categoria, valor, data, observacoes } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE despesas SET descricao=$1, categoria=$2, valor=$3, data=$4, observacoes=$5
       WHERE id=$6 RETURNING *`,
      [descricao, categoria || 'Outros', valor, data, observacoes || null, id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Despesa não encontrada.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível atualizar a despesa.' });
  }
});

// DELETE /api/despesas/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM despesas WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível remover a despesa.' });
  }
});

module.exports = router;
