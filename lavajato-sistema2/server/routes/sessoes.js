'use strict';

const express = require('express');

const pool = require('../db');
const autenticar = require('../middleware/auth');
const { registrarAuditoria } = require('../services/auditoria');

const {
  uuidValido,
  listarSessoesAtivas,
  revogarSessao,
  revogarTodasSessoes
} = require('../services/sessoes');

const router = express.Router();

router.use(autenticar);

function limparCookieToken(res) {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
}

async function auditar(req, detalhes) {
  try {
    await registrarAuditoria(req, {
      acao: 'exclusao',
      entidade: 'usuario',
      entidadeId: req.usuario.id,
      detalhes
    });
  } catch (erro) {
    console.error('Erro ao registrar auditoria de sessão:', erro?.message || erro);
  }
}

// ============================================================
// GET /api/sessoes
// Sessões ativas DO PRÓPRIO usuário.
// ============================================================

router.get('/', async (req, res) => {
  try {
    const sessoes = await listarSessoesAtivas(req.usuario.id);

    return res.json({
      sessoes: sessoes.map(s => ({
        ...s,
        atual: Boolean(req.sessaoId) && s.id === req.sessaoId
      }))
    });
  } catch (err) {
    console.error('Erro ao listar sessões:', err?.message || err);

    return res.status(500).json({
      erro: 'Não foi possível carregar as sessões.'
    });
  }
});

// ============================================================
// POST /api/sessoes/encerrar-outras
// Encerra todas, exceto a sessão atual.
// ============================================================

router.post('/encerrar-outras', async (req, res) => {
  if (!req.sessaoId) {
    return res.status(409).json({
      erro: 'Sua sessão atual não pode ser identificada. Entre novamente.'
    });
  }

  try {
    const encerradas = await revogarTodasSessoes(pool, req.usuario.id, {
      exceto: req.sessaoId,
      motivo: 'encerradas_outras'
    });

    await auditar(req, {
      origem: 'encerrar_outras_sessoes',
      quantidade: encerradas
    });

    return res.json({
      ok: true,
      encerradas,
      mensagem:
        encerradas === 0
          ? 'Não havia outras sessões ativas.'
          : `${encerradas} ${encerradas === 1 ? 'sessão encerrada' : 'sessões encerradas'}.`
    });
  } catch (err) {
    console.error('Erro ao encerrar sessões:', err?.message || err);

    return res.status(500).json({
      erro: 'Não foi possível encerrar as sessões.'
    });
  }
});

// ============================================================
// DELETE /api/sessoes/:id
// Encerra uma sessão do próprio usuário.
// ============================================================

router.delete('/:id', async (req, res) => {
  const sessaoId = String(req.params.id || '');

  if (!uuidValido(sessaoId)) {
    return res.status(400).json({ erro: 'Sessão inválida.' });
  }

  try {
    const revogada = await revogarSessao(pool, req.usuario.id, sessaoId);

    // Mesma resposta para "não existe" e "é de outro usuário".
    if (!revogada) {
      return res.status(404).json({ erro: 'Sessão não encontrada.' });
    }

    const atual = Boolean(req.sessaoId) && sessaoId === req.sessaoId;

    if (atual) limparCookieToken(res);

    await auditar(req, {
      origem: 'sessao_encerrada',
      sessao_id: sessaoId,
      atual
    });

    return res.json({
      ok: true,
      encerrou_atual: atual,
      mensagem: 'Sessão encerrada.'
    });
  } catch (err) {
    console.error('Erro ao encerrar sessão:', err?.message || err);

    return res.status(500).json({
      erro: 'Não foi possível encerrar a sessão.'
    });
  }
});

module.exports = router;