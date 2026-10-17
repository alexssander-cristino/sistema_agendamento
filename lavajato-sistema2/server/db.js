
'use strict';

require('dotenv').config();

const { Pool, types } = require('pg');

// PostgreSQL DATE como string YYYY-MM-DD.
types.setTypeParser(1082, (val) => val);

const producao = process.env.NODE_ENV === 'production';

if (!process.env.DATABASE_URL) {
  console.error(
    'ERRO: DATABASE_URL não foi definida nas variáveis de ambiente.'
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false
  },

  // Limite de conexões por instância.
  max: producao ? 3 : 5,

  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000
});

pool.on('error', (err) => {
  console.error(
    'Erro inesperado no pool do PostgreSQL:',
    err.message
  );
});

module.exports = pool;
