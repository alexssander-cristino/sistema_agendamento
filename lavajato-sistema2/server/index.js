require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const servicosRouter = require('./routes/servicos');
const agendamentosRouter = require('./routes/agendamentos');
const despesasRouter = require('./routes/despesas');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

// ============================================================
// STATUS
// ============================================================

app.get('/api/status', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      banco: 'conectado'
    });
  } catch (err) {
    res.status(500).json({
      banco: 'erro',
      detalhe: err.message
    });
  }
});

// ============================================================
// FRONT-END
// ============================================================

app.use(
  express.static(
    path.join(__dirname, '..', 'public')
  )
);

app.get('*', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '..',
      'public',
      'index.html'
    )
  );
});

// ============================================================
// SERVIDOR
// ============================================================

app.listen(PORT, () => {  
  console.log(`Lavajato rodando em http://localhost:${PORT}`);
});