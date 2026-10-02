require('dotenv').config();

const { Pool, types } = require('pg');

// PostgreSQL DATE como string YYYY-MM-DD
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false
  },

  // Vercel = serverless
  // Pool pequeno para não abrir várias conexões por instância
  max: 1,

  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

if (!process.env.DATABASE_URL) {
  console.error(
    'ERRO: DATABASE_URL não foi definida nas variáveis de ambiente.'
  );
}

pool.on('error', (err) => {
  console.error(
    'Erro inesperado no pool do PostgreSQL:',
    err.message
  );
});

module.exports = pool;

