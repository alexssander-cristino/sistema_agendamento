require('dotenv').config();

const { Pool, types } = require('pg');

// PostgreSQL DATE como texto YYYY-MM-DD
// Evita problemas de timezone/Invalid Date no frontend.
types.setTypeParser(1082, (val) => val);

const isProduction = process.env.NODE_ENV === 'production';

// ============================================================
// CONFIGURAÇÃO DO BANCO
// ============================================================

const poolConfig = {
  connectionString: process.env.DATABASE_URL,

  // Supabase normalmente exige SSL.
  ssl: isProduction
    ? {
        rejectUnauthorized: false,
      }
    : false,

  max: 10,

  idleTimeoutMillis: 30000,

  connectionTimeoutMillis: 10000,
};

// ============================================================
// VALIDAÇÃO
// ============================================================

if (!process.env.DATABASE_URL) {
  console.error(
    'ERRO: DATABASE_URL não foi definida nas variáveis de ambiente.'
  );
}

// ============================================================
// POOL
// ============================================================

const pool = new Pool(poolConfig);

// ============================================================
// ERROS DO POOL
// ============================================================

pool.on('error', (err) => {
  console.error(
    'Erro inesperado no pool do PostgreSQL:',
    err.message
  );
});

// ============================================================
// EXPORT
// ============================================================

module.exports = pool;