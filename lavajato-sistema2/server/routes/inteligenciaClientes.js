'use strict';

const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');
const exigirPermissao = require('../middleware/permissao');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);
router.use(exigirPermissao('clientes'));

function obterEmpresaId(req) {
  return req.usuario?.empresa_id ?? req.usuario?.empresaId ?? null;
}

function dataISOValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function hojeLocalISO() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

function diasEntre(dataMaisAntiga, dataMaisNova) {
  if (!dataMaisAntiga || !dataMaisNova) return null;
  const a = new Date(`${String(dataMaisAntiga).slice(0, 10)}T12:00:00Z`);
  const b = new Date(`${String(dataMaisNova).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.floor((b - a) / 86400000));
}

function montarInsights(clientes, hoje) {
  const total = clientes.length;
  const ativos = clientes.filter(c => c.total_atendimentos > 0 && c.dias_sem_visita !== null && c.dias_sem_visita <= 45).length;
  const emRisco = clientes.filter(c => c.total_atendimentos > 0 && c.dias_sem_visita !== null && c.dias_sem_visita >= 46).length;
  const altoValor = [...clientes].filter(c => c.total_gasto > 0).sort((a, b) => b.total_gasto - a.total_gasto).slice(0, 5);
  const semRetorno = [...clientes].filter(c => c.total_atendimentos > 0 && c.dias_sem_visita !== null && c.dias_sem_visita >= 60)
    .sort((a, b) => b.dias_sem_visita - a.dias_sem_visita).slice(0, 8);
  const frequentes = [...clientes].filter(c => c.total_atendimentos > 0)
    .sort((a, b) => b.total_atendimentos - a.total_atendimentos || b.total_gasto - a.total_gasto).slice(0, 5);
  const novos = [...clientes].filter(c => c.primeira_visita && diasEntre(c.primeira_visita, hoje) <= 30)
    .sort((a, b) => String(b.primeira_visita).localeCompare(String(a.primeira_visita))).slice(0, 8);

  const insights = [];
  if (!total) {
    insights.push({
      nivel: 'info', titulo: 'Cadastre ou pesquise clientes para começar',
      texto: 'Assim que houver clientes cadastrados e atendimentos vinculados pelo campo cliente_id, o painel mostrará padrões de recorrência, valor e risco de inatividade.'
    });
  } else {
    if (emRisco > 0) insights.push({
      nivel: 'alto', titulo: `${emRisco} cliente(s) sem visita há mais de 45 dias`,
      texto: 'Considere uma ação de relacionamento ou uma oferta relevante. Confirme o histórico antes de entrar em contato.'
    });
    if (altoValor.length) insights.push({
      nivel: 'positivo', titulo: 'Clientes com maior valor acumulado identificados',
      texto: 'Priorize um atendimento consistente para esses clientes e acompanhe a recorrência, sem presumir que o gasto passado garante compras futuras.'
    });
    if (novos.length) insights.push({
      nivel: 'info', titulo: `${novos.length} cliente(s) com primeira visita nos últimos 30 dias`,
      texto: 'Uma mensagem de acompanhamento pode ajudar a entender a experiência e incentivar um próximo agendamento.'
    });
    if (!insights.length) insights.push({
      nivel: 'positivo', titulo: 'Relacionamento sem alertas críticos',
      texto: 'Mantenha os dados atualizados e acompanhe a frequência de retorno e o histórico de atendimentos.'
    });
  }

  return { total, ativos, em_risco: emRisco, alto_valor: altoValor, sem_retorno: semRetorno, frequentes, novos, insights };
}

// GET /api/inteligencia-clientes/resumo
// Indicadores usam somente agendamentos associados por cliente_id.
// Não tenta vincular históricos pelo nome/telefone para evitar misturar pessoas.
router.get('/resumo', async (req, res) => {
  const empresaId = obterEmpresaId(req);
  if (!empresaId) {
    return res.status(403).json({ erro: 'Não existe uma empresa vinculada à sessão.' });
  }

  const busca = String(req.query.busca || '').trim().slice(0, 120);
  const segmento = String(req.query.segmento || 'todos').trim().toLowerCase();
  const permitidos = new Set(['todos', 'ativos', 'em_risco', 'alto_valor', 'frequentes', 'novos', 'sem_retorno']);
  if (!permitidos.has(segmento)) {
    return res.status(400).json({ erro: 'Segmento de clientes inválido.' });
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        c.id,
        c.nome,
        c.telefone,
        c.email,
        c.data_nascimento,
        c.criado_em,
        COUNT(a.id) FILTER (
          WHERE LOWER(COALESCE(a.status, '')) NOT IN ('cancelado', 'cancelada', 'estornado')
        )::int AS total_atendimentos,
        COUNT(a.id) FILTER (
          WHERE LOWER(COALESCE(a.status, '')) = 'concluido'
        )::int AS atendimentos_concluidos,
        COALESCE(SUM(a.valor) FILTER (
          WHERE LOWER(COALESCE(a.status, '')) = 'concluido'
        ), 0)::numeric AS total_gasto,
        MAX(a.data) FILTER (
          WHERE LOWER(COALESCE(a.status, '')) NOT IN ('cancelado', 'cancelada', 'estornado')
        ) AS ultima_visita,
        MIN(a.data) FILTER (
          WHERE LOWER(COALESCE(a.status, '')) NOT IN ('cancelado', 'cancelada', 'estornado')
        ) AS primeira_visita
      FROM clientes c
      LEFT JOIN agendamentos a
        ON a.empresa_id = c.empresa_id
       AND a.cliente_id = c.id
      WHERE c.empresa_id = $1
        AND c.ativo = TRUE
        AND (
          $2 = ''
          OR c.nome ILIKE '%' || $2 || '%'
          OR COALESCE(c.telefone, '') ILIKE '%' || $2 || '%'
          OR COALESCE(c.email, '') ILIKE '%' || $2 || '%'
        )
      GROUP BY c.id
      ORDER BY c.nome ASC
      LIMIT 500
    `, [empresaId, busca]);

    const hoje = hojeLocalISO();
    const clientes = rows.map(row => {
      const ultimaVisita = row.ultima_visita ? String(row.ultima_visita).slice(0, 10) : null;
      const primeiraVisita = row.primeira_visita ? String(row.primeira_visita).slice(0, 10) : null;
      const gasto = numero(row.total_gasto);
      const atendimentos = numero(row.total_atendimentos);
      const diasSemVisita = diasEntre(ultimaVisita, hoje);
      return {
        id: row.id,
        nome: row.nome,
        telefone: row.telefone || null,
        email: row.email || null,
        data_nascimento: row.data_nascimento ? String(row.data_nascimento).slice(0, 10) : null,
        criado_em: row.criado_em,
        total_atendimentos: atendimentos,
        atendimentos_concluidos: numero(row.atendimentos_concluidos),
        total_gasto: gasto,
        ultima_visita: ultimaVisita,
        primeira_visita: primeiraVisita,
        dias_sem_visita: diasSemVisita,
        classificacao: atendimentos === 0 ? 'novo' :
          diasSemVisita !== null && diasSemVisita >= 60 ? 'sem_retorno' :
          diasSemVisita !== null && diasSemVisita >= 46 ? 'em_risco' :
          atendimentos >= 4 ? 'frequente' :
          gasto > 0 ? 'ativo' : 'novo'
      };
    });

    const resumo = montarInsights(clientes, hoje);
    const ordenados = [...clientes].sort((a, b) => b.total_gasto - a.total_gasto);
    const corteAltoValor = ordenados.length ? ordenados[Math.min(4, ordenados.length - 1)].total_gasto : 0;

    const filtrados = clientes.filter(c => {
      if (segmento === 'ativos') return c.total_atendimentos > 0 && c.dias_sem_visita !== null && c.dias_sem_visita <= 45;
      if (segmento === 'em_risco') return c.total_atendimentos > 0 && c.dias_sem_visita !== null && c.dias_sem_visita >= 46 && c.dias_sem_visita < 60;
      if (segmento === 'alto_valor') return c.total_gasto > 0 && c.total_gasto >= corteAltoValor;
      if (segmento === 'frequentes') return c.total_atendimentos >= 4;
      if (segmento === 'novos') return c.total_atendimentos === 0 || (c.primeira_visita && diasEntre(c.primeira_visita, hoje) <= 30);
      if (segmento === 'sem_retorno') return c.total_atendimentos > 0 && c.dias_sem_visita !== null && c.dias_sem_visita >= 60;
      return true;
    }).sort((a, b) => {
      if (segmento === 'sem_retorno' || segmento === 'em_risco') return (b.dias_sem_visita || 0) - (a.dias_sem_visita || 0);
      if (segmento === 'alto_valor') return b.total_gasto - a.total_gasto;
      if (segmento === 'frequentes') return b.total_atendimentos - a.total_atendimentos;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });

    return res.json({
      atualizado_em: new Date().toISOString(),
      indicadores: {
        total_clientes: resumo.total,
        clientes_ativos: resumo.ativos,
        clientes_em_risco: resumo.em_risco,
        clientes_sem_retorno: resumo.sem_retorno.length,
        clientes_frequentes: clientes.filter(c => c.total_atendimentos >= 4).length,
        clientes_novos: resumo.novos.length
      },
      insights: resumo.insights,
      segmentos: {
        alto_valor: resumo.alto_valor,
        sem_retorno: resumo.sem_retorno,
        frequentes: resumo.frequentes,
        novos: resumo.novos
      },
      clientes: filtrados
    });
  } catch (err) {
    console.error('Erro na inteligência de clientes:', err);
    return res.status(500).json({ erro: 'Não foi possível gerar a inteligência de clientes.' });
  }
});

module.exports = router;
