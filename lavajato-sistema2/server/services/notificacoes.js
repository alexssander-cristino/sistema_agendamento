'use strict';

const pool = require('../db');
const { enviarPushParaEmpresa, enviarPushParaUsuario } = require('./push');

const TIPOS_PERMITIDOS = ['info', 'sucesso', 'alerta', 'erro', 'agendamento', 'financeiro', 'sistema', 'novidade', 'cliente', 'meta'];
const LIMITES = { titulo: 160, mensagem: 5000, link: 2048 };

function identificadorValido(valor) {
  const n = Number(valor);
  return Number.isSafeInteger(n) && n > 0;
}

function normalizarLink(link) {
  if (link === null || link === undefined || link === '') return null;
  if (typeof link !== 'string') throw new Error('O link da notificação deve ser um texto.');
  const valor = link.trim();
  if (!valor) return null;
  if (valor.length > LIMITES.link) throw new Error('O link da notificação é muito longo.');
  if (/^(javascript|data|vbscript):/i.test(valor) || valor.startsWith('//')) throw new Error('O link da notificação não é permitido.');
  if (valor.startsWith('/')) return valor;
  let url;
  try { url = new URL(valor); } catch { throw new Error('O link da notificação é inválido.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Somente links HTTP ou HTTPS são permitidos.');
  return url.toString();
}

function normalizarTipo(tipo) {
  const valor = typeof tipo === 'string' ? tipo.trim().toLowerCase() : 'info';
  return TIPOS_PERMITIDOS.includes(valor) ? valor : 'info';
}

async function enviarPushSemBloquear({ empresaId, usuarioId, titulo, mensagem, link }) {
  try {
    const opcoes = { title: titulo, body: mensagem, route: link || '/' };
    if (usuarioId !== null && usuarioId !== undefined) {
      await enviarPushParaUsuario({ ...opcoes, usuarioId });
    } else {
      await enviarPushParaEmpresa({ ...opcoes, empresaId });
    }
  } catch (erro) {
    // Push não deve cancelar nem desfazer uma notificação interna já gravada.
    console.error('[ORVIX PUSH] Notificação interna criada, mas o push falhou:', erro.code || '', erro.message);
  }
}

async function criarNotificacao({ empresaId, usuarioId = null, tipo = 'info', titulo, mensagem, link = null } = {}) {
  if (!identificadorValido(empresaId)) {
    console.warn('[Notificações] Identificador de empresa inválido.');
    return null;
  }
  if (usuarioId !== null && usuarioId !== undefined && !identificadorValido(usuarioId)) {
    console.warn('[Notificações] Identificador de usuário inválido.');
    return null;
  }
  if (typeof titulo !== 'string' || typeof mensagem !== 'string') return null;
  const tituloFinal = titulo.trim();
  const mensagemFinal = mensagem.trim();
  if (!tituloFinal || !mensagemFinal || tituloFinal.length > LIMITES.titulo || mensagemFinal.length > LIMITES.mensagem) return null;

  let linkFinal;
  try { linkFinal = normalizarLink(link); } catch (erro) {
    console.warn('[Notificações] Link inválido:', erro.message);
    return null;
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO public.notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, empresa_id, usuario_id, tipo, titulo, mensagem, link, criado_em, lida_em`,
      [Number(empresaId), usuarioId == null ? null : Number(usuarioId), normalizarTipo(tipo), tituloFinal, mensagemFinal, linkFinal]
    );
    const notificacao = resultado.rows[0] || null;
    if (notificacao) {
      // Não aguarda o provedor push para responder ao fluxo principal.
      void enviarPushSemBloquear({ empresaId: Number(empresaId), usuarioId: usuarioId == null ? null : Number(usuarioId), titulo: tituloFinal, mensagem: mensagemFinal, link: linkFinal });
    }
    return notificacao;
  } catch (erro) {
    console.error('[Notificações] Não foi possível criar o aviso:', { mensagem: erro.message, codigo: erro.code });
    return null;
  }
}

async function notificarUsuariosDaEmpresa({ empresaId, tipo = 'info', titulo, mensagem, link = null } = {}) {
  if (!identificadorValido(empresaId)) return { sucesso: false, quantidade: 0, erro: 'Identificador de empresa inválido.' };
  if (typeof titulo !== 'string' || typeof mensagem !== 'string' || !titulo.trim() || !mensagem.trim() || titulo.trim().length > LIMITES.titulo || mensagem.trim().length > LIMITES.mensagem) {
    return { sucesso: false, quantidade: 0, erro: 'Título ou mensagem inválidos.' };
  }
  let linkFinal;
  try { linkFinal = normalizarLink(link); } catch (erro) { return { sucesso: false, quantidade: 0, erro: erro.message }; }
  try {
    const resultado = await pool.query(
      `INSERT INTO public.notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link)
       SELECT u.empresa_id, u.id, $2, $3, $4, $5 FROM public.usuarios u
       WHERE u.empresa_id = $1 AND u.ativo = TRUE RETURNING id, usuario_id`,
      [Number(empresaId), normalizarTipo(tipo), titulo.trim(), mensagem.trim(), linkFinal]
    );
    // Uma notificação individual por usuário: envia push a cada usuário para respeitar a segmentação.
    await Promise.allSettled(resultado.rows.map((row) => enviarPushSemBloquear({ empresaId: Number(empresaId), usuarioId: row.usuario_id, titulo: titulo.trim(), mensagem: mensagem.trim(), link: linkFinal })));
    return { sucesso: true, quantidade: resultado.rowCount };
  } catch (erro) {
    console.error('[Notificações] Falha ao notificar usuários da empresa:', { mensagem: erro.message, codigo: erro.code });
    return { sucesso: false, quantidade: 0, erro: 'Não foi possível criar as notificações.' };
  }
}

module.exports = { criarNotificacao, notificarUsuariosDaEmpresa, TIPOS_PERMITIDOS };
