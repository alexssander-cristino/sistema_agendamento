// Salve como: server/routes/dispositivos.js  (CommonJS, igual ao resto do projeto)
//
//   POST   /api/dispositivos          registra o token FCM do aparelho do usuário logado
//   DELETE /api/dispositivos?token=.. remove o token (o app chama no logout)
//
// Este arquivo NÃO depende do firebase-admin: só guarda tokens no banco.

const express = require('express');
const pool = require('../db');

// >>> AJUSTE ESTA LINHA <<<
// Copie exatamente o require do middleware de login que as suas outras rotas usam
// (veja o começo de server/routes/agendamentos.js) e o nome com que ele é usado.
const autenticar = require('../middleware/auth');

const router = express.Router();

// Descobre quem está logado. Ajuste se o seu middleware guarda o usuário em outro campo.
function contexto(req) {
  const u = req.usuario || req.user || {};
  return {
    usuarioId: u.id ?? u.usuario_id,
    empresaId: u.empresa_id ?? u.empresaId ?? null,
  };
}

router.post('/', autenticar, async (req, res) => {
  try {
    const { token, plataforma } = req.body || {};
    const { usuarioId, empresaId } = contexto(req);

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ erro: 'Token ausente.' });
    }

    if (!usuarioId) {
      return res.status(401).json({ erro: 'Usuário não identificado.' });
    }

    // Se o mesmo aparelho trocar de usuário, o token passa para o novo dono.
    await pool.query(
      `INSERT INTO dispositivos (usuario_id, empresa_id, token, plataforma)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE SET
         usuario_id = EXCLUDED.usuario_id,
         empresa_id = EXCLUDED.empresa_id,
         plataforma = EXCLUDED.plataforma,
         atualizado_em = now()`,
      [usuarioId, empresaId, token, plataforma === 'ios' ? 'ios' : 'android']
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro ao registrar dispositivo:', err.message);
    return res.status(500).json({ erro: 'Não foi possível registrar o dispositivo.' });
  }
});

router.delete('/', autenticar, async (req, res) => {
  try {
    const token = req.query.token;
    const { usuarioId } = contexto(req);

    if (token && usuarioId) {
      await pool.query(
        'DELETE FROM dispositivos WHERE token = $1 AND usuario_id = $2',
        [token, usuarioId]
      );
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro ao remover dispositivo:', err.message);
    return res.status(500).json({ erro: 'Não foi possível remover o dispositivo.' });
  }
});

module.exports = router;