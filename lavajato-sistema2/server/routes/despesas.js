const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const exigirPermissao = require('../middleware/permissao');

const router = express.Router();

// Todas as rotas de despesas exigem autenticação
router.use(autenticar);


// ============================================================
// GET /api/despesas
// ============================================================

router.get('/', async (req, res) => {

  const { de, ate } = req.query;
  const empresaId = req.usuario.empresa_id;

  try {

    if (de && ate) {

      const { rows } = await pool.query(
        `SELECT *
         FROM despesas
         WHERE empresa_id = $1
           AND data BETWEEN $2 AND $3
         ORDER BY data DESC, id DESC`,
        [empresaId, de, ate]
      );

      return res.json(rows);
    }

    const { rows } = await pool.query(
      `SELECT *
       FROM despesas
       WHERE empresa_id = $1
       ORDER BY data DESC, id DESC`,
      [empresaId]
    );

    res.json(rows);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      erro: 'Não foi possível carregar as despesas.'
    });
  }
});


// ============================================================
// POST /api/despesas
// ============================================================

router.post('/', async (req, res) => {

  const empresaId = req.usuario.empresa_id;

  const {
    descricao,
    categoria,
    valor,
    data,
    observacoes
  } = req.body;

  if (!descricao || valor == null || !data) {
    return res.status(400).json({
      erro: 'Informe descrição, valor e data da despesa.'
    });
  }

  try {

    const { rows } = await pool.query(
      `INSERT INTO despesas
        (
          empresa_id,
          descricao,
          categoria,
          valor,
          data,
          observacoes
        )
       VALUES
        ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        empresaId,
        descricao,
        categoria || 'Outros',
        valor,
        data,
        observacoes || null
      ]
    );

    res.status(201).json(rows[0]);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      erro: 'Não foi possível criar a despesa.'
    });
  }
});


// ============================================================
// PUT /api/despesas/:id
// ============================================================

router.put('/:id', async (req, res) => {

  const { id } = req.params;
  const empresaId = req.usuario.empresa_id;

  const {
    descricao,
    categoria,
    valor,
    data,
    observacoes
  } = req.body;

  try {

    const { rows } = await pool.query(
      `UPDATE despesas
       SET
         descricao = $1,
         categoria = $2,
         valor = $3,
         data = $4,
         observacoes = $5
       WHERE id = $6
         AND empresa_id = $7
       RETURNING *`,
      [
        descricao,
        categoria || 'Outros',
        valor,
        data,
        observacoes || null,
        id,
        empresaId
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Despesa não encontrada.'
      });
    }

    res.json(rows[0]);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      erro: 'Não foi possível atualizar a despesa.'
    });
  }
});


// ============================================================
// DELETE /api/despesas/:id
// ============================================================

router.delete('/:id', async (req, res) => {

  const { id } = req.params;
  const empresaId = req.usuario.empresa_id;

  try {

    const resultado = await pool.query(
      `DELETE FROM despesas
       WHERE id = $1
         AND empresa_id = $2`,
      [id, empresaId]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        erro: 'Despesa não encontrada.'
      });
    }

    res.status(204).end();

  } catch (err) {

    console.error(err);

    res.status(500).json({
      erro: 'Não foi possível remover a despesa.'
    });
  }
});


module.exports = router;