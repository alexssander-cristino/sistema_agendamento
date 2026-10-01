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
// LISTAR PLANOS
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
        criado_em,
        atualizado_em
      FROM planos
      ORDER BY id DESC
    `);

    return res.json(rows);

  } catch (err) {
    console.error('Erro ao listar planos:', err);

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
    console.error('Erro ao buscar plano:', err);

    return res.status(500).json({
      erro: 'Não foi possível buscar o plano.'
    });
  }
});

// ============================================================
// CRIAR PLANO
// ============================================================

router.post('/', async (req, res) => {
  try {
    const {
      nome,
      descricao,
      valor,
      periodo
    } = req.body;

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({
        erro: 'Informe o nome do plano.'
      });
    }

    if (
      valor === undefined ||
      valor === null ||
      valor === ''
    ) {
      return res.status(400).json({
        erro: 'Informe o valor do plano.'
      });
    }

    const valorNumerico = Number(valor);

    if (
      !Number.isFinite(valorNumerico) ||
      valorNumerico < 0
    ) {
      return res.status(400).json({
        erro: 'Informe um valor válido.'
      });
    }

    const periodoFinal = periodo || 'mensal';

    if (!['mensal', 'anual'].includes(periodoFinal)) {
      return res.status(400).json({
        erro: 'Período inválido.'
      });
    }

    const { rows } = await pool.query(
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

    return res.status(201).json(rows[0]);

  } catch (err) {
    console.error('Erro ao criar plano:', err);

    return res.status(500).json({
      erro: 'Não foi possível criar o plano.'
    });
  }
});

// ============================================================
// EDITAR PLANO
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

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({
        erro: 'Informe o nome do plano.'
      });
    }

    if (
      valor === undefined ||
      valor === null ||
      valor === ''
    ) {
      return res.status(400).json({
        erro: 'Informe o valor do plano.'
      });
    }

    const valorNumerico = Number(valor);

    if (
      !Number.isFinite(valorNumerico) ||
      valorNumerico < 0
    ) {
      return res.status(400).json({
        erro: 'Informe um valor válido.'
      });
    }

    const periodoFinal = periodo || 'mensal';

    if (!['mensal', 'anual'].includes(periodoFinal)) {
      return res.status(400).json({
        erro: 'Período inválido.'
      });
    }

    const { rows } = await pool.query(
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
    console.error('Erro ao editar plano:', err);

    return res.status(500).json({
      erro: 'Não foi possível editar o plano.'
    });
  }
});

// ============================================================
// ATIVAR / DESATIVAR
// ============================================================

router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { ativo } = req.body;

    if (typeof ativo !== 'boolean') {
      return res.status(400).json({
        erro: 'O campo ativo deve ser verdadeiro ou falso.'
      });
    }

    const { rows } = await pool.query(
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
      erro: 'Não foi possível alterar o status do plano.'
    });
  }
});

// ============================================================
// EXCLUIR PLANO
// ============================================================

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    /*
     * Plano que já possui assinatura não pode ser apagado.
     * Nesse caso, o correto é desativá-lo.
     */
    const { rows: assinaturas } = await pool.query(
      `
      SELECT id
      FROM assinaturas
      WHERE plano_id = $1
      LIMIT 1
      `,
      [id]
    );

    if (assinaturas.length > 0) {
      return res.status(409).json({
        erro:
          'Este plano possui assinaturas e não pode ser excluído. Desative o plano em vez disso.'
      });
    }

    const { rows } = await pool.query(
      `
      DELETE FROM planos
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        erro: 'Plano não encontrado.'
      });
    }

    return res.json({
      mensagem: 'Plano excluído com sucesso.'
    });

  } catch (err) {
    console.error('Erro ao excluir plano:', err);

    return res.status(500).json({
      erro: 'Não foi possível excluir o plano.'
    });
  }
});

module.exports = router;