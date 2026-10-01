require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db');

// ============================================================
// ROTAS
// ============================================================

const servicosRouter = require('./routes/servicos');
const agendamentosRouter = require('./routes/agendamentos');
const despesasRouter = require('./routes/despesas');
const authRouter = require('./routes/auth');
const usuariosRouter = require('./routes/usuarios');
const configuracoesRouter = require('./routes/configuracoes');

// ============================================================
// APP
// ============================================================

const app = express();

const PORT = process.env.PORT || 3000;

// ============================================================
// CORS
// ============================================================

const corsOrigin = process.env.CORS_ORIGIN;

if (corsOrigin) {
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    })
  );
} else {
  // Desenvolvimento local
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
}

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

// ============================================================
// AUTENTICAÇÃO
// ============================================================

app.use('/api/auth', authRouter);

// ============================================================
// API
// ============================================================

app.use('/api/servicos', servicosRouter);

app.use('/api/agendamentos', agendamentosRouter);

app.use('/api/despesas', despesasRouter);

app.use('/api/usuarios', usuariosRouter);

app.use('/api/configuracoes', configuracoesRouter);

// ============================================================
// STATUS DA API
// ============================================================

app.get('/api/status', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.status(200).json({
      ok: true,
      banco: 'conectado',
      ambiente: process.env.NODE_ENV || 'development',
    });
  } catch (err) {
    console.error(
      'Erro ao verificar banco:',
      err.message
    );

    res.status(500).json({
      ok: false,
      banco: 'erro',
      detalhe:
        process.env.NODE_ENV === 'production'
          ? 'Erro ao conectar ao banco de dados.'
          : err.message,
    });
  }
});

// ============================================================
// FRONT-END
// ============================================================

const publicPath = path.join(
  __dirname,
  '..',
  'public'
);

app.use(express.static(publicPath));

// ============================================================
// FALLBACK DO FRONTEND
// ============================================================

app.get('*', (req, res) => {
  // Não intercepta rotas da API
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      erro: 'Rota da API não encontrada.',
    });
  }

  res.sendFile(
    path.join(
      publicPath,
      'index.html'
    )
  );
});

// ============================================================
// TRATAMENTO DE ERROS
// ============================================================

app.use((err, req, res, next) => {
  console.error(
    'Erro interno:',
    err
  );

  res.status(500).json({
    erro:
      process.env.NODE_ENV === 'production'
        ? 'Erro interno do servidor.'
        : err.message,
  });
});

// ============================================================
// SERVIDOR
// ============================================================

// O Vercel consegue executar a aplicação Express.
// Mantemos o listen para continuar funcionando
// normalmente quando executado localmente.

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(
      `Lavajato rodando em http://localhost:${PORT}`
    );
  });
}

// ============================================================
// EXPORT
// ============================================================

module.exports = app;