'use strict';

const express = require('express');
const router = express.Router();

const pool = require('../db');
const autenticar = require('../middleware/auth');

const {
  enviarParaDesenvolvedores
} = require('../services/firebaseNotific');

// ============================================================
// AUTENTICAÇÃO
// ============================================================

router.use(autenticar);

// Somente a conta de desenvolvedor pode gerenciar
// dispositivos e testar notificações.
router.use((req, res, next) => {
  if (!req.usuario || req.usuario.perfil !== 'dev') {
    return res.status(403).json({
      sucesso: false,
      erro: 'Acesso permitido somente ao desenvolvedor.'
    });
  }

  next();
});

// ============================================================
// REGISTRAR DISPOSITIVO
// POST /api/firebase-notific/token
// ============================================================

router.post('/token', async (req, res) => {
  try {
    const token = req.body?.token;

    if (
      typeof token !== 'string' ||
      token.trim().length < 20 ||
      token.length > 4096
    ) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Token de notificação inválido.'
      });
    }

    await pool.query(
      `INSERT INTO notificacoes_tokens (
        usuario_id,
        token,
        dispositivo,
        ativo,
        atualizado_em
      )
      VALUES ($1, $2, $3, TRUE, NOW())
      ON CONFLICT (token)
      DO UPDATE SET
        usuario_id = EXCLUDED.usuario_id,
        dispositivo = EXCLUDED.dispositivo,
        ativo = TRUE,
        atualizado_em = NOW()`,
      [
        req.usuario.id,
        token.trim(),
        'Navegador'
      ]
    );

    return res.status(201).json({
      sucesso: true,
      mensagem: 'Dispositivo registrado para notificações.'
    });
  } catch (erro) {
    console.error('[Orvix Push] Erro ao registrar dispositivo:', {
      name: erro?.name || null,
      code: erro?.code || null,
      message: erro?.message || null
    });

    return res.status(500).json({
      sucesso: false,
      erro: 'Não foi possível registrar o dispositivo.'
    });
  }
});

// ============================================================
// DESATIVAR DISPOSITIVO
// DELETE /api/firebase-notific/token
// ============================================================

router.delete('/token', async (req, res) => {
  try {
    const token = req.body?.token;

    if (
      typeof token !== 'string' ||
      !token.trim()
    ) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe o token do dispositivo.'
      });
    }

    const resultado = await pool.query(
      `UPDATE notificacoes_tokens
       SET ativo = FALSE,
           atualizado_em = NOW()
       WHERE usuario_id = $1
         AND token = $2`,
      [
        req.usuario.id,
        token.trim()
      ]
    );

    return res.status(200).json({
      sucesso: true,
      desativados: resultado.rowCount,
      mensagem: 'Dispositivo desativado.'
    });
  } catch (erro) {
    console.error('[Orvix Push] Erro ao desativar dispositivo:', {
      name: erro?.name || null,
      code: erro?.code || null,
      message: erro?.message || null
    });

    return res.status(500).json({
      sucesso: false,
      erro: 'Não foi possível desativar o dispositivo.'
    });
  }
});

// ============================================================
// TESTAR NOTIFICAÇÃO
// POST /api/firebase-notific/teste
// ============================================================

router.post('/teste', async (req, res) => {
  res.setHeader(
    'X-Orvix-Push-Version',
    'push-debug-2026-10-09-v2'
  );

  try {
    if (!req.usuario?.id) {
      return res.status(401).json({
        sucesso: false,
        erro: 'Usuário não autenticado.'
      });
    }

    const resultado = await enviarParaDesenvolvedores({
      usuarioId: req.usuario.id,
      titulo: 'Orvix — teste de notificações',
      mensagem: 'O envio de notificações foi acionado.',
      link: '/'
    });

    const enviados = Number(resultado?.enviados || 0);
    const falhas = Number(resultado?.falhas || 0);

    if (enviados === 0) {
      return res.status(200).json({
        sucesso: false,
        enviados,
        falhas,
        mensagem: falhas > 0
          ? 'O Firebase não conseguiu enviar a notificação.'
          : 'Nenhum dispositivo ativo está registrado para este desenvolvedor.'
      });
    }

    return res.status(200).json({
      sucesso: falhas === 0,
      enviados,
      falhas,
      mensagem: falhas > 0
        ? 'Notificação enviada, mas houve falha em um ou mais dispositivos.'
        : 'Notificação enviada com sucesso.'
    });
  } catch (erro) {
    const diagnostico = String(
      erro?.codigoDiagnostico ||
      erro?.code ||
      erro?.message ||
      erro?.name ||
      'ERRO_DESCONHECIDO'
    ).slice(0, 300);

    console.error('[Orvix Push] Erro no teste:', {
      name: erro?.name || null,
      code: erro?.code || null,
      message: erro?.message || null,
      stack: erro?.stack || null
    });

    return res.status(500).json({
      sucesso: false,
      erro: 'Não foi possível enviar a notificação.',
      diagnostico
    });
  }
});

module.exports = router;
