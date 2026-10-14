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

function empresaId(req) {
  return req.usuario?.empresa_id ?? req.usuario?.empresaId ?? null;
}
function dataValida(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function numero(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function moeda(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero(v));
}
function mesAnterior(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function construirInsights({ receita, despesa, receitaAnterior, despesaAnterior, categorias, contas }) {
  const itens = [];
  const resultado = receita - despesa;
  if (receita === 0 && despesa === 0) {
    itens.push({ nivel: 'info', titulo: 'Ainda faltam dados para analisar', texto: 'Registre receitas e despesas para começar a receber comparações e recomendações baseadas no histórico da empresa.' });
  } else {
    if (resultado < 0) itens.push({ nivel: 'alto', titulo: 'Resultado negativo no período', texto: `As despesas superaram as receitas em ${moeda(Math.abs(resultado))}. Revise gastos variáveis e confirme se todas as receitas foram registradas.` });
    else itens.push({ nivel: 'positivo', titulo: 'Resultado positivo no período', texto: `O resultado registrado é de ${moeda(resultado)}. Compare esse valor com os meses anteriores antes de assumir novos custos fixos.` });
    if (receitaAnterior > 0) {
      const variacao = ((receita - receitaAnterior) / receitaAnterior) * 100;
      if (variacao <= -10) itens.push({ nivel: 'alto', titulo: 'Queda nas receitas', texto: `As receitas caíram ${Math.abs(variacao).toFixed(1)}% em relação ao período anterior comparável. Confira volume de vendas/atendimentos e cobranças pendentes.` });
      else if (variacao >= 10) itens.push({ nivel: 'positivo', titulo: 'Receitas em crescimento', texto: `As receitas cresceram ${variacao.toFixed(1)}% em relação ao período anterior comparável. Verifique se o aumento também se reflete no caixa recebido.` });
    }
    if (despesaAnterior > 0) {
      const variacao = ((despesa - despesaAnterior) / despesaAnterior) * 100;
      if (variacao >= 15) itens.push({ nivel: 'medio', titulo: 'Despesas em alta', texto: `As despesas aumentaram ${variacao.toFixed(1)}% em relação ao período anterior comparável. Revise as categorias com maior participação e identifique gastos não recorrentes.` });
      else if (variacao <= -10) itens.push({ nivel: 'positivo', titulo: 'Redução de despesas', texto: `As despesas caíram ${Math.abs(variacao).toFixed(1)}% no período comparável. Confirme se não há contas ainda não lançadas.` });
    }
  }
  if (categorias.length && numero(categorias[0].total) > 0) {
    const totalCategorias = categorias.reduce((s, x) => s + numero(x.total), 0);
    const pct = totalCategorias ? numero(categorias[0].total) / totalCategorias * 100 : 0;
    if (pct >= 35) itens.push({ nivel: 'medio', titulo: `Concentração em ${categorias[0].categoria}`, texto: `Essa categoria representa ${pct.toFixed(1)}% das despesas registradas. Vale conferir contratos, preços e oportunidades de renegociação.` });
  }
  const vencidas = numero(contas?.vencidas_pagar);
  if (vencidas > 0) itens.push({ nivel: 'alto', titulo: 'Existem contas vencidas', texto: `Há ${moeda(vencidas)} em contas a pagar vencidas. Priorize a conferência dos vencimentos, juros e disponibilidade de caixa.` });
  const receberVencido = numero(contas?.vencidas_receber);
  if (receberVencido > 0) itens.push({ nivel: 'medio', titulo: 'Valores em atraso para receber', texto: `Há ${moeda(receberVencido)} em contas a receber vencidas. Considere contatar os responsáveis e atualizar as previsões após cada recebimento.` });
  return itens.slice(0, 8);
}

router.get('/resumo', async (req, res) => {
  const empresa = empresaId(req);
  if (!empresa) return res.status(403).json({ erro: 'Empresa não identificada.' });
  const hoje = hojeISO();
  const fim = typeof req.query.fim === 'string' && dataValida(req.query.fim) ? req.query.fim : hoje;
  const inicioPadrao = `${fim.slice(0,7)}-01`;
  const inicio = typeof req.query.inicio === 'string' && dataValida(req.query.inicio) ? req.query.inicio : inicioPadrao;
  if (inicio > fim) return res.status(400).json({ erro: 'A data inicial não pode ser maior que a final.' });
  const dias = Math.max(1, Math.round((Date.parse(fim)-Date.parse(inicio))/86400000)+1);
  const antFim = new Date(`${inicio}T12:00:00Z`); antFim.setUTCDate(antFim.getUTCDate()-1);
  const antInicio = new Date(antFim); antInicio.setUTCDate(antInicio.getUTCDate()-dias+1);
  const anteriorInicio = antInicio.toISOString().slice(0,10);
  const anteriorFim = antFim.toISOString().slice(0,10);
  try {
    const [atual, anterior, categorias, mensal, contas] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(valor) FROM agendamentos
            WHERE empresa_id=$1 AND data >= $2::date AND data <= $3::date
            AND LOWER(COALESCE(status,'')) NOT IN ('cancelado','cancelada')),0) AS receitas,
          COALESCE((SELECT SUM(valor) FROM despesas
            WHERE empresa_id=$1 AND data >= $2::date AND data <= $3::date),0) AS despesas,
          (SELECT COUNT(*) FROM agendamentos
            WHERE empresa_id=$1 AND data >= $2::date AND data <= $3::date
            AND LOWER(COALESCE(status,'')) NOT IN ('cancelado','cancelada'))::int AS qtd_receitas,
          (SELECT COUNT(*) FROM despesas
            WHERE empresa_id=$1 AND data >= $2::date AND data <= $3::date)::int AS qtd_despesas
      `,[empresa,inicio,fim]),
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(valor) FROM agendamentos WHERE empresa_id=$1 AND data >= $2::date AND data <= $3::date AND LOWER(COALESCE(status,'')) NOT IN ('cancelado','cancelada')),0) AS receitas,
          COALESCE((SELECT SUM(valor) FROM despesas WHERE empresa_id=$1 AND data >= $2::date AND data <= $3::date),0) AS despesas
      `,[empresa,anteriorInicio,anteriorFim]),
      pool.query(`
        SELECT COALESCE(categoria,'Outros') AS categoria, SUM(valor) AS total, COUNT(*)::int AS quantidade
        FROM despesas WHERE empresa_id=$1 AND data >= $2::date AND data <= $3::date
        GROUP BY COALESCE(categoria,'Outros') ORDER BY SUM(valor) DESC LIMIT 8
      `,[empresa,inicio,fim]),
      pool.query(`
        SELECT to_char(m.mes,'YYYY-MM') AS mes,
          COALESCE(r.total,0) AS receitas, COALESCE(d.total,0) AS despesas
        FROM generate_series(date_trunc('month',$2::date),date_trunc('month',$3::date),interval '1 month') m(mes)
        LEFT JOIN (
          SELECT date_trunc('month',data) mes,SUM(valor) total FROM agendamentos
          WHERE empresa_id=$1 AND data >= $2::date AND data <= $3::date
          AND LOWER(COALESCE(status,'')) NOT IN ('cancelado','cancelada') GROUP BY 1
        ) r USING(mes)
        LEFT JOIN (
          SELECT date_trunc('month',data) mes,SUM(valor) total FROM despesas
          WHERE empresa_id=$1 AND data >= $2::date AND data <= $3::date GROUP BY 1
        ) d USING(mes)
        ORDER BY m.mes
      `,[empresa,inicio,fim]),
      pool.query(`
        SELECT
          COALESCE(SUM(valor - valor_pago) FILTER (WHERE tipo='pagar' AND status <> 'cancelado' AND vencimento < CURRENT_DATE),0) AS vencidas_pagar,
          COALESCE(SUM(valor - valor_pago) FILTER (WHERE tipo='receber' AND status <> 'cancelado' AND vencimento < CURRENT_DATE),0) AS vencidas_receber,
          COALESCE(SUM(valor - valor_pago) FILTER (WHERE tipo='pagar' AND status <> 'cancelado' AND vencimento >= CURRENT_DATE AND vencimento < CURRENT_DATE + 8),0) AS proximas_pagar,
          COALESCE(SUM(valor - valor_pago) FILTER (WHERE tipo='receber' AND status <> 'cancelado' AND vencimento >= CURRENT_DATE AND vencimento < CURRENT_DATE + 8),0) AS proximas_receber,
          COALESCE(SUM(valor - valor_pago) FILTER (WHERE tipo='receber' AND status <> 'cancelado'),0) AS aberto_receber,
          COALESCE(SUM(valor - valor_pago) FILTER (WHERE tipo='pagar' AND status <> 'cancelado'),0) AS aberto_pagar
        FROM contas_financeiras WHERE empresa_id=$1
      `,[empresa])
    ]);
    const a=atual.rows[0], b=anterior.rows[0], c=contas.rows[0];
    const receitas=numero(a.receitas), despesas=numero(a.despesas);
    const categoriasOut=categorias.rows.map(x=>({...x,total:numero(x.total)}));
    const contasOut=Object.fromEntries(Object.entries(c).map(([k,v])=>[k,numero(v)]));
    return res.json({
      periodo:{inicio,fim,anterior_inicio:anteriorInicio,anterior_fim:anteriorFim},
      resumo:{
        receitas,despesas,resultado:receitas-despesas,margem:receitas ? (receitas-despesas)/receitas*100 : null,
        qtd_receitas:numero(a.qtd_receitas),qtd_despesas:numero(a.qtd_despesas),
        receitas_anterior:numero(b.receitas),despesas_anterior:numero(b.despesas),
        resultado_anterior:numero(b.receitas)-numero(b.despesas)
      },
      categorias:categoriasOut,
      mensal:mensal.rows.map(x=>({mes:x.mes,receitas:numero(x.receitas),despesas:numero(x.despesas),resultado:numero(x.receitas)-numero(x.despesas)})),
      contas:contasOut,
      insights:construirInsights({receita:receitas,despesa:despesas,receitaAnterior:numero(b.receitas),despesaAnterior:numero(b.despesas),categorias:categoriasOut,contas:contasOut}),
      metodologia:'Análise baseada em agendamentos não cancelados e despesas registradas no período. Contas a pagar/receber são usadas apenas nos indicadores de vencimento e projeção para evitar somá-las novamente ao histórico.'
    });
  } catch (e) {
    console.error('[INTELIGENCIA FINANCEIRA] resumo:',e);
    if (e.code === '42P01') return res.status(503).json({erro:'A tabela de contas financeiras ainda não existe. Instale primeiro a migration do módulo Contas a Pagar e Receber.'});
    return res.status(500).json({erro:'Não foi possível analisar os dados financeiros.'});
  }
});

