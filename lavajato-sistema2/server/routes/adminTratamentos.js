const express = require('express');

const pool = require('../db');
const autenticar = require('../middleware/auth');
const somenteDev = require('../middleware/dev');

const router = express.Router();

// ============================================================
// PROTEÇÃO
// ============================================================

router.use(autenticar);
router.use(somenteDev);

// ============================================================
// LISTAR
// GET /api/admin/tratamentos
// ============================================================

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        processo,
        finalidade,
        hipotese_legal,
        dados_pessoais,
        categorias_titulares,
        compartilhamento,
        periodo_armazenamento,
        medidas_seguranca,
        observacoes,
        ativo,
        criado_em,
        atualizado_em
      FROM registros_tratamento
      ORDER BY
        ativo DESC,
        processo ASC,
        id ASC
      `
    );

    res.json(rows);

  } catch (err) {
    console.error(
      'Erro ao listar registros de tratamento:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível carregar os registros.'
    });
  }
});

// ============================================================
// CONSULTAR
// GET /api/admin/tratamentos/:id
// ============================================================

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      erro: 'ID do registro inválido.'
    });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        processo,
        finalidade,
        hipotese_legal,
        dados_pessoais,
        categorias_titulares,
        compartilhamento,
        periodo_armazenamento,
        medidas_seguranca,
        observacoes,
        ativo,
        criado_em,
        atualizado_em
      FROM registros_tratamento
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Registro não encontrado.'
      });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error(
      'Erro ao consultar registro de tratamento:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível consultar o registro.'
    });
  }
});

// ============================================================
// CRIAR
// POST /api/admin/tratamentos
// ============================================================

router.post('/', async (req, res) => {
  const {
    processo,
    finalidade,
    hipotese_legal,
    dados_pessoais,
    categorias_titulares,
    compartilhamento,
    periodo_armazenamento,
    medidas_seguranca,
    observacoes,
    ativo
  } = req.body;

  if (
    !processo ||
    typeof processo !== 'string' ||
    !processo.trim()
  ) {
    return res.status(400).json({
      erro: 'O processo é obrigatório.'
    });
  }

  if (
    !finalidade ||
    typeof finalidade !== 'string' ||
    !finalidade.trim()
  ) {
    return res.status(400).json({
      erro: 'A finalidade é obrigatória.'
    });
  }

  if (
    !hipotese_legal ||
    typeof hipotese_legal !== 'string' ||
    !hipotese_legal.trim()
  ) {
    return res.status(400).json({
      erro: 'A hipótese legal é obrigatória.'
    });
  }

  if (
    !dados_pessoais ||
    typeof dados_pessoais !== 'string' ||
    !dados_pessoais.trim()
  ) {
    return res.status(400).json({
      erro: 'Os dados pessoais são obrigatórios.'
    });
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO registros_tratamento (
        processo,
        finalidade,
        hipotese_legal,
        dados_pessoais,
        categorias_titulares,
        compartilhamento,
        periodo_armazenamento,
        medidas_seguranca,
        observacoes,
        ativo
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10
      )
      RETURNING *
      `,
      [
        processo.trim(),
        finalidade.trim(),
        hipotese_legal.trim(),
        dados_pessoais.trim(),
        categorias_titulares?.trim() || null,
        compartilhamento?.trim() || null,
        periodo_armazenamento?.trim() || null,
        medidas_seguranca?.trim() || null,
        observacoes?.trim() || null,
        ativo !== false
      ]
    );

    res.status(201).json({
      mensagem: 'Registro criado com sucesso.',
      registro: rows[0]
    });

  } catch (err) {
    console.error(
      'Erro ao criar registro de tratamento:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível criar o registro.'
    });
  }
});

// ============================================================
// ATUALIZAR
// PATCH /api/admin/tratamentos/:id
// ============================================================

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      erro: 'ID do registro inválido.'
    });
  }

  const {
    processo,
    finalidade,
    hipotese_legal,
    dados_pessoais,
    categorias_titulares,
    compartilhamento,
    periodo_armazenamento,
    medidas_seguranca,
    observacoes,
    ativo
  } = req.body;

  if (
    !processo ||
    typeof processo !== 'string' ||
    !processo.trim()
  ) {
    return res.status(400).json({
      erro: 'O processo é obrigatório.'
    });
  }

  if (
    !finalidade ||
    typeof finalidade !== 'string' ||
    !finalidade.trim()
  ) {
    return res.status(400).json({
      erro: 'A finalidade é obrigatória.'
    });
  }

  if (
    !hipotese_legal ||
    typeof hipotese_legal !== 'string' ||
    !hipotese_legal.trim()
  ) {
    return res.status(400).json({
      erro: 'A hipótese legal é obrigatória.'
    });
  }

  if (
    !dados_pessoais ||
    typeof dados_pessoais !== 'string' ||
    !dados_pessoais.trim()
  ) {
    return res.status(400).json({
      erro: 'Os dados pessoais são obrigatórios.'
    });
  }

  try {
    const { rows } = await pool.query(
      `
      UPDATE registros_tratamento

      SET
        processo = $1,
        finalidade = $2,
        hipotese_legal = $3,
        dados_pessoais = $4,
        categorias_titulares = $5,
        compartilhamento = $6,
        periodo_armazenamento = $7,
        medidas_seguranca = $8,
        observacoes = $9,
        ativo = $10,
        atualizado_em = CURRENT_TIMESTAMP

      WHERE id = $11

      RETURNING *
      `,
      [
        processo.trim(),
        finalidade.trim(),
        hipotese_legal.trim(),
        dados_pessoais.trim(),
        categorias_titulares?.trim() || null,
        compartilhamento?.trim() || null,
        periodo_armazenamento?.trim() || null,
        medidas_seguranca?.trim() || null,
        observacoes?.trim() || null,
        ativo !== false,
        id
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Registro não encontrado.'
      });
    }

    res.json({
      mensagem: 'Registro atualizado com sucesso.',
      registro: rows[0]
    });

  } catch (err) {
    console.error(
      'Erro ao atualizar registro de tratamento:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível atualizar o registro.'
    });
  }
});

// ============================================================
// EXCLUIR
// DELETE /api/admin/tratamentos/:id
// ============================================================

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      erro: 'ID do registro inválido.'
    });
  }

  try {
    const { rows } = await pool.query(
      `
      DELETE FROM registros_tratamento
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Registro não encontrado.'
      });
    }

    res.json({
      mensagem: 'Registro excluído com sucesso.'
    });

  } catch (err) {
    console.error(
      'Erro ao excluir registro de tratamento:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível excluir o registro.'
    });
  }
});

// ============================================================
// EXPORT
// ============================================================

module.exports = router;
