const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const exigirPermissao = require('../middleware/permissao');

const router = express.Router();

// Todas as rotas de serviços exigem autenticação
router.use(autenticar);


// ============================================================
// GET /api/servicos
// Lista somente os serviços ativos da empresa logada
// ============================================================

router.get('/', async (req, res) => {

  const empresaId = req.usuario.empresa_id;

  try {

    const { rows } = await pool.query(
      `SELECT *
       FROM servicos
       WHERE empresa_id = $1
         AND ativo = TRUE
       ORDER BY nome ASC`,
      [empresaId]
    );

    res.json(rows);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      erro: 'Não foi possível carregar os serviços.'
    });
  }
});


// ============================================================
// POST /api/servicos
// ============================================================

router.post('/', async (req, res) => {

  const empresaId = req.usuario.empresa_id;

  const {
    nome,
    preco,
    duracao_min
  } = req.body;

  if (!nome || preco == null) {
    return res.status(400).json({
      erro: 'Informe nome e preço do serviço.'
    });
  }

  try {

    const { rows } = await pool.query(
      `INSERT INTO servicos
        (
          empresa_id,
          nome,
          preco,
          duracao_min
        )
       VALUES
        ($1,$2,$3,$4)
       RETURNING *`,
      [
        empresaId,
        nome,
        preco,
        duracao_min || 0
      ]
    );

    res.status(201).json(rows[0]);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      erro: 'Não foi possível criar o serviço.'
    });
  }
});


// ============================================================
// PUT /api/servicos/:id
// ============================================================

router.put('/:id', async (req, res) => {

  const { id } = req.params;
  const empresaId = req.usuario.empresa_id;

  const {
    nome,
    preco,
    duracao_min
  } = req.body;

  try {

    const { rows } = await pool.query(
      `UPDATE servicos
       SET
         nome = $1,
         preco = $2,
         duracao_min = $3
       WHERE id = $4
         AND empresa_id = $5
       RETURNING *`,
      [
        nome,
        preco,
        duracao_min || 0,
        id,
        empresaId
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Serviço não encontrado.'
      });
    }

    res.json(rows[0]);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      erro: 'Não foi possível atualizar o serviço.'
    });
  }
});


// ============================================================
// DELETE /api/servicos/:id
// ============================================================

router.delete('/:id', async (req, res) => {

  const { id } = req.params;
  const empresaId = req.usuario.empresa_id;

  try {

    const resultado = await pool.query(
      `DELETE FROM servicos
       WHERE id = $1
         AND empresa_id = $2`,
      [id, empresaId]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        erro: 'Serviço não encontrado.'
      });
    }

    res.status(204).end();

  } catch (err) {

    console.error(err);

    res.status(500).json({
      erro: 'Não foi possível remover o serviço.'
    });
  }
});


module.exports = router;