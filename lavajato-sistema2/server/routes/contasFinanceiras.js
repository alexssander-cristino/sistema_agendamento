const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');
const exigirPermissao = require('../middleware/permissao');

const router = express.Router();
router.use(autenticar);
router.use(verificarAssinatura);
router.use(exigirPermissao('financeiro'));

const TIPOS = new Set(['pagar', 'receber']);
const STATUS = new Set(['pendente', 'parcial', 'pago', 'cancelado']);
const METODOS = new Set(['pix', 'dinheiro', 'cartao', 'transferencia', 'boleto', 'outro']);

function dataValida(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function empresa(req) { return req.usuario?.empresa_id || null; }
function idValido(v) { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; }
function texto(v, max, fallback = null) {
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim();
  if (!s) return fallback;
  return s.length <= max ? s : null;
}
function dinheiro(v) {
  if (v === '' || v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && Math.round(n * 100) / 100 === n ? n : null;
}
function erro(res, status, mensagem) { return res.status(status).json({ erro: mensagem }); }

// GET /api/contas-financeiras?tipo=pagar&status=pendente&de=AAAA-MM-DD&ate=AAAA-MM-DD&busca=
router.get('/', async (req, res) => {
  const empresaId = empresa(req);
  if (!empresaId) return erro(res, 403, 'Não existe uma empresa vinculada à sessão.');

  const { tipo, status, de, ate, busca } = req.query;
  if (tipo && !TIPOS.has(String(tipo))) return erro(res, 400, 'Tipo de conta inválido.');
  if (status && status !== 'atrasadas' && !STATUS.has(String(status))) return erro(res, 400, 'Status inválido.');
  if ((de && !dataValida(String(de))) || (ate && !dataValida(String(ate)))) return erro(res, 400, 'Informe datas válidas no formato AAAA-MM-DD.');
  if (de && ate && de > ate) return erro(res, 400, 'A data inicial não pode ser posterior à final.');

  const params = [empresaId];
  const where = ['c.empresa_id = $1'];
  if (tipo) { params.push(tipo); where.push(`c.tipo = $${params.length}`); }
  if (status === 'atrasadas') {
    where.push("c.status IN ('pendente', 'parcial') AND c.vencimento < CURRENT_DATE");
  } else if (status) { params.push(status); where.push(`c.status = $${params.length}`); }
  if (de) { params.push(de); where.push(`c.vencimento >= $${params.length}::date`); }
  if (ate) { params.push(ate); where.push(`c.vencimento <= $${params.length}::date`); }
  if (busca && String(busca).trim()) {
    params.push(`%${String(busca).trim().slice(0, 100)}%`);
    where.push(`(c.descricao ILIKE $${params.length} OR COALESCE(c.contato, '') ILIKE $${params.length} OR c.categoria ILIKE $${params.length})`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT c.*,
        GREATEST(c.valor - c.valor_pago, 0)::numeric AS saldo,
        CASE WHEN c.status IN ('pendente','parcial') AND c.vencimento < CURRENT_DATE THEN TRUE ELSE FALSE END AS atrasada
       FROM contas_financeiras c
       WHERE ${where.join(' AND ')}
       ORDER BY CASE WHEN c.status IN ('pendente','parcial') AND c.vencimento < CURRENT_DATE THEN 0 ELSE 1 END,
                c.vencimento ASC, c.id DESC
       LIMIT 500`, params);
    return res.json(rows);
  } catch (e) {
    console.error('[CONTAS FINANCEIRAS] listar:', e);
    return erro(res, 500, 'Não foi possível carregar as contas. Verifique se a migration foi executada.');
  }
});

// GET /api/contas-financeiras/resumo
router.get('/resumo', async (req, res) => {
  const empresaId = empresa(req);
  if (!empresaId) return erro(res, 403, 'Não existe uma empresa vinculada à sessão.');
  try {
    const { rows } = await pool.query(`
      SELECT tipo,
        COALESCE(SUM(valor - valor_pago) FILTER (WHERE status IN ('pendente','parcial')), 0)::numeric AS em_aberto,
        COALESCE(SUM(valor - valor_pago) FILTER (WHERE status IN ('pendente','parcial') AND vencimento < CURRENT_DATE), 0)::numeric AS atrasado,
        COALESCE(SUM(valor - valor_pago) FILTER (WHERE status IN ('pendente','parcial') AND vencimento >= CURRENT_DATE AND vencimento < CURRENT_DATE + INTERVAL '7 days'), 0)::numeric AS proximos,
        COUNT(*) FILTER (WHERE status IN ('pendente','parcial'))::int AS quantidade_aberta,
        COUNT(*) FILTER (WHERE status IN ('pendente','parcial') AND vencimento < CURRENT_DATE)::int AS quantidade_atrasada
      FROM contas_financeiras
      WHERE empresa_id = $1 AND status <> 'cancelado'
      GROUP BY tipo`, [empresaId]);
    const montar = (tipo) => {
      const r = rows.find(x => x.tipo === tipo) || {};
      return { em_aberto: Number(r.em_aberto || 0), atrasado: Number(r.atrasado || 0), proximos: Number(r.proximos || 0), quantidade_aberta: Number(r.quantidade_aberta || 0), quantidade_atrasada: Number(r.quantidade_atrasada || 0) };
    };
    return res.json({ pagar: montar('pagar'), receber: montar('receber') });
  } catch (e) {
    console.error('[CONTAS FINANCEIRAS] resumo:', e);
    return erro(res, 500, 'Não foi possível carregar o resumo financeiro. Verifique se a migration foi executada.');
  }
});

// GET /api/contas-financeiras/:id/movimentacoes
router.get('/:id/movimentacoes', async (req, res) => {
  const empresaId = empresa(req); const id = idValido(req.params.id);
  if (!empresaId) return erro(res, 403, 'Empresa não identificada.');
  if (!id) return erro(res, 400, 'Identificador inválido.');
  try {
    const { rows } = await pool.query(`SELECT m.* FROM movimentacoes_contas m
      INNER JOIN contas_financeiras c ON c.id = m.conta_id AND c.empresa_id = m.empresa_id
      WHERE m.empresa_id = $1 AND m.conta_id = $2 ORDER BY m.data_pagamento DESC, m.id DESC`, [empresaId, id]);
    return res.json(rows);
  } catch (e) { console.error('[CONTAS FINANCEIRAS] movimentações:', e); return erro(res, 500, 'Não foi possível carregar o histórico de pagamentos.'); }
});

// POST /api/contas-financeiras
router.post('/', async (req, res) => {
  const empresaId = empresa(req);
  if (!empresaId) return erro(res, 403, 'Empresa não identificada.');
  const b = req.body || {};
  const tipo = String(b.tipo || '');
  const descricao = texto(b.descricao, 180, '');
  const categoria = texto(b.categoria, 80, 'Outros');
  const contato = texto(b.contato, 150);
  const valor = dinheiro(b.valor);
  const emissao = b.data_emissao || new Date().toISOString().slice(0, 10);
  const vencimento = b.vencimento;
  const observacoes = texto(b.observacoes, 5000);
  if (!TIPOS.has(tipo)) return erro(res, 400, 'Selecione pagar ou receber.');
  if (!descricao) return erro(res, 400, 'Informe uma descrição com até 180 caracteres.');
  if (!categoria) return erro(res, 400, 'A categoria deve ter até 80 caracteres.');
  if (!valor) return erro(res, 400, 'Informe um valor maior que zero, com no máximo duas casas decimais.');
  if (!dataValida(String(emissao)) || !dataValida(String(vencimento || ''))) return erro(res, 400, 'Informe datas válidas.');
  const parcelas = b.parcelas_total == null || b.parcelas_total === '' ? 1 : Number(b.parcelas_total);
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 120) return erro(res, 400, 'O número de parcelas deve ficar entre 1 e 120.');
  if (observacoes === null && b.observacoes && String(b.observacoes).trim().length > 5000) return erro(res, 400, 'Observações limitadas a 5.000 caracteres.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const group = parcelas > 1 ? (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id : null;
    const base = Math.round(valor * 100);
    const valorBase = Math.floor(base / parcelas);
    let resto = base - valorBase * parcelas;
    const criadas = [];
    const [ano, mes, dia] = String(vencimento).split('-').map(Number);
    const dataBase = new Date(Date.UTC(ano, mes - 1, dia));
    for (let i = 1; i <= parcelas; i++) {
      // Começa no dia 1 para não deixar 31/jan saltar para março.
      const dataParcela = new Date(Date.UTC(ano, mes - 1 + i - 1, 1));
      const ultimoDia = new Date(Date.UTC(dataParcela.getUTCFullYear(), dataParcela.getUTCMonth() + 1, 0)).getUTCDate();
      dataParcela.setUTCDate(Math.min(dia, ultimoDia));
      const venc = dataParcela.toISOString().slice(0, 10);
      const centavos = valorBase + (resto > 0 ? 1 : 0);
      if (resto > 0) resto--;
      const result = await client.query(`INSERT INTO contas_financeiras
        (empresa_id,tipo,descricao,categoria,contato,valor,valor_pago,data_emissao,vencimento,status,recorrente,grupo_parcela,parcela_numero,parcelas_total,observacoes,criado_por)
        VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,'pendente',$9,$10,$11,$12,$13,$14) RETURNING *`,
        [empresaId,tipo,descricao,categoria,contato,(centavos / 100).toFixed(2),emissao,venc,Boolean(b.recorrente),group,i,parcelas,observacoes,req.usuario.id]);
      criadas.push(result.rows[0]);
    }
    await client.query('COMMIT');
    return res.status(201).json({ contas: criadas, quantidade: criadas.length });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[CONTAS FINANCEIRAS] criar:', e);
    return erro(res, 500, 'Não foi possível cadastrar a conta.');
  } finally { client.release(); }
});

// POST /api/contas-financeiras/:id/pagamentos — permite baixa parcial ou total
router.post('/:id/pagamentos', async (req, res) => {
  const empresaId = empresa(req); const id = idValido(req.params.id); const b = req.body || {};
  if (!empresaId) return erro(res, 403, 'Empresa não identificada.');
  if (!id) return erro(res, 400, 'Identificador inválido.');
  const valor = dinheiro(b.valor);
  const dataPagamento = b.data_pagamento || new Date().toISOString().slice(0, 10);
  const metodo = b.metodo ? String(b.metodo) : null;
  const observacoes = texto(b.observacoes, 500);
  if (!valor) return erro(res, 400, 'Informe um valor de pagamento maior que zero.');
  if (!dataValida(String(dataPagamento))) return erro(res, 400, 'Data de pagamento inválida.');
  if (metodo && !METODOS.has(metodo)) return erro(res, 400, 'Método de pagamento inválido.');
  if (b.observacoes && String(b.observacoes).length > 500) return erro(res, 400, 'Observações limitadas a 500 caracteres.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const contaResult = await client.query(`SELECT * FROM contas_financeiras WHERE id=$1 AND empresa_id=$2 FOR UPDATE`, [id, empresaId]);
    if (!contaResult.rows.length) { await client.query('ROLLBACK'); return erro(res, 404, 'Conta não encontrada.'); }
    const conta = contaResult.rows[0];
    if (conta.status === 'cancelado') { await client.query('ROLLBACK'); return erro(res, 409, 'Não é possível pagar uma conta cancelada.'); }
    const saldo = Math.round((Number(conta.valor) - Number(conta.valor_pago)) * 100) / 100;
    if (valor > saldo + 0.001) { await client.query('ROLLBACK'); return erro(res, 400, `O valor excede o saldo restante de R$ ${saldo.toFixed(2)}.`); }
    await client.query(`INSERT INTO movimentacoes_contas (empresa_id,conta_id,valor,data_pagamento,metodo,observacoes,criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [empresaId,id,valor,dataPagamento,metodo,observacoes,req.usuario.id]);
    const pagoNovo = Math.round((Number(conta.valor_pago) + valor) * 100) / 100;
    const statusNovo = pagoNovo >= Number(conta.valor) ? 'pago' : 'parcial';
    const atualizado = await client.query(`UPDATE contas_financeiras SET valor_pago=$1,status=$2,atualizado_em=NOW() WHERE id=$3 AND empresa_id=$4 RETURNING *, GREATEST(valor-valor_pago,0)::numeric AS saldo`, [pagoNovo,statusNovo,id,empresaId]);
    await client.query('COMMIT');
    return res.status(201).json(atualizado.rows[0]);
  } catch (e) { await client.query('ROLLBACK'); console.error('[CONTAS FINANCEIRAS] registrar pagamento:', e); return erro(res, 500, 'Não foi possível registrar o pagamento.'); }
  finally { client.release(); }
});

// PUT /api/contas-financeiras/:id — edição sem alterar histórico de pagamentos
router.put('/:id', async (req, res) => {
  const empresaId = empresa(req); const id = idValido(req.params.id); const b = req.body || {};
  if (!empresaId) return erro(res, 403, 'Empresa não identificada.');
  if (!id) return erro(res, 400, 'Identificador inválido.');
  const descricao = texto(b.descricao, 180, ''); const categoria = texto(b.categoria, 80, 'Outros');
  const contato = texto(b.contato, 150); const valor = dinheiro(b.valor);
  const emissao = b.data_emissao; const vencimento = b.vencimento; const observacoes = texto(b.observacoes, 5000);
  if (!descricao || !valor || !dataValida(String(emissao || '')) || !dataValida(String(vencimento || ''))) return erro(res, 400, 'Confira descrição, valor e datas.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const atual = await client.query('SELECT * FROM contas_financeiras WHERE id=$1 AND empresa_id=$2 FOR UPDATE', [id,empresaId]);
    if (!atual.rows.length) { await client.query('ROLLBACK'); return erro(res,404,'Conta não encontrada.'); }
    const c = atual.rows[0];
    if (c.status === 'cancelado' || c.status === 'pago') { await client.query('ROLLBACK'); return erro(res,409,'Contas pagas ou canceladas não podem ser editadas.'); }
    if (valor < Number(c.valor_pago)) { await client.query('ROLLBACK'); return erro(res,400,'O valor total não pode ser menor que o valor já pago.'); }
    const status = Number(c.valor_pago) > 0 ? (Number(c.valor_pago) >= valor ? 'pago' : 'parcial') : 'pendente';
    const result = await client.query(`UPDATE contas_financeiras SET descricao=$1,categoria=$2,contato=$3,valor=$4,data_emissao=$5,vencimento=$6,observacoes=$7,status=$8,atualizado_em=NOW() WHERE id=$9 AND empresa_id=$10 RETURNING *,GREATEST(valor-valor_pago,0)::numeric AS saldo`, [descricao,categoria || 'Outros',contato,valor,emissao,vencimento,observacoes,status,id,empresaId]);
    await client.query('COMMIT'); return res.json(result.rows[0]);
  } catch (e) { await client.query('ROLLBACK'); console.error('[CONTAS FINANCEIRAS] editar:',e); return erro(res,500,'Não foi possível atualizar a conta.'); }
  finally { client.release(); }
});

// PATCH /api/contas-financeiras/:id/cancelar — mantém histórico para auditoria
router.patch('/:id/cancelar', async (req,res) => {
  const empresaId=empresa(req); const id=idValido(req.params.id);
  if(!empresaId) return erro(res,403,'Empresa não identificada.');
  if(!id) return erro(res,400,'Identificador inválido.');
  try {
    const r=await pool.query(`UPDATE contas_financeiras SET status='cancelado',atualizado_em=NOW() WHERE id=$1 AND empresa_id=$2 AND status IN ('pendente','parcial') RETURNING *`,[id,empresaId]);
    if(!r.rows.length) return erro(res,409,'Conta não encontrada ou não pode ser cancelada.');
    return res.json(r.rows[0]);
  } catch(e) { console.error('[CONTAS FINANCEIRAS] cancelar:',e); return erro(res,500,'Não foi possível cancelar a conta.'); }
});

module.exports = router;
