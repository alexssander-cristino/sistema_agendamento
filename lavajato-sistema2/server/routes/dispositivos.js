'use strict';

const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const router = express.Router();

function contexto(req) {
  const u = req.usuario || req.user || {};
  return { usuarioId: u.id ?? u.usuario_id, empresaId: u.empresa_id ?? u.empresaId ?? null };
}

router.post('/', autenticar, async (req, res) => {
  try {
    const { token, plataforma } = req.body || {};
    const { usuarioId, empresaId } = contexto(req);
    if (typeof token !== 'string' || !token.trim() || token.length > 8192) {
      return res.status(400).json({ erro: 'Token FCM ausente ou inválido.' });
    }
    if (!usuarioId) return res.status(401).json({ erro: 'Usuário não identificado.' });
    if (!empresaId && req.usuario?.perfil !== 'dev') {
      return res.status(403).json({ erro: 'Usuário não vinculado a uma empresa.' });
    }
    await pool.query(
      `INSERT INTO public.dispositivos (usuario_id, empresa_id, token, plataforma)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE SET usuario_id = EXCLUDED.usuario_id,
         empresa_id = EXCLUDED.empresa_id, plataforma = EXCLUDED.plataforma, atualizado_em = NOW()`,
      [usuarioId, empresaId, token.trim(), plataforma === 'ios' ? 'ios' : 'android']
    );
    return res.json({ ok: true, mensagem: 'Dispositivo registrado para push.' });
  } catch (err) {
    console.error('[ORVIX PUSH] Erro ao registrar dispositivo:', err.message);
    return res.status(500).json({ erro: 'Não foi possível registrar o dispositivo.' });
  }
});

router.delete('/', autenticar, async (req, res) => {
  try {
    const token = String(req.query.token || '').trim();
    const { usuarioId } = contexto(req);
    if (token && usuarioId) await pool.query('DELETE FROM public.dispositivos WHERE token = $1 AND usuario_id = $2', [token, usuarioId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[ORVIX PUSH] Erro ao remover dispositivo:', err.message);
    return res.status(500).json({ erro: 'Não foi possível remover o dispositivo.' });
  }
});

module.exports = router;
