const express = require('express');

const pool = require('../db');

const autenticar = require('../middleware/auth');

const somenteDev = require('../middleware/dev');

const router = express.Router();

router.use(autenticar);

router.use(somenteDev);

/*                                                                         
  -------------------------------------------------------------------------- 
| LISTAR ASSINATURAS                                                         
| -------------------------------------------------------------------------- 
| */                                                                         

router.get('/', async (req, res) => {

try {


const { rows } =
  await pool.query(`
    SELECT

      a.id,

      a.empresa_id,

      e.nome AS empresa_nome,

      a.plano_id,

      p.nome AS plano_nome,

      p.valor AS plano_valor,

      p.periodo AS plano_periodo,

      a.status,

      a.mercado_pago_id,

      a.inicio_em,

      a.proxima_cobranca_em,

      a.cancelada_em,

      a.criado_em,

      a.atualizado_em

    FROM assinaturas a

    INNER JOIN empresas e
      ON e.id = a.empresa_id

    INNER JOIN planos p
      ON p.id = a.plano_id

    ORDER BY
      a.id DESC
  `);


return res.json(rows);


} catch (err) {


console.error(
  'Erro ao listar assinaturas:',
  err
);


return res.status(500).json({
  erro:
    'Não foi possível listar as assinaturas.'
});


}

});

 /*                                                                         |
| -------------------------------------------------------------------------- |
| DETALHES                                                                   |
| -------------------------------------------------------------------------- |
| */                                                                         

router.get('/:id', async (req, res) => {

try {


const { id } =
  req.params;


const { rows } =
  await pool.query(
    `
      SELECT

        a.id,

        a.empresa_id,

        e.nome AS empresa_nome,

        a.plano_id,

        p.nome AS plano_nome,

        p.valor AS plano_valor,

        p.periodo AS plano_periodo,

        a.status,

        a.mercado_pago_id,

        a.inicio_em,

        a.proxima_cobranca_em,

        a.cancelada_em,

        a.criado_em,

        a.atualizado_em

      FROM assinaturas a

      INNER JOIN empresas e
        ON e.id = a.empresa_id

      INNER JOIN planos p
        ON p.id = a.plano_id

      WHERE a.id = $1

      LIMIT 1
    `,
    [id]
  );


if (
  rows.length === 0
) {

  return res.status(404).json({
    erro:
      'Assinatura não encontrada.'
  });

}


return res.json(rows[0]);


} catch (err) {


console.error(
  'Erro ao buscar assinatura:',
  err
);


return res.status(500).json({
  erro:
    'Não foi possível buscar a assinatura.'
});


}

});

 /*                                                                         |
| -------------------------------------------------------------------------- |
| PAUSAR                                                                     |
| -------------------------------------------------------------------------- |
| */                                                                         

router.patch(
'/:id/pausar',
async (req, res) => {


try {

  const { id } =
    req.params;


  const { rows } =
    await pool.query(
      `
        UPDATE assinaturas

        SET
          status = 'pausada',
          atualizado_em = NOW()

        WHERE id = $1

        AND status IN (
          'ativa',
          'inadimplente'
        )

        RETURNING
          id,
          status
      `,
      [id]
    );


  if (
    rows.length === 0
  ) {

    return res.status(404).json({
      erro:
        'Assinatura não encontrada ou não pode ser pausada.'
    });

  }


  return res.json({
    mensagem:
      'Assinatura pausada com sucesso.',
    assinatura:
      rows[0]
  });

} catch (err) {

  console.error(
    'Erro ao pausar assinatura:',
    err
  );


  return res.status(500).json({
    erro:
      'Não foi possível pausar a assinatura.'
  });

}


}
);

 /*                                                                         |
| -------------------------------------------------------------------------- |
| REATIVAR                                                                   |
| -------------------------------------------------------------------------- |
| */                                                                         

router.patch(
'/:id/reativar',
async (req, res) => {


try {

  const { id } =
    req.params;


  const { rows } =
    await pool.query(
      `
        UPDATE assinaturas

        SET
          status = 'ativa',
          atualizado_em = NOW(),
          cancelada_em = NULL

        WHERE id = $1

        AND status IN (
          'pausada',
          'inadimplente'
        )

        RETURNING
          id,
          status
      `,
      [id]
    );


  if (
    rows.length === 0
  ) {

    return res.status(404).json({
      erro:
        'Assinatura não encontrada ou não pode ser reativada.'
    });

  }


  return res.json({
    mensagem:
      'Assinatura reativada com sucesso.',
    assinatura:
      rows[0]
  });

} catch (err) {

  console.error(
    'Erro ao reativar assinatura:',
    err
  );


  return res.status(500).json({
    erro:
      'Não foi possível reativar a assinatura.'
  });

}


}
);

 /*                                                                         |
| -------------------------------------------------------------------------- |
| CANCELAR                                                                   |
| -------------------------------------------------------------------------- |
| */                                                                         

router.patch(
'/:id/cancelar',
async (req, res) => {


try {

  const { id } =
    req.params;


  const { rows } =
    await pool.query(
      `
        UPDATE assinaturas

        SET
          status = 'cancelada',
          cancelada_em = NOW(),
          atualizado_em = NOW()

        WHERE id = $1

        AND status <> 'cancelada'

        RETURNING
          id,
          status,
          cancelada_em
      `,
      [id]
    );


  if (
    rows.length === 0
  ) {

    return res.status(404).json({
      erro:
        'Assinatura não encontrada ou já está cancelada.'
    });

  }


  return res.json({
    mensagem:
      'Assinatura cancelada com sucesso.',
    assinatura:
      rows[0]
  });

} catch (err) {

  console.error(
    'Erro ao cancelar assinatura:',
    err
  );


  return res.status(500).json({
    erro:
      'Não foi possível cancelar a assinatura.'
  });

}


}
);

module.exports = router;