router.post('/perguntar', async (req,res) => {
  const empresa=empresaId(req);
  if (!empresa) return res.status(403).json({erro:'Empresa não identificada.'});
  const pergunta=String(req.body?.pergunta || '').trim().slice(0,500);
  if (!pergunta) return res.status(400).json({erro:'Digite uma pergunta.'});
  const hoje=hojeISO();
  const inicio=`${hoje.slice(0,7)}-01`;
  try {
    const [resumo,categorias,contas]=await Promise.all([
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(valor) FROM agendamentos WHERE empresa_id=$1 AND data >= $2::date AND data <= $3::date AND LOWER(COALESCE(status,'')) NOT IN ('cancelado','cancelada')),0) receitas,
          COALESCE((SELECT SUM(valor) FROM despesas WHERE empresa_id=$1 AND data >= $2::date AND data <= $3::date),0) despesas
      `,[empresa,inicio,hoje]),
      pool.query(`SELECT COALESCE(categoria,'Outros') categoria,SUM(valor) total FROM despesas WHERE empresa_id=$1 AND data >= $2::date AND data <= $3::date GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,[empresa,inicio,hoje]),
      pool.query(`
        SELECT
          COALESCE(SUM(valor-valor_pago) FILTER(WHERE tipo='pagar' AND status<>'cancelado'),0) pagar,
          COALESCE(SUM(valor-valor_pago) FILTER(WHERE tipo='receber' AND status<>'cancelado'),0) receber,
          COALESCE(SUM(valor-valor_pago) FILTER(WHERE tipo='pagar' AND status<>'cancelado' AND vencimento<CURRENT_DATE),0) pagar_vencido,
          COALESCE(SUM(valor-valor_pago) FILTER(WHERE tipo='receber' AND status<>'cancelado' AND vencimento<CURRENT_DATE),0) receber_vencido
        FROM contas_financeiras WHERE empresa_id=$1
      `,[empresa])
    ]);
    const r=resumo.rows[0], c=contas.rows[0], receita=numero(r.receitas), despesa=numero(r.despesas);
    const q=pergunta.toLocaleLowerCase('pt-BR');
    let resposta;
    if (/(despesa|gasto|gastando|custo)/.test(q)) {
      const top=categorias.rows[0];
      resposta=`Neste mês, as despesas registradas somam ${moeda(despesa)}.`;
      if(top) resposta+=` A categoria com maior valor é "${top.categoria}", com ${moeda(top.total)}.`;
      resposta+=' Confira se os lançamentos estão completos e compare as categorias com o mês anterior antes de decidir cortes.';
    } else if (/(receita|faturamento|vendeu|vendas|entrada)/.test(q)) {
      resposta=`Neste mês, o valor registrado em agendamentos não cancelados é ${moeda(receita)}. Isso representa o valor dos atendimentos registrados, não necessariamente o dinheiro já recebido.`;
    } else if (/(caixa|saldo|posso gastar|dispon[ií]vel|previs[aã]o)/.test(q)) {
      resposta=`As contas abertas registradas somam ${moeda(c.receber)} a receber e ${moeda(c.pagar)} a pagar. Há ${moeda(c.receber_vencido)} em recebimentos vencidos e ${moeda(c.pagar_vencido)} em pagamentos vencidos. Isso não é saldo bancário: para estimar quanto pode gastar, informe também o saldo atual das contas bancárias e confirme que todas as obrigações foram lançadas.`;
    } else if (/(atras|vencid|cobrar|inadimpl)/.test(q)) {
      resposta=`No cadastro de contas, há ${moeda(c.receber_vencido)} em valores a receber vencidos e ${moeda(c.pagar_vencido)} em valores a pagar vencidos. Revise os itens individualmente e atualize os registros após cada pagamento ou recebimento.`;
    } else if (/(lucro|resultado|sobrou|margem)/.test(q)) {
      resposta=`A diferença entre receitas registradas em agendamentos não cancelados (${moeda(receita)}) e despesas lançadas (${moeda(despesa)}) neste mês é ${moeda(receita-despesa)}. É um resultado operacional estimado com os dados disponíveis, não lucro contábil: pode não incluir impostos, custos não lançados e diferenças entre faturamento e recebimento.`;
    } else {
      resposta=`Resumo do mês: receitas registradas ${moeda(receita)}, despesas registradas ${moeda(despesa)} e diferença ${moeda(receita-despesa)}. Contas abertas: ${moeda(c.receber)} a receber e ${moeda(c.pagar)} a pagar. Posso responder melhor se perguntar sobre receitas, despesas, resultado, contas vencidas ou previsão de caixa.`;
    }
    return res.json({pergunta,resposta,baseado_em:'Dados financeiros da empresa autenticada, mês atual.',tipo:'analise_local'});
  } catch(e) {
    console.error('[INTELIGENCIA FINANCEIRA] pergunta:',e);
    if (e.code === '42P01') return res.status(503).json({erro:'Instale primeiro a migration do módulo Contas a Pagar e Receber.'});
    return res.status(500).json({erro:'Não foi possível responder com os dados financeiros atuais.'});
  }
});

module.exports=router;
