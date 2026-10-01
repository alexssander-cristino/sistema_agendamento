require('dotenv').config();

const { Pool, types } = require('pg');

// PostgreSQL DATE como texto YYYY-MM-DD
types.setTypeParser(1082, (val) => val);

const isProduction = process.env.NODE_ENV === 'production';

const poolConfig = {
  connectionString: process.env.DATABASE_URL,

  ssl: isProduction
    ? {
        rejectUnauthorized: false,
      }
    : false,

  // Vercel + Supabase
  max: 5,

  idleTimeoutMillis: 10000,

  connectionTimeoutMillis: 10000,
};

if (!process.env.DATABASE_URL) {
  console.error(
    'ERRO: DATABASE_URL não foi definida nas variáveis de ambiente.'
  );
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error(
    'Erro inesperado no pool do PostgreSQL:',
    err.message
  );
});

module.exports = pool;