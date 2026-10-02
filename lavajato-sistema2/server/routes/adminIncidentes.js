const express = require('express');

const pool = require('../db');
const autenticar = require('../middleware/auth');
const somenteDev = require('../middleware/dev');

const router = express.Router();

// ============================================================
// AUTENTICAÇÃO
// ============================================================

router.use(autenticar);
router.use(somenteDev);

// ============================================================
// LISTAR INCIDENTES
// ============================================================

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        titulo,
        tipo,
        descricao,
        data_identificacao,
        sistemas_afetados,
        dados_afetados,
        titulares_afetados,
        gravidade,
        medidas_adotadas,
        status,
        responsavel,
        conclusao,
        criado_em,
        atualizado_em
      FROM incidentes_seguranca
      ORDER BY
        CASE
          WHEN status = 'aberto' THEN 1
          WHEN status = 'em_analise' THEN 2
          WHEN status = 'contido' THEN 3
          WHEN status = 'resolvido' THEN 4
          WHEN status = 'encerrado' THEN 5
          ELSE 6
        END,
        data_identificacao DESC
      `
    );

    res.json(rows);

  } catch (err) {
    console.error(
      'Erro ao listar incidentes de segurança:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível carregar os incidentes.'
    });
  }
});

// ============================================================
// BUSCAR INCIDENTE
// ============================================================

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        titulo,
        tipo,
        descricao,
        data_identificacao,
        sistemas_afetados,
        dados_afetados,
        titulares_afetados,
        gravidade,
        medidas_adotadas,
        status,
        responsavel,
        conclusao,
        criado_em,
        atualizado_em
      FROM incidentes_seguranca
      WHERE id = $1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        erro: 'Incidente não encontrado.'
      });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error(
      'Erro ao buscar incidente:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível carregar o incidente.'
    });
  }
});

// ============================================================
// CRIAR INCIDENTE
// ============================================================

router.post('/', async (req, res) => {
  const {
    titulo,
    tipo,
    descricao,
    data_identificacao,
    sistemas_afetados,
    dados_afetados,
    titulares_afetados,
    gravidade,
    medidas_adotadas,
    status,
    responsavel,
    conclusao
  } = req.body;

  if (!titulo || !titulo.trim()) {
    return res.status(400).json({
      erro: 'O título do incidente é obrigatório.'
    });
  }

  if (!tipo || !tipo.trim()) {
    return res.status(400).json({
      erro: 'O tipo do incidente é obrigatório.'
    });
  }

  if (!descricao || !descricao.trim()) {
    return res.status(400).json({
      erro: 'A descrição do incidente é obrigatória.'
    });
  }

  const gravidadeFinal = gravidade || 'media';
  const statusFinal = status || 'aberto';

  const gravidadesValidas = [
    'baixa',
    'media',
    'alta',
    'critica'
  ];

  const statusValidos = [
    'aberto',
    'em_analise',
    'contido',
    'resolvido',
    'encerrado'
  ];

  if (!gravidadesValidas.includes(gravidadeFinal)) {
    return res.status(400).json({
      erro: 'Gravidade do incidente inválida.'
    });
  }

  if (!statusValidos.includes(statusFinal)) {
    return res.status(400).json({
      erro: 'Status do incidente inválido.'
    });
  }

  let titulares = null;

  if (
    titulares_afetados !== undefined &&
    titulares_afetados !== null &&
    titulares_afetados !== ''
  ) {
    titulares = Number(titulares_afetados);

    if (
      !Number.isInteger(titulares) ||
      titulares < 0
    ) {
      return res.status(400).json({
        erro: 'Quantidade de titulares afetados inválida.'
      });
    }
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO incidentes_seguranca (
        titulo,
        tipo,
        descricao,
        data_identificacao,
        sistemas_afetados,
        dados_afetados,
        titulares_afetados,
        gravidade,
        medidas_adotadas,
        status,
        responsavel,
        conclusao
      )
      VALUES (
        $1,
        $2,
        $3,
        COALESCE($4::timestamp, CURRENT_TIMESTAMP),
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12
      )
      RETURNING *
      `,
      [
        titulo.trim(),
        tipo.trim(),
        descricao.trim(),
        data_identificacao || null,
        sistemas_afetados?.trim() || null,
        dados_afetados?.trim() || null,
        titulares,
        gravidadeFinal,
        medidas_adotadas?.trim() || null,
        statusFinal,
        responsavel?.trim() || null,
        conclusao?.trim() || null
      ]
    );

    res.status(201).json(rows[0]);

  } catch (err) {
    console.error(
      'Erro ao criar incidente de segurança:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível registrar o incidente.'
    });
  }
});

