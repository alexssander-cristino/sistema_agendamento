
'use strict';

const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');

const {
  enviarParaDesenvolvedores
} = require('../services/firebaseNotific');

const router = express.Router();

// Identifica a versão publicada durante os testes.
const PUSH_VERSION = 'push-debug-2026-10-09-v3';

// ============================================================
// IDENTIFICAÇÃO DA VERSÃO
// ============================================================

router.use((req, res, next) => {
  res.setHeader('X-Orvix-Push-Version', PUSH_VERSION);
  next();
});

// ============================================================
// AUTENTICAÇÃO
// ============================================================

router.use(autenticar);

// ============================================================
// PERMISSÃO DE DESENVOLVEDOR
// ============================================================

function exigirDesenvolvedor(req, res, next) {
  if (req.usuario?.perfil !== 'dev') {
    return res.status(403).json({
      sucesso: false,
      erro: 'Acesso permitido somente ao desenvolvedor.'
    });
  }

  next();
}

// ============================================================
// REGISTRAR TOKEN DO DISPOSITIVO
// POST /api/firebase-notific/token
// ============================================================

router.post('/token', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();

    if (!token) {
      return res.status(400).json({
        sucesso: false,
        erro: 'O token do dispositivo é obrigatório.'
      });
    }

    if (token.length > 8192) {
      return res.status(400).json({
        sucesso: false,
        erro: 'O token informado é inválido.'
      });
    }

    const usuarioId = req.usuario?.id;

    if (!usuarioId) {
      return res.status(401).json({
        sucesso: false,
        erro: 'Não foi possível identificar o usuário autenticado.'
      });
    }

    await pool.query(
      `INSERT INTO notificacoes_tokens
         (usuario_id, token, ativo)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (token)
       DO UPDATE SET
         usuario_id = EXCLUDED.usuario_id,
         ativo = TRUE`,
      [usuarioId, token]
    );

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Token registrado com sucesso.'
    });
  } catch (erro) {
    console.error('[ORVIX PUSH] Erro ao registrar token:', {
      codigo: erro?.code || null,
      mensagem: String(erro?.message || 'Erro desconhecido').slice(0, 250)
    });

    return res.status(500).json({
      sucesso: false,
      erro: 'Não foi possível registrar o token do dispositivo.'
    });
  }
});

// ============================================================
// REMOVER / DESATIVAR TOKEN DO DISPOSITIVO
// DELETE /api/firebase-notific/token
// ============================================================

router.delete('/token', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const usuarioId = req.usuario?.id;

    if (!token) {
      return res.status(400).json({
        sucesso: false,
        erro: 'O token do dispositivo é obrigatório.'
      });
    }

    if (!usuarioId) {
      return res.status(401).json({
        sucesso: false,
        erro: 'Não foi possível identificar o usuário autenticado.'
      });
    }

    await pool.query(
      `UPDATE notificacoes_tokens
       SET ativo = FALSE
       WHERE token = $1
         AND usuario_id = $2`,
      [token, usuarioId]
    );

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Token desativado com sucesso.'
    });
  } catch (erro) {
    console.error('[ORVIX PUSH] Erro ao remover token:', {
      codigo: erro?.code || null,
      mensagem: String(erro?.message || 'Erro desconhecido').slice(0, 250)
    });

    return res.status(500).json({
      sucesso: false,
      erro: 'Não foi possível desativar o token do dispositivo.'
    });
  }
});

// ============================================================
// TESTAR NOTIFICAÇÕES
// POST /api/firebase-notific/teste
// ============================================================

router.post('/teste', exigirDesenvolvedor, async (req, res) => {
  try {
    const resultado = await enviarParaDesenvolvedores();

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Teste de notificação concluído.',
      resultado
    });
  } catch (erro) {
    const causa = erro?.causaOriginal || erro;

    const diagnostico = String(
      causa?.message ||
      erro?.message ||
      erro?.codigoDiagnostico ||
      erro?.code ||
      'ERRO_DESCONHECIDO'
    ).slice(0, 300);

    console.error('[ORVIX PUSH] Falha no teste:', {
      diagnostico: erro?.codigoDiagnostico || null,
      codigo: causa?.code || null,
      mensagem: diagnostico
    });

    return res.status(500).json({
      sucesso: false,
      erro: 'Não foi possível enviar a notificação.',
      diagnostico
    });
  }
});

module.exports = router;