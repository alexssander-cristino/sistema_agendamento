require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const registrarLogs = require('./middleware/logger');

// ============================================================
// ROTAS
// ============================================================

const servicosRouter = require('./routes/servicos');
const agendamentosRouter = require('./routes/agendamentos');
const despesasRouter = require('./routes/despesas');
const authRouter = require('./routes/auth');
const usuariosRouter = require('./routes/usuarios');
const configuracoesRouter = require('./routes/configuracoes');
const planosRouter = require('./routes/planos');
const adminRouter = require('./routes/admin');
const mercadoPagoRouter = require('./routes/mercadoPago')
const mercadoPagoWebhookRouter = require('./routes/mercadoPagoWebhook')
const adminAssinaturasRouter = require('./routes/adminAssinaturas');
const privacidadeRouter = require('./routes/privacidade');
const adminPrivacidadeRouter = require('./routes/adminPrivacidade');


// ============================================================
// APP
// ============================================================

const app = express();

const PORT = process.env.PORT || 3000;

// ============================================================
// CORS
// ============================================================

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(registrarLogs);



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

app.use('/api/planos', planosRouter);

app.use('/api/admin', adminRouter);

app.use('/api/mercado-pago', mercadoPagoRouter);

app.use('/api/mercado-pago/webhook', mercadoPagoWebhookRouter);

app.use('/api/admin/assinaturas', adminAssinaturasRouter);

app.use('/api/admin/privacidade', adminPrivacidadeRouter);

app.use('/api/privacidade', privacidadeRouter);


// ============================================================
// STATUS
// ============================================================

app.get('/api/status', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.status(200).json({
      ok: true,
      banco: 'conectado',
      ambiente: process.env.NODE_ENV || 'development'
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
          : err.message
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
// FALLBACK
// ============================================================

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      erro: 'Rota da API não encontrada.'
    });
  }

  res.status(404).sendFile(
    path.join(publicPath, '404.html')
  );
});

// ============================================================
// ERROS
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
        : err.message
  });
});

// ============================================================
// SERVIDOR LOCAL
// ============================================================

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