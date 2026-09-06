const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/servicos — lista todos os serviços ativos
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM servicos WHERE ativo = TRUE ORDER BY nome ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível carregar os serviços.' });
  }
});

// POST /api/servicos — cria um novo serviço
router.post('/', async (req, res) => {
  const { nome, preco, duracao_min } = req.body;
  if (!nome || preco == null) {
    return res.status(400).json({ erro: 'Informe nome e preço do serviço.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO servicos (nome, preco, duracao_min) VALUES ($1, $2, $3) RETURNING *`,
      [nome, preco, duracao_min || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível criar o serviço.' });
  }
});

// PUT /api/servicos/:id — edita um serviço (nome, preço, duração)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, preco, duracao_min } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE servicos SET nome = $1, preco = $2, duracao_min = $3 WHERE id = $4 RETURNING *`,
      [nome, preco, duracao_min || 0, id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Serviço não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível atualizar o serviço.' });
  }
});

// DELETE /api/servicos/:id — remove definitivamente o serviço
// (agendamentos que já usam esse serviço continuam existindo; o vínculo
// simplesmente vira NULL, graças ao ON DELETE SET NULL no banco)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM servicos WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível remover o serviço.' });
  }
});

module.exports = router;
