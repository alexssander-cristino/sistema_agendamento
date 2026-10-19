'use strict';

const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const { enviarParaDesenvolvedores } = require('../services/firebaseNotific');
const router = express.Router();

router.use((req, res, next) => { res.setHeader('X-Orvix-Push-Version', 'unified-push-2026-10'); next(); });
router.use(autenticar);

function exigirDesenvolvedor(req, res, next) {
  if (req.usuario?.perfil !== 'dev') return res.status(403).json({ sucesso: false, erro: 'Acesso permitido somente ao desenvolvedor.' });
  return next();
}

router.post('/token', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const usuarioId = req.usuario?.id;
    if (!token || token.length > 8192) return res.status(400).json({ sucesso: false, erro: 'Token ausente ou inválido.' });
    if (!usuarioId) return res.status(401).json({ sucesso: false, erro: 'Usuário não identificado.' });
    await pool.query(
      `INSERT INTO public.notificacoes_tokens (usuario_id, token, ativo)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (token) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, ativo = TRUE`,
      [usuarioId, token]
    );
    return res.json({ sucesso: true, mensagem: 'Token registrado.' });
  } catch (erro) {
    console.error('[ORVIX PUSH] Registro web falhou:', erro.code || '', erro.message);
    return res.status(500).json({ sucesso: false, erro: 'Não foi possível registrar o token web.' });
  }
});

router.delete('/token', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ sucesso: false, erro: 'Token ausente.' });
    await pool.query('UPDATE public.notificacoes_tokens SET ativo = FALSE WHERE token = $1 AND usuario_id = $2', [token, req.usuario.id]);
    return res.json({ sucesso: true });
  } catch (erro) {
    console.error('[ORVIX PUSH] Remoção web falhou:', erro.message);
    return res.status(500).json({ sucesso: false, erro: 'Não foi possível desativar o token.' });
  }
});

router.post('/teste', exigirDesenvolvedor, async (req, res) => {
  try {
    const resultado = await enviarParaDesenvolvedores();
    return res.status(resultado.sucesso ? 200 : 503).json({ sucesso: resultado.sucesso, mensagem: 'Resultado do teste push.', resultado });
  } catch (erro) {
    console.error('[ORVIX PUSH] Teste falhou:', erro.codigoDiagnostico || erro.code || '', erro.message);
    return res.status(500).json({ sucesso: false, erro: 'Não foi possível enviar a notificação.', diagnostico: erro.codigoDiagnostico || erro.code || 'ERRO_PUSH' });
  }
});

module.exports = router;
