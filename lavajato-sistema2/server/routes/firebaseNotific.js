
const express = require('express');
const router = express.Router();

const pool = require('../db');
const autenticar = require('../middleware/auth');

const {
  enviarParaDesenvolvedores
} = require('../services/firebaseNotific');

router.use(autenticar);

router.use((req, res, next) => {
  if (!req.usuario || req.usuario.perfil !== 'dev') {
    return res.status(403).json({
      erro: 'Acesso permitido somente ao desenvolvedor.'
    });
  }

  next();
});

// Registrar dispositivo para receber notificações.
router.post('/token', async (req, res) => {
  try {
    const token = req.body?.token;

    if (
      typeof token !== 'string' ||
      token.length < 20 ||
      token.length > 4096
    ) {
      return res.status(400).json({
        erro: 'Token de notificação inválido.'
      });
    }

    await pool.query(
      `INSERT INTO notificacoes_tokens
        (usuario_id, token, dispositivo, ativo, atualizado_em)
       VALUES ($1, $2, $3, TRUE, NOW())
       ON CONFLICT (token)
       DO UPDATE SET
         usuario_id = EXCLUDED.usuario_id,
         dispositivo = EXCLUDED.dispositivo,
         ativo = TRUE,
         atualizado_em = NOW()`,
      [req.usuario.id, token, 'Android']
    );

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Dispositivo registrado.'
    });
  } catch (erro) {
    console.error(
      '[Orvix Push] Erro ao registrar dispositivo:',
      erro.message
    );

    return res.status(500).json({
      erro: 'Não foi possível registrar o dispositivo.'
    });
  }
});

// Desativar notificações para este dispositivo.
router.delete('/token', async (req, res) => {
  try {
    const token = req.body?.token;

    if (typeof token !== 'string' || !token) {
      return res.status(400).json({
        erro: 'Informe o token do dispositivo.'
      });
    }

    await pool.query(
      `UPDATE notificacoes_tokens
       SET ativo = FALSE, atualizado_em = NOW()
       WHERE usuario_id = $1 AND token = $2`,
      [req.usuario.id, token]
    );

    return res.json({
      sucesso: true,
      mensagem: 'Dispositivo desativado.'
    });
  } catch (erro) {
    console.error(
      '[Orvix Push] Erro ao desativar dispositivo:',
      erro.message
    );

    return res.status(500).json({
      erro: 'Não foi possível desativar o dispositivo.'
    });
  }
});

// Enviar notificação de teste.

router.post('/teste', async (req, res) => {
  try {
    const resultado = await enviarParaDesenvolvedores({
      usuarioId: req.usuario.id,
      titulo: 'Orvix — teste de notificações',
      mensagem: 'O envio de notificações foi acionado.',
      link: '/'
    });

    if (resultado.enviados === 0) {
      return res.status(200).json({
        sucesso: false,
        ...resultado,
        mensagem: resultado.falhas > 0
          ? 'Não foi possível enviar a notificação. Verifique a configuração do Firebase.'
          : 'Nenhum dispositivo ativo está registrado para este desenvolvedor.'
      });
    }

    return res.json({
      sucesso: true,
      ...resultado,
      mensagem: 'Notificação enviada.'
    });
  } catch (erro) {
    console.error(
      '[Orvix Push] Erro no teste:',
      erro.message
    );

    return res.status(500).json({
      sucesso: false,
      erro: 'Não foi possível enviar a notificação.'
    });
  }
});

module.exports = router;