// ============================================================
// ATUALIZAR INCIDENTE
// ============================================================

router.patch('/:id', async (req, res) => {
  const { id } = req.params;

  const {
    titulo,
    tipo,
    descricao,
    data_identificacao,
    sistemas_afetados,
    dados_afetados,
    titulares_afetados,
    gravidade,
    medidas_adotadas,
    status,
    responsavel,
    conclusao
  } = req.body;

  if (!titulo || !titulo.trim()) {
    return res.status(400).json({
      erro: 'O título do incidente é obrigatório.'
    });
  }

  if (!tipo || !tipo.trim()) {
    return res.status(400).json({
      erro: 'O tipo do incidente é obrigatório.'
    });
  }

  if (!descricao || !descricao.trim()) {
    return res.status(400).json({
      erro: 'A descrição do incidente é obrigatória.'
    });
  }

  const gravidadesValidas = [
    'baixa',
    'media',
    'alta',
    'critica'
  ];

  const statusValidos = [
    'aberto',
    'em_analise',
    'contido',
    'resolvido',
    'encerrado'
  ];

  const gravidadeFinal = gravidade || 'media';
  const statusFinal = status || 'aberto';

  if (!gravidadesValidas.includes(gravidadeFinal)) {
    return res.status(400).json({
      erro: 'Gravidade do incidente inválida.'
    });
  }

  if (!statusValidos.includes(statusFinal)) {
    return res.status(400).json({
      erro: 'Status do incidente inválido.'
    });
  }

  let titulares = null;

  if (
    titulares_afetados !== undefined &&
    titulares_afetados !== null &&
    titulares_afetados !== ''
  ) {
    titulares = Number(titulares_afetados);

    if (
      !Number.isInteger(titulares) ||
      titulares < 0
    ) {
      return res.status(400).json({
        erro: 'Quantidade de titulares afetados inválida.'
      });
    }
  }

  try {
    const { rows } = await pool.query(
      `
      UPDATE incidentes_seguranca
      SET
        titulo = $1,
        tipo = $2,
        descricao = $3,
        data_identificacao = COALESCE(
          $4::timestamp,
          data_identificacao
        ),
        sistemas_afetados = $5,
        dados_afetados = $6,
        titulares_afetados = $7,
        gravidade = $8,
        medidas_adotadas = $9,
        status = $10,
        responsavel = $11,
        conclusao = $12,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *
      `,
      [
        titulo.trim(),
        tipo.trim(),
        descricao.trim(),
        data_identificacao || null,
        sistemas_afetados?.trim() || null,
        dados_afetados?.trim() || null,
        titulares,
        gravidadeFinal,
        medidas_adotadas?.trim() || null,
        statusFinal,
        responsavel?.trim() || null,
        conclusao?.trim() || null,
        id
      ]
    );

    if (!rows.length) {
      return res.status(404).json({
        erro: 'Incidente não encontrado.'
      });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error(
      'Erro ao atualizar incidente:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível atualizar o incidente.'
    });
  }
});

// ============================================================
// EXCLUIR INCIDENTE
// ============================================================

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      DELETE FROM incidentes_seguranca
      WHERE id = $1
      `,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        erro: 'Incidente não encontrado.'
      });
    }

    res.json({
      sucesso: true,
      mensagem: 'Incidente excluído com sucesso.'
    });

  } catch (err) {
    console.error(
      'Erro ao excluir incidente:',
      err
    );

    res.status(500).json({
      erro: 'Não foi possível excluir o incidente.'
    });
  }
});

module.exports = router;
