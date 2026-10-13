
'use strict';

require('dotenv').config();

const pool = require('../server/db');
const gerarSlug = require('../server/utils/slugAgendamento');

async function executar() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const resultado = await client.query(`
      SELECT id, nome, nome_exibicao
      FROM empresas
      ORDER BY id
      FOR UPDATE
    `);

    const slugsUsados = new Set();

    for (const empresa of resultado.rows) {
      if (empresa.slug_agendamento) {
        slugsUsados.add(empresa.slug_agendamento);
      }
    }

    for (const empresa of resultado.rows) {
      if (empresa.slug_agendamento) {
        continue;
      }

      const nome =
        empresa.nome_exibicao?.trim() ||
        empresa.nome ||
        'empresa';

      const base = gerarSlug(nome);
      let slug = base;
      let contador = 2;

      while (slugsUsados.has(slug)) {
        const sufixo = `-${contador++}`;
        slug = `${base.slice(0, 180 - sufixo.length)}${sufixo}`;
      }

      await client.query(
        `UPDATE empresas
         SET slug_agendamento = $1
         WHERE id = $2`,
        [slug, empresa.id]
      );

      slugsUsados.add(slug);

      console.log(`Empresa ${empresa.id}: ${slug}`);
    }

    await client.query('COMMIT');
    console.log('Slugs preenchidos com sucesso.');
  } catch (erro) {
    await client.query('ROLLBACK');
    console.error('Erro ao preencher slugs:', erro);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

executar();
