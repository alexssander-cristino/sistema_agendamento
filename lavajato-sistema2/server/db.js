require('dotenv').config();
const { Pool, types } = require('pg');

// por padrão o node-postgres devolve colunas DATE como objeto Date (UTC),
// o que causa "Invalid Date" quando o front-end monta/compara strings
// "YYYY-MM-DD". Aqui forçamos o driver a devolver DATE como texto puro.
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'lavajato',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_HOST?.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err.message);
});

module.exports = pool;
