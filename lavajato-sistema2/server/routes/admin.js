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
// DASHBOARD
// ============================================================

router.get('/dashboard', async (req, res) => {
  try {
    const [
      empresasResult,
      usuariosResult,
      administradoresResult,
      funcionariosResult,
      planosResult,
      planosAtivosResult,
      assinaturasResult,
      assinaturasAtivasResult,
      assinaturasPendentesResult,
      assinaturasInadimplentesResult
    ] = await Promise.all([

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM empresas
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM usuarios
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM usuarios
        WHERE perfil = 'administrador'
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM usuarios
        WHERE perfil = 'funcionario'
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM planos
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM planos
        WHERE ativo = TRUE
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM assinaturas
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM assinaturas
        WHERE status = 'ativa'
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM assinaturas
        WHERE status = 'pendente'
      `),

      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM assinaturas
        WHERE status = 'inadimplente'
      `)

    ]);

    return res.json({
      empresas: {
        total: empresasResult.rows[0].total
      },

      usuarios: {
        total: usuariosResult.rows[0].total,
        administradores:
          administradoresResult.rows[0].total,
        funcionarios:
          funcionariosResult.rows[0].total
      },

      planos: {
        total: planosResult.rows[0].total,
        ativos: planosAtivosResult.rows[0].total
      },

      assinaturas: {
        total: assinaturasResult.rows[0].total,
        ativas:
          assinaturasAtivasResult.rows[0].total,
        pendentes:
          assinaturasPendentesResult.rows[0].total,
        inadimplentes:
          assinaturasInadimplentesResult.rows[0].total
      }
    });

  } catch (err) {
    console.error(
      'Erro ao carregar dashboard DEV:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível carregar o dashboard.'
    });
  }
});

// ============================================================
// STATUS DO SISTEMA
// ============================================================

router.get('/status', async (req, res) => {
  try {
    const inicio = Date.now();

    await pool.query('SELECT 1');

    const tempoResposta =
      Date.now() - inicio;

    return res.json({
      banco: 'online',
      api: 'online',
      tempo_resposta_ms: tempoResposta,
      ambiente:
        process.env.NODE_ENV || 'development'
    });

  } catch (err) {
    console.error(
      'Erro no status do sistema:',
      err
    );

    return res.status(500).json({
      banco: 'offline',
      api: 'online',
      ambiente:
        process.env.NODE_ENV || 'development'
    });
  }
});

module.exports = router;