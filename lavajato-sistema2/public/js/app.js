(function(){
  "use strict";

  const API = '/api';

  let state = {
    services: [],
    appointments: []   // appointments for the currently selected date (agenda)
  };
  let allDoneCache = []; // completed appointments across a wide range, for faturamento/financeiro
  let allExpensesCache = []; // expenses across a wide range, for financeiro/despesas
  let currentAgendaItems = []; // appointments currently shown in the Agenda tab
  let activeTab = 'agenda';
  let selectedDate = todayISO();
  let editingServiceId = null;
  let editingAppointmentId = null;

  function todayISO(){
    const d = new Date();
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off*60000);
    return local.toISOString().slice(0,10);
  }
  function uid(){
    return 'tmp-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  }
  function money(n){
    return 'R$ ' + (Number(n)||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  }
  function fmtDatePretty(iso){
    const [y,m,d] = iso.split('-');
    const date = new Date(Number(y), Number(m)-1, Number(d));
    return date.toLocaleDateString('pt-BR', {weekday:'long', day:'numeric', month:'long'});
  }
  function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---------- API HELPERS ----------
  async function api(path, options){
    const res = await fetch(API + path, Object.assign({
      headers: {'Content-Type':'application/json'}
    }, options));
    if(!res.ok){
      let msg = 'Erro na requisição';
      try{ const j = await res.json(); msg = j.erro || msg; }catch(e){}
      throw new Error(msg);
    }
    if(res.status === 204) return null;
    return res.json();
  }

  async function checkConnection(){
    const badge = document.getElementById('conn-badge');
    try{
      await api('/status');
      badge.textContent = 'conectado';
      badge.className = 'ok';
    }catch(e){
      badge.textContent = 'sem conexão';
      badge.className = 'fail';
    }
  }

  // ---------- TAB SWITCHING (sidebar + bottom nav) ----------
  function goToTab(tab){
    activeTab = tab;
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
    document.querySelectorAll('.bn-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    document.getElementById('panel-'+tab).classList.add('active');
    loadTabData(tab);
  }
  document.querySelectorAll('.nav-btn, .bn-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> goToTab(btn.dataset.tab));
  });

  async function loadTabData(tab){
    if(tab === 'agenda') await refreshAgenda();
    if(tab === 'faturamento') await refreshFaturamento();
    if(tab === 'financeiro') await refreshFinanceiro();
    if(tab === 'servicos') await refreshServicos();
    if(tab === 'clientes') document.getElementById('cli-search-input').focus();
    if(tab === 'despesas') await refreshDespesas();
  }

  // ---------- SERVICES ----------
  async function loadServices(){
    state.services = await api('/servicos');
  }
  function serviceName(id){
    const s = state.services.find(x=>String(x.id)===String(id));
    return s ? s.nome : 'Serviço removido';
  }

  // ---------- AGENDA ----------
  const dateInput = document.getElementById('agenda-date-input');
  dateInput.value = selectedDate;
  dateInput.addEventListener('change', ()=>{
    selectedDate = dateInput.value || todayISO();
    refreshAgenda();
  });
  document.getElementById('btn-today').addEventListener('click', ()=>{
    selectedDate = todayISO();
    dateInput.value = selectedDate;
    refreshAgenda();
  });

  async function refreshAgenda(){
    document.getElementById('agenda-date-label').textContent = capitalize(fmtDatePretty(selectedDate));
    const list = document.getElementById('agenda-list');
    list.innerHTML = '<div class="empty">Carregando…</div>';
    try{
      const items = await api('/agendamentos?data=' + selectedDate);
      currentAgendaItems = items;
      renderAgendaList(items);
      updateSideStats();
    }catch(e){
      list.innerHTML = '<div class="empty"><strong>Não foi possível carregar a agenda</strong>Verifique a conexão com o banco de dados.</div>';
    }
  }

  function renderAgendaList(items){
    const list = document.getElementById('agenda-list');
    items = items.slice().sort((a,b)=> a.hora.localeCompare(b.hora));
    if(items.length===0){
      list.innerHTML = '<div class="empty"><strong>Nenhum agendamento nesta data</strong>Toque em "Novo agendamento" para adicionar o primeiro carro do dia.</div>';
    } else {
      list.innerHTML = items.map(ap=>{
        const [h,m] = ap.hora.slice(0,5).split(':');
        let actions = `<button class="btn btn-small btn-ghost" onclick="App.openEditAppointment('${ap.id}')">Editar</button>`;
        if(ap.status==='agendado'){
          actions += `<button class="btn btn-small btn-accent" onclick="App.setStatus('${ap.id}','em_andamento')">Iniciar</button>`;
          actions += `<button class="btn btn-small btn-ghost" onclick="App.setStatus('${ap.id}','cancelado')">Cancelar</button>`;
        } else if(ap.status==='em_andamento'){
          actions += `<button class="btn btn-small btn-primary" onclick="App.setStatus('${ap.id}','concluido')">Concluir</button>`;
          actions += `<button class="btn btn-small btn-ghost" onclick="App.setStatus('${ap.id}','cancelado')">Cancelar</button>`;
        } else if(ap.status==='cancelado'){
          actions += `<button class="btn btn-small btn-ghost" onclick="App.deleteAppointment('${ap.id}')">Remover</button>`;
        } else if(ap.status==='concluido'){
          actions += `<span class="badge badge-${ap.status_pagamento}">${ap.status_pagamento==='pago'?'Pago':'A receber'}</span>`;
        }
        const statusLabel = {agendado:'agendado', em_andamento:'em lavagem', concluido:'concluído', cancelado:'cancelado'}[ap.status];
        return `
        <div class="ticket status-${ap.status}">
          <div class="ticket-time">${h}:${m}<small>${statusLabel}</small></div>
          <div class="ticket-body">
            <div class="client">${escapeHtml(ap.cliente)}</div>
            <div class="meta">
              <span>${escapeHtml(ap.servico_nome || serviceName(ap.servico_id))}</span>
              ${ap.veiculo?`<span>${escapeHtml(ap.veiculo)}</span>`:''}
              ${ap.placa?`<span>${escapeHtml(ap.placa.toUpperCase())}</span>`:''}
            </div>
          </div>
          <div class="ticket-actions">
            <span class="price-tag">${money(ap.valor)}</span>
            ${actions}
          </div>
        </div>`;
      }).join('');
    }
    document.getElementById('nav-count-agenda').textContent = items.filter(a=>a.status!=='cancelado').length || '';
  }

  // ---------- NOVO AGENDAMENTO / EDITAR ----------
  const overlayAppointment = document.getElementById('overlay-appointment');
  document.getElementById('btn-new-appointment').addEventListener('click', async ()=>{
    editingAppointmentId = null;
    document.getElementById('appointment-modal-title').textContent = 'Novo agendamento';
    document.getElementById('appointment-submit-btn').textContent = 'Agendar';
    document.getElementById('ap-date').value = selectedDate;
    document.getElementById('ap-time').value = '';
    document.getElementById('ap-client').value = '';
    document.getElementById('ap-phone').value = '';
    document.getElementById('ap-plate').value = '';
    document.getElementById('ap-vehicle').value = '';
    if(state.services.length===0) await loadServices();
    fillServiceSelect();
    updatePriceFromService();
    overlayAppointment.classList.add('active');
    document.getElementById('ap-client').focus();
  });
  document.getElementById('btn-cancel-appointment').addEventListener('click', ()=>{
    overlayAppointment.classList.remove('active');
  });
  overlayAppointment.addEventListener('click', (e)=>{ if(e.target===overlayAppointment) overlayAppointment.classList.remove('active'); });

  async function openEditAppointment(id){
    const ap = currentAgendaItems.find(a=>String(a.id)===String(id));
    if(!ap) return;
    editingAppointmentId = id;
    document.getElementById('appointment-modal-title').textContent = 'Editar agendamento';
    document.getElementById('appointment-submit-btn').textContent = 'Salvar alterações';
    if(state.services.length===0) await loadServices();
    fillServiceSelect();
    document.getElementById('ap-date').value = ap.data;
    document.getElementById('ap-time').value = ap.hora.slice(0,5);
    document.getElementById('ap-client').value = ap.cliente;
    document.getElementById('ap-phone').value = ap.telefone || '';
    document.getElementById('ap-plate').value = ap.placa || '';
    document.getElementById('ap-vehicle').value = ap.veiculo || '';
    document.getElementById('ap-service').value = ap.servico_id;
    document.getElementById('ap-price').value = ap.valor;
    overlayAppointment.classList.add('active');
  }

  function fillServiceSelect(){
    const sel = document.getElementById('ap-service');
    sel.innerHTML = state.services.map(s=>`<option value="${s.id}">${escapeHtml(s.nome)} — ${money(s.preco)}</option>`).join('');
  }
  document.getElementById('ap-service').addEventListener('change', updatePriceFromService);
  function updatePriceFromService(){
    const sel = document.getElementById('ap-service');
    const s = state.services.find(x=>String(x.id)===String(sel.value));
    if(s) document.getElementById('ap-price').value = s.preco;
  }

  // busca uma janela ampla (últimos 90 dias) de agendamentos concluídos
  // e atualiza os totais da sidebar — usada tanto na abertura do sistema
  // quanto depois de qualquer ação (criar, concluir, pagar, remover)
  async function refreshSideStats(){
    try{
      const range = await fetchWideRange();
      allDoneCache = range.filter(a=>a.status==='concluido');
      updateSideStats();
    }catch(e){
      // mantém os últimos valores conhecidos em caso de falha de rede
    }
  }

  // ---------- CONFLITO DE HORÁRIO ----------
  function timeToMinutes(t){
    const [h,m] = t.split(':').map(Number);
    return h*60+m;
  }
  function serviceDuration(servico_id){
    const s = state.services.find(x=>String(x.id)===String(servico_id));
    return s ? (Number(s.duracao_min)||30) : 30;
  }
  // verifica se o horário informado bate em cima de outro agendamento já
  // existente na mesma data (considerando a duração de cada serviço)
  async function findConflict(data, hora, servico_id, excludeId){
    let items;
    try{
      items = await api('/agendamentos?data=' + data);
    }catch(e){
      return null; // se não der pra checar, não bloqueia o usuário
    }
    const novoInicio = timeToMinutes(hora);
    const novoFim = novoInicio + serviceDuration(servico_id);
    for(const ap of items){
      if(ap.status === 'cancelado') continue;
      if(excludeId && String(ap.id) === String(excludeId)) continue;
      const inicio = timeToMinutes(ap.hora.slice(0,5));
      const fim = inicio + serviceDuration(ap.servico_id);
      if(novoInicio < fim && inicio < novoFim){
        return ap;
      }
    }
    return null;
  }

  document.getElementById('form-appointment').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const payload = {
      data: document.getElementById('ap-date').value,
      hora: document.getElementById('ap-time').value,
      cliente: document.getElementById('ap-client').value.trim(),
      telefone: document.getElementById('ap-phone').value.trim(),
      placa: document.getElementById('ap-plate').value.trim(),
      veiculo: document.getElementById('ap-vehicle').value.trim(),
      servico_id: document.getElementById('ap-service').value,
      valor: parseFloat(document.getElementById('ap-price').value) || 0
    };

    const conflito = await findConflict(payload.data, payload.hora, payload.servico_id, editingAppointmentId);
    if(conflito){
      const nomeServico = conflito.servico_nome || serviceName(conflito.servico_id);
      const seguir = confirm(
        `Esse horário conflita com o agendamento de ${conflito.cliente} às ${conflito.hora.slice(0,5)} (${nomeServico}).\n\nAgendar mesmo assim?`
      );
      if(!seguir) return;
    }

    try{
      if(editingAppointmentId){
        await api('/agendamentos/'+editingAppointmentId, {method:'PATCH', body: JSON.stringify(payload)});
      } else {
        await api('/agendamentos', {method:'POST', body: JSON.stringify(payload)});
      }
      overlayAppointment.classList.remove('active');
      selectedDate = payload.data;
      dateInput.value = selectedDate;
      await refreshAgenda();
      await refreshSideStats();
    }catch(err){
      alert('Não foi possível salvar: ' + err.message);
    }
  });

  // ---------- STATUS / PAGAMENTO ----------
  async function setStatus(id, status){
    try{
      await api('/agendamentos/'+id, {method:'PATCH', body: JSON.stringify({status})});
      await refreshCurrentTab();
    }catch(e){ alert('Erro ao atualizar status: '+e.message); }
  }
  async function deleteAppointment(id){
    if(!confirm('Remover este agendamento definitivamente?')) return;
    try{
      await api('/agendamentos/'+id, {method:'DELETE'});
      await refreshCurrentTab();
    }catch(e){ alert('Erro ao remover: '+e.message); }
  }
  async function setPayment(id, status_pagamento){
    try{
      await api('/agendamentos/'+id, {method:'PATCH', body: JSON.stringify({status_pagamento})});
      await refreshCurrentTab();
    }catch(e){ alert('Erro ao atualizar pagamento: '+e.message); }
  }
  async function setPaymentMethod(id, forma_pagamento){
    try{
      await api('/agendamentos/'+id, {method:'PATCH', body: JSON.stringify({forma_pagamento})});
    }catch(e){ console.error(e); }
  }
  async function undoPayment(id){
    if(!confirm('Desfazer a confirmação de pagamento? Você poderá trocar a forma de pagamento novamente depois.')) return;
    try{
      await api('/agendamentos/'+id, {method:'PATCH', body: JSON.stringify({status_pagamento:'pendente'})});
      await refreshCurrentTab();
    }catch(e){ alert('Erro ao desfazer: '+e.message); }
  }
  async function refreshCurrentTab(){
    await loadTabData(activeTab);
    await refreshSideStats();
  }

  // ---------- FATURAMENTO ----------
  async function refreshFaturamento(){
    const container = document.getElementById('fat-list');
    container.innerHTML = '<div class="empty">Carregando…</div>';
    try{
      const range = await fetchWideRange();
      allDoneCache = range.filter(a=>a.status==='concluido');
      renderFaturamento();
    }catch(e){
      container.innerHTML = '<div class="empty"><strong>Não foi possível carregar o faturamento</strong>Verifique a conexão com o banco de dados.</div>';
    }
  }

  function renderFaturamento(){
    const done = allDoneCache.slice().sort((a,b)=> (b.data+b.hora).localeCompare(a.data+a.hora));
    const total = done.reduce((s,a)=>s+Number(a.valor),0);
    const pago = done.filter(a=>a.status_pagamento==='pago').reduce((s,a)=>s+Number(a.valor),0);
    const pendente = total - pago;
    document.getElementById('fat-total').textContent = money(total);
    document.getElementById('fat-pago').textContent = money(pago);
    document.getElementById('fat-pendente').textContent = money(pendente);
    document.getElementById('nav-count-fat').textContent = done.filter(a=>a.status_pagamento==='pendente').length || '';

    const list = document.getElementById('fat-list');
    if(done.length===0){
      list.innerHTML = '<div class="empty"><strong>Nenhum serviço concluído ainda</strong>Conclua um agendamento na Agenda para ele aparecer aqui.</div>';
      return;
    }
    list.innerHTML = done.map(ap=>`
      <div class="invoice-row">
        <div>
          <div class="client">${escapeHtml(ap.cliente)}</div>
          <div class="meta">${new Date(ap.data+'T00:00:00').toLocaleDateString('pt-BR')} · ${escapeHtml(ap.servico_nome || serviceName(ap.servico_id))}${ap.veiculo?' · '+escapeHtml(ap.veiculo):''}</div>
        </div>
        <span class="price-tag">${money(ap.valor)}</span>
        ${ap.status_pagamento==='pago'
          ? `<div class="pay-method-locked">${ap.forma_pagamento ? escapeHtml(ap.forma_pagamento) : 'Forma não informada'}</div>`
          : `<select class="pay-method" onchange="App.setPaymentMethod('${ap.id}', this.value)">
              <option value="" ${!ap.forma_pagamento?'selected':''}>Forma de pagamento</option>
              <option value="Dinheiro" ${ap.forma_pagamento==='Dinheiro'?'selected':''}>Dinheiro</option>
              <option value="Pix" ${ap.forma_pagamento==='Pix'?'selected':''}>Pix</option>
              <option value="Cartão de débito" ${ap.forma_pagamento==='Cartão de débito'?'selected':''}>Cartão de débito</option>
              <option value="Cartão de crédito" ${ap.forma_pagamento==='Cartão de crédito'?'selected':''}>Cartão de crédito</option>
            </select>`}
        <div class="ticket-actions">
          ${ap.status_pagamento==='pago'
            ? `<span class="badge badge-pago" title="Toque para desfazer o pagamento" onclick="App.undoPayment('${ap.id}')">Pago</span>`
            : `<button class="btn btn-small btn-primary" onclick="App.setPayment('${ap.id}','pago')">Marcar pago</button>`}
          <button class="btn btn-small btn-ghost" onclick="App.printReceipt('${ap.id}')">Recibo</button>
        </div>
      </div>
    `).join('');
  }

  function printReceipt(id){
    const ap = allDoneCache.find(a=>String(a.id)===String(id));
    if(!ap) return;
    const dataHora = new Date(ap.data+'T00:00:00').toLocaleDateString('pt-BR') + ' às ' + ap.hora.slice(0,5);
    document.getElementById('print-area').innerHTML = `
      <div class="recibo-header">
        <h2>Lavajato — Recibo</h2>
        <div>${dataHora}</div>
      </div>
      <div class="recibo-row"><span>Cliente</span><span>${escapeHtml(ap.cliente)}</span></div>
      ${ap.veiculo?`<div class="recibo-row"><span>Veículo</span><span>${escapeHtml(ap.veiculo)}</span></div>`:''}
      ${ap.placa?`<div class="recibo-row"><span>Placa</span><span>${escapeHtml(ap.placa.toUpperCase())}</span></div>`:''}
      <div class="recibo-row"><span>Serviço</span><span>${escapeHtml(ap.servico_nome || serviceName(ap.servico_id))}</span></div>
      <div class="recibo-row"><span>Forma de pagamento</span><span>${ap.forma_pagamento||'—'}</span></div>
      <div class="recibo-total"><span>Total</span><span>${money(ap.valor)}</span></div>
    `;
    window.print();
  }

  // ---------- FECHAMENTO DO DIA ----------
  document.getElementById('btn-closing').addEventListener('click', printClosing);

  async function printClosing(){
    let items;
    try{
      items = await api('/agendamentos?data=' + selectedDate);
    }catch(e){
      alert('Não foi possível carregar os dados do fechamento.');
      return;
    }
    const done = items.filter(a=>a.status==='concluido').sort((a,b)=>a.hora.localeCompare(b.hora));
    const total = done.reduce((s,a)=>s+Number(a.valor),0);
    const pago = done.filter(a=>a.status_pagamento==='pago').reduce((s,a)=>s+Number(a.valor),0);
    const pendente = total - pago;

    const porForma = {};
    done.filter(a=>a.status_pagamento==='pago').forEach(a=>{
      const f = a.forma_pagamento || 'Não informado';
      porForma[f] = (porForma[f]||0) + Number(a.valor);
    });
    const formaLinhas = Object.entries(porForma)
      .map(([f,v])=>`<div class="recibo-row"><span>${escapeHtml(f)}</span><span>${money(v)}</span></div>`)
      .join('') || '<div class="recibo-row"><span>Nenhum pagamento confirmado</span><span></span></div>';

    const linhas = done.map(a=>`
      <div class="recibo-row"><span>${a.hora.slice(0,5)} — ${escapeHtml(a.cliente)} (${escapeHtml(a.servico_nome||serviceName(a.servico_id))})</span><span>${money(a.valor)}</span></div>
    `).join('') || '<div class="recibo-row"><span>Nenhuma lavagem concluída nesta data.</span><span></span></div>';

    const pendentesQtd = items.filter(a=>a.status==='agendado' || a.status==='em_andamento').length;

    document.getElementById('print-area').innerHTML = `
      <div class="recibo-header">
        <h2>Lavajato — Fechamento do dia</h2>
        <div>${capitalize(fmtDatePretty(selectedDate))}</div>
      </div>
      <div class="recibo-row" style="font-weight:600;"><span>Lavagens concluídas</span><span>${done.length}</span></div>
      ${linhas}
      <div class="recibo-total"><span>Total faturado</span><span>${money(total)}</span></div>
      <div class="recibo-row"><span>Recebido</span><span>${money(pago)}</span></div>
      <div class="recibo-row"><span>Pendente</span><span>${money(pendente)}</span></div>
      <h3 style="margin-top:18px;font-size:14px;">Por forma de pagamento</h3>
      ${formaLinhas}
      ${pendentesQtd>0?`<div class="recibo-row" style="margin-top:12px;"><span>Ainda agendados/em andamento hoje</span><span>${pendentesQtd}</span></div>`:''}
    `;
    window.print();
  }

  // ---------- FINANCEIRO ----------
  async function refreshFinanceiro(){
    try{
      const [range, despesas] = await Promise.all([fetchWideRange(), fetchWideRangeExpenses()]);
      allDoneCache = range.filter(a=>a.status==='concluido');
      allExpensesCache = despesas;
      renderFinanceiro();
    }catch(e){
      document.getElementById('fin-bars').innerHTML = '<div class="empty"><strong>Não foi possível carregar os dados</strong>Verifique a conexão com o banco de dados.</div>';
    }
  }

  // busca uma janela ampla (últimos 90 dias) — suficiente para hoje/semana/mês/faturamento
  async function fetchWideRange(){
    const now = new Date();
    const past = new Date(now); past.setDate(now.getDate()-90);
    const de = past.toISOString().slice(0,10);
    const ate = now.toISOString().slice(0,10);
    return api(`/agendamentos?de=${de}&ate=${ate}`);
  }

  // mesma janela de 90 dias, mas para despesas
  async function fetchWideRangeExpenses(){
    const now = new Date();
    const past = new Date(now); past.setDate(now.getDate()-90);
    const de = past.toISOString().slice(0,10);
    const ate = now.toISOString().slice(0,10);
    return api(`/despesas?de=${de}&ate=${ate}`);
  }

  function renderFinanceiro(){
    const done = allDoneCache;
    const today = todayISO();
    const now = new Date();
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate()-6);
    const monthStr = today.slice(0,7);

    const sumWhere = (fn)=> done.filter(fn).reduce((s,a)=>s+Number(a.valor),0);

    const hoje = sumWhere(a=>a.data===today);
    const semana = sumWhere(a=> a.data >= sevenDaysAgo.toISOString().slice(0,10));
    const mes = sumWhere(a=> a.data.slice(0,7)===monthStr);
    const doneMes = done.filter(a=> a.data.slice(0,7)===monthStr);

    document.getElementById('fin-hoje').textContent = money(hoje);
    document.getElementById('fin-semana').textContent = money(semana);
    document.getElementById('fin-mes').textContent = money(mes);
    document.getElementById('fin-count').textContent = doneMes.length;

    // despesas e lucro do mês
    const despesasMes = allExpensesCache.filter(d=> d.data.slice(0,7)===monthStr);
    const totalDespesasMes = despesasMes.reduce((s,d)=>s+Number(d.valor),0);
    const lucroMes = mes - totalDespesasMes;
    document.getElementById('fin-despesas-mes').textContent = money(totalDespesasMes);
    const lucroEl = document.getElementById('fin-lucro-mes');
    lucroEl.textContent = money(lucroMes);
    document.getElementById('fin-lucro-card').classList.toggle('negative', lucroMes < 0);

    const bySvc = {};
    doneMes.forEach(a=>{
      const name = a.servico_nome || serviceName(a.servico_id);
      bySvc[name] = (bySvc[name]||0) + Number(a.valor);
    });
    const entries = Object.entries(bySvc).sort((a,b)=>b[1]-a[1]);
    const maxVal = entries.length ? entries[0][1] : 0;
    const bars = document.getElementById('fin-bars');
    if(entries.length===0){
      bars.innerHTML = '<div class="empty">Nenhum faturamento registrado este mês ainda.</div>';
    } else {
      bars.innerHTML = entries.map(([name,val])=>`
        <div class="bar-row">
          <div class="name">${escapeHtml(name)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${maxVal? (val/maxVal*100):0}%"></div></div>
          <div class="amount">${money(val)}</div>
        </div>
      `).join('');
    }

    // despesas por categoria, mês atual
    const byCat = {};
    despesasMes.forEach(d=>{
      const cat = d.categoria || 'Outros';
      byCat[cat] = (byCat[cat]||0) + Number(d.valor);
    });
    const catEntries = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
    const maxCat = catEntries.length ? catEntries[0][1] : 0;
    const despesasBars = document.getElementById('fin-despesas-bars');
    if(catEntries.length===0){
      despesasBars.innerHTML = '<div class="empty">Nenhuma despesa registrada este mês ainda.</div>';
    } else {
      despesasBars.innerHTML = catEntries.map(([cat,val])=>`
        <div class="bar-row">
          <div class="name">${escapeHtml(cat)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${maxCat? (val/maxCat*100):0}%"></div></div>
          <div class="amount">${money(val)}</div>
        </div>
      `).join('');
    }

    updateSideStats(hoje);
  }

  function updateSideStats(hojeVal){
    if(hojeVal === undefined){
      const today = todayISO();
      hojeVal = allDoneCache.filter(a=>a.data===today).reduce((s,a)=>s+Number(a.valor),0);
    }
    document.getElementById('side-today').textContent = money(hojeVal);
    const pendenteTotal = allDoneCache.filter(a=>a.status_pagamento==='pendente').reduce((s,a)=>s+Number(a.valor),0);
    document.getElementById('side-pending').textContent = money(pendenteTotal);
  }

  // ---------- SERVIÇOS ----------
  const overlayService = document.getElementById('overlay-service');
  document.getElementById('btn-new-service').addEventListener('click', ()=>{
    editingServiceId = null;
    document.getElementById('sv-name').value='';
    document.getElementById('sv-price').value='';
    document.getElementById('sv-duration').value='';
    overlayService.classList.add('active');
  });
  document.getElementById('btn-cancel-service').addEventListener('click', ()=> overlayService.classList.remove('active'));
  overlayService.addEventListener('click', (e)=>{ if(e.target===overlayService) overlayService.classList.remove('active'); });

  document.getElementById('form-service').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const nome = document.getElementById('sv-name').value.trim();
    const preco = parseFloat(document.getElementById('sv-price').value)||0;
    const duracao_min = parseInt(document.getElementById('sv-duration').value)||0;
    try{
      if(editingServiceId){
        await api('/servicos/'+editingServiceId, {method:'PUT', body: JSON.stringify({nome, preco, duracao_min})});
      } else {
        await api('/servicos', {method:'POST', body: JSON.stringify({nome, preco, duracao_min})});
      }
      overlayService.classList.remove('active');
      await loadServices();
      await refreshServicos();
    }catch(err){
      alert('Não foi possível salvar o serviço: ' + err.message);
    }
  });

  function editService(id){
    const s = state.services.find(x=>String(x.id)===String(id));
    if(!s) return;
    editingServiceId = id;
    document.getElementById('sv-name').value = s.nome;
    document.getElementById('sv-price').value = s.preco;
    document.getElementById('sv-duration').value = s.duracao_min;
    overlayService.classList.add('active');
  }
  async function removeService(id){
    if(!confirm('Remover este serviço permanentemente? Agendamentos que já usam esse serviço continuam existindo, só perdem a referência ao nome.')) return;
    try{
      await api('/servicos/'+id, {method:'DELETE'});
      await loadServices();
      await refreshServicos();
    }catch(e){ alert('Erro ao remover: '+e.message); }
  }

  async function refreshServicos(){
    if(state.services.length===0) await loadServices();
    const list = document.getElementById('services-list');
    if(state.services.length===0){
      list.innerHTML = '<div class="empty">Nenhum serviço cadastrado.</div>';
      return;
    }
    list.innerHTML = state.services.map(s=>`
      <div class="invoice-row" style="grid-template-columns:1fr auto auto;">
        <div>
          <div class="client">${escapeHtml(s.nome)}</div>
          <div class="meta">${s.duracao_min} min</div>
        </div>
        <span class="price-tag">${money(s.preco)}</span>
        <div class="ticket-actions">
          <button class="btn btn-small btn-ghost" onclick="App.editService('${s.id}')">Editar</button>
          <button class="btn btn-small btn-ghost" onclick="App.removeService('${s.id}')">Remover</button>
        </div>
      </div>
    `).join('');
  }

  // ---------- CLIENTES (histórico e busca) ----------
  document.getElementById('btn-cli-search').addEventListener('click', runClientSearch);
  document.getElementById('cli-search-input').addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); runClientSearch(); }
  });
  document.getElementById('cli-search-input').addEventListener('input', (e)=>{
    document.getElementById('btn-cli-clear').classList.toggle('visible', e.target.value.length > 0);
  });
  document.getElementById('btn-cli-clear').addEventListener('click', ()=>{
    const input = document.getElementById('cli-search-input');
    input.value = '';
    document.getElementById('btn-cli-clear').classList.remove('visible');
    document.getElementById('cli-summary').innerHTML = '';
    document.getElementById('cli-results').innerHTML = `
      <div class="empty">
        <svg class="empty-icon" viewBox="0 0 20 20"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M17 17l-4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        <strong>Busque um cliente</strong>Digite nome, telefone ou placa e veja todo o histórico de lavagens dessa pessoa.
      </div>`;
    input.focus();
  });

  async function runClientSearch(){
    const termo = document.getElementById('cli-search-input').value.trim();
    const resultsEl = document.getElementById('cli-results');
    const summaryEl = document.getElementById('cli-summary');
    if(!termo){
      resultsEl.innerHTML = `
        <div class="empty">
          <svg class="empty-icon" viewBox="0 0 20 20"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M17 17l-4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <strong>Busque um cliente</strong>Digite nome, telefone ou placa e veja todo o histórico de lavagens dessa pessoa.
        </div>`;
      summaryEl.innerHTML = '';
      return;
    }
    resultsEl.innerHTML = '<div class="empty">Buscando…</div>';
    summaryEl.innerHTML = '';
    try{
      const items = await api('/agendamentos?busca=' + encodeURIComponent(termo));
      renderClientResults(items);
    }catch(e){
      resultsEl.innerHTML = '<div class="empty"><strong>Não foi possível buscar</strong>Verifique a conexão com o banco de dados.</div>';
    }
  }

  function renderClientResults(items){
    const summaryEl = document.getElementById('cli-summary');
    const resultsEl = document.getElementById('cli-results');
    if(items.length===0){
      summaryEl.innerHTML = '';
      resultsEl.innerHTML = '<div class="empty"><strong>Nada encontrado</strong>Confira se digitou corretamente.</div>';
      return;
    }
    const concluidos = items.filter(a=>a.status==='concluido');
    const totalGasto = concluidos.reduce((s,a)=>s+Number(a.valor),0);
    const ultima = items[0]; // já vem ordenado por data/hora decrescente
    summaryEl.innerHTML = `
      <div class="totals-strip">
        <div class="stat-card"><div class="label">Visitas encontradas</div><div class="value">${items.length}</div></div>
        <div class="stat-card money"><div class="label">Total gasto (concluídos)</div><div class="value">${money(totalGasto)}</div></div>
        <div class="stat-card"><div class="label">Última visita</div><div class="value" style="font-size:16px;">${new Date(ultima.data+'T00:00:00').toLocaleDateString('pt-BR')}</div></div>
      </div>
    `;
    resultsEl.innerHTML = items.map(ap=>{
      const statusLabel = {agendado:'agendado', em_andamento:'em lavagem', concluido:'concluído', cancelado:'cancelado'}[ap.status];
      const dataCurta = new Date(ap.data+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
      return `
      <div class="ticket status-${ap.status}">
        <div class="ticket-time">${dataCurta}<small>${statusLabel}</small></div>
        <div class="ticket-body">
          <div class="client">${escapeHtml(ap.cliente)}</div>
          <div class="meta">
            <span>${ap.hora.slice(0,5)}</span>
            <span>${escapeHtml(ap.servico_nome || serviceName(ap.servico_id))}</span>
            ${ap.veiculo?`<span>${escapeHtml(ap.veiculo)}</span>`:''}
            ${ap.placa?`<span>${escapeHtml(ap.placa.toUpperCase())}</span>`:''}
          </div>
        </div>
        <div class="ticket-actions">
          <span class="price-tag">${money(ap.valor)}</span>
        </div>
      </div>`;
    }).join('');
  }

  window.App = {
    setStatus, deleteAppointment, setPayment, setPaymentMethod, undoPayment,
    printReceipt, editService, removeService, openEditAppointment, removeExpense
  };

  // ---------- DESPESAS ----------
  const overlayExpense = document.getElementById('overlay-expense');
  document.getElementById('btn-new-expense').addEventListener('click', ()=>{
    document.getElementById('ex-desc').value = '';
    document.getElementById('ex-category').value = 'Produtos de limpeza';
    document.getElementById('ex-date').value = todayISO();
    document.getElementById('ex-value').value = '';
    overlayExpense.classList.add('active');
    document.getElementById('ex-desc').focus();
  });
  document.getElementById('btn-cancel-expense').addEventListener('click', ()=> overlayExpense.classList.remove('active'));
  overlayExpense.addEventListener('click', (e)=>{ if(e.target===overlayExpense) overlayExpense.classList.remove('active'); });

  document.getElementById('form-expense').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const payload = {
      descricao: document.getElementById('ex-desc').value.trim(),
      categoria: document.getElementById('ex-category').value,
      data: document.getElementById('ex-date').value,
      valor: parseFloat(document.getElementById('ex-value').value) || 0
    };
    try{
      await api('/despesas', {method:'POST', body: JSON.stringify(payload)});
      overlayExpense.classList.remove('active');
      await refreshDespesas();
    }catch(err){
      alert('Não foi possível salvar a despesa: ' + err.message);
    }
  });

  async function removeExpense(id){
    if(!confirm('Remover esta despesa?')) return;
    try{
      await api('/despesas/'+id, {method:'DELETE'});
      await refreshDespesas();
    }catch(e){ alert('Erro ao remover: '+e.message); }
  }

  async function refreshDespesas(){
    const listEl = document.getElementById('desp-list');
    listEl.innerHTML = '<div class="empty">Carregando…</div>';
    let items;
    try{
      items = await fetchWideRangeExpenses();
    }catch(e){
      listEl.innerHTML = '<div class="empty"><strong>Não foi possível carregar as despesas</strong>Verifique a conexão com o banco de dados.</div>';
      return;
    }
    allExpensesCache = items;
    const total = items.reduce((s,d)=>s+Number(d.valor),0);
    document.getElementById('desp-total').textContent = money(total);
    document.getElementById('desp-count').textContent = items.length;

    if(items.length===0){
      listEl.innerHTML = '<div class="empty"><strong>Nenhuma despesa nos últimos 90 dias</strong>Toque em "Nova despesa" para lançar produtos, água, luz, manutenção etc.</div>';
      return;
    }
    listEl.innerHTML = items.map(d=>`
      <div class="invoice-row" style="grid-template-columns:1fr auto auto;">
        <div>
          <div class="client">${escapeHtml(d.descricao)}</div>
          <div class="meta">${new Date(d.data+'T00:00:00').toLocaleDateString('pt-BR')} · ${escapeHtml(d.categoria)}</div>
        </div>
        <span class="price-tag" style="color:var(--warn);">${money(d.valor)}</span>
        <div class="ticket-actions">
          <button class="btn btn-small btn-ghost" onclick="App.removeExpense('${d.id}')">Remover</button>
        </div>
      </div>
    `).join('');
  }

  (async function init(){
    checkConnection();
    setInterval(checkConnection, 30000);
    await loadServices();
    await refreshAgenda();
    await refreshSideStats();
  })();

})();
