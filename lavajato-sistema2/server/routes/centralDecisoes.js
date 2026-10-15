'use strict';

const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');
const exigirPermissao = require('../middleware/permissao');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);
router.use(exigirPermissao('financeiro'));

function dataISO(d = new Date()) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function validarData(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const soma = (lista, campo) => lista.reduce((s, x) => s + x[campo], 0);

router.get('/', async (req, res) => {
  const empresaId = req.usuario?.empresa_id;
  if (!empresaId) {
    return res.status(403).json({ erro: 'Empresa não identificada na sessão.' });
  }

  const hoje = dataISO();
  const inicio = req.query.de || hoje;
  const fim = req.query.ate || dataISO(new Date(Date.now() + 7 * 86400000));

  if (!validarData(inicio) || !validarData(fim) || inicio > fim) {
    return res.status(400).json({ erro: 'Informe um período válido no formato AAAA-MM-DD.' });
  }

  try {
    const [agendaResult, despesasResult, contasTableResult] = await Promise.all([
      pool.query(
        `SELECT id, data, hora, cliente, status, valor, status_pagamento
         FROM agendamentos
         WHERE empresa_id = $1
           AND data >= $2::date AND data <= $3::date
           AND LOWER(COALESCE(status, '')) NOT IN ('cancelado', 'cancelada')
         ORDER BY data ASC, hora ASC NULLS LAST, id ASC
         LIMIT 300`,
        [empresaId, inicio, fim]
      ),
      pool.query(
        `SELECT id, data, descricao, categoria, valor
         FROM despesas
         WHERE empresa_id = $1
           AND data >= $2::date AND data <= $3::date
         ORDER BY data ASC, id ASC
         LIMIT 300`,
        [empresaId, inicio, fim]
      ),
      pool.query(`SELECT to_regclass('public.contas_financeiras') AS tabela`)
    ]);

    let contasAbertas = [];
    let pagoContas = { receber: 0, pagar: 0 };
    const tabelaContasDisponivel = Boolean(contasTableResult.rows[0]?.tabela);

    if (tabelaContasDisponivel) {
      // Em aberto: TODAS as contas com saldo > 0 até o fim do período.
      // Sem limite inferior, para que as vencidas apareçam sempre.
      // COALESCE no valor_pago: sem ele, valor_pago NULL zera o saldo.
      const [abertasResult, pagoResult] = await Promise.all([
        pool.query(
          `SELECT c.id, c.tipo, c.descricao, c.categoria, c.contato,
                  c.valor, COALESCE(c.valor_pago, 0) AS valor_pago,
                  c.vencimento, c.status,
                  c.valor - COALESCE(c.valor_pago, 0) AS saldo_aberto
           FROM contas_financeiras c
           WHERE c.empresa_id = $1
             AND c.status <> 'cancelado'
             AND c.valor - COALESCE(c.valor_pago, 0) > 0
             AND c.vencimento <= $2::date
           ORDER BY c.vencimento ASC, c.id ASC
           LIMIT 500`,
          [empresaId, fim]
        ),
        // Já pago/recebido nas contas com vencimento dentro do período.
        pool.query(
          `SELECT tipo, COALESCE(SUM(valor_pago), 0) AS total
           FROM contas_financeiras
           WHERE empresa_id = $1
             AND status <> 'cancelado'
             AND vencimento >= $2::date AND vencimento <= $3::date
           GROUP BY tipo`,
          [empresaId, inicio, fim]
        )
      ]);
      contasAbertas = abertasResult.rows;
      pagoResult.rows.forEach(r => { pagoContas[r.tipo] = num(r.total); });
    }

    const agendamentos = agendaResult.rows.map(a => ({
      id: a.id,
      data: a.data,
      hora: a.hora || null,
      cliente: a.cliente || 'Cliente não informado',
      status: a.status || 'Não informado',
      valor: num(a.valor),
      status_pagamento: a.status_pagamento || 'pendente'
    }));

    const despesas = despesasResult.rows.map(d => ({ valor: num(d.valor) }));

    const contas = contasAbertas.map(c => ({
      id: c.id,
      tipo: c.tipo,
      descricao: c.descricao,
      categoria: c.categoria || 'Outros',
      contato: c.contato || '',
      vencimento: c.vencimento,
      status: c.status,
      valor: num(c.valor),
      valor_pago: num(c.valor_pago),
      saldo_aberto: num(c.saldo_aberto)
    }));

    const vencidas = contas.filter(c => c.vencimento < hoje);
    const vencemHoje = contas.filter(c => c.vencimento === hoje);
    const proximas = contas.filter(c => c.vencimento > hoje); // já limitado ao fim do período

    const agendaHoje = agendamentos.filter(a => a.data === hoje);
    const pagamentosPendentes = agendamentos.filter(a =>
      ['pendente', 'parcial'].includes(String(a.status_pagamento).toLowerCase()) && a.valor > 0
    );

    const totalReceber = soma(contas.filter(c => c.tipo === 'receber'), 'saldo_aberto');
    const totalPagar = soma(contas.filter(c => c.tipo === 'pagar'), 'saldo_aberto');

    // Saldo realizado no período = o que já entrou - o que já saiu.
    const recebidoAgenda = soma(
      agendamentos.filter(a => String(a.status_pagamento).toLowerCase() === 'pago'), 'valor'
    );
    const entradas = recebidoAgenda + pagoContas.receber;
    const saidas = soma(despesas, 'valor') + pagoContas.pagar;

    const decisoes = [];
    if (vencidas.length) decisoes.push({
      prioridade: 'alta', tipo: 'financeiro', titulo: `${vencidas.length} conta(s) vencida(s)`,
      descricao: 'Revise os vencimentos atrasados e registre pagamentos ou combine uma nova data.',
      quantidade: vencidas.length, valor: soma(vencidas, 'saldo_aberto'),
      acao: '/contas-financeiras.html'
    });
    if (vencemHoje.length) decisoes.push({
      prioridade: 'alta', tipo: 'financeiro', titulo: `${vencemHoje.length} conta(s) vencem hoje`,
      descricao: 'Confira o caixa disponível e priorize as contas com vencimento nesta data.',
      quantidade: vencemHoje.length, valor: soma(vencemHoje, 'saldo_aberto'),
      acao: '/contas-financeiras.html'
    });
    if (agendaHoje.length) decisoes.push({
      prioridade: 'media', tipo: 'agenda', titulo: `${agendaHoje.length} atendimento(s) na agenda de hoje`,
      descricao: 'Confira os horários e confirme com os clientes que ainda não responderam.',
      quantidade: agendaHoje.length, valor: soma(agendaHoje, 'valor'),
      acao: '/'
    });
    if (pagamentosPendentes.length) decisoes.push({
      prioridade: 'media', tipo: 'cobranca', titulo: `${pagamentosPendentes.length} atendimento(s) com pagamento pendente`,
      descricao: 'Revise os pagamentos e registre os recebimentos confirmados para manter os indicadores corretos.',
      quantidade: pagamentosPendentes.length, valor: soma(pagamentosPendentes, 'valor'),
      acao: '/'
    });
    if (proximas.length) decisoes.push({
      prioridade: 'media', tipo: 'financeiro', titulo: `${proximas.length} conta(s) vencem nos próximos dias`,
      descricao: 'Planeje as saídas futuras para reduzir o risco de falta de caixa.',
      quantidade: proximas.length, valor: soma(proximas, 'saldo_aberto'),
      acao: '/contas-financeiras.html'
    });
    if (!decisoes.length) decisoes.push({
      prioridade: 'baixa', tipo: 'positivo', titulo: 'Nenhuma pendência crítica encontrada neste período',
      descricao: 'Continue registrando os dados e confira novamente a central ao longo do dia.',
      quantidade: 0, valor: 0, acao: '/'
    });

    return res.json({
      periodo: { de: inicio, ate: fim, hoje },
      indicadores: {
        atendimentos_hoje: agendaHoje.length,
        valor_agenda_hoje: soma(agendaHoje, 'valor'),
        contas_vencidas: vencidas.length,
        valor_vencido: soma(vencidas, 'saldo_aberto'),
        contas_vencem_hoje: vencemHoje.length,
        valor_vencem_hoje: soma(vencemHoje, 'saldo_aberto'),
        total_a_pagar: totalPagar,
        total_a_receber: totalReceber,
        entradas_realizadas: entradas,
        saidas_realizadas: saidas,
        saldo_periodo: entradas - saidas
      },
      decisoes,
      agenda_hoje: agendaHoje,
      contas_vencidas: vencidas,
      contas_vencem_hoje: vencemHoje,
      contas_proximas: proximas,
      disponibilidade_contas: tabelaContasDisponivel
    });
  } catch (err) {
    console.error('[CENTRAL-DECISOES] Erro ao montar painel:', err);
    return res.status(500).json({
      erro: 'Não foi possível carregar a Central de Decisões. Confira se as tabelas do Orvix estão disponíveis.'
    });
  }
});

module.exports = router;