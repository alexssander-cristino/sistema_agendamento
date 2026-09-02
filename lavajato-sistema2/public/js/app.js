(function(){
  "use strict";

  const API = '/api';

  let state = {
    services: [],
    appointments: []   // appointments for the currently selected date (agenda)
  };
  let allDoneCache = []; // completed appointments across a wide range, for faturamento/financeiro
  let activeTab = 'agenda';
  let selectedDate = todayISO();
  let editingServiceId = null;

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
        let actions = '';
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

  // ---------- NOVO AGENDAMENTO ----------
  const overlayAppointment = document.getElementById('overlay-appointment');
  document.getElementById('btn-new-appointment').addEventListener('click', async ()=>{
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
    try{
      await api('/agendamentos', {method:'POST', body: JSON.stringify(payload)});
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
    document.getElementById('recibo-date').textContent = new Date(ap.data+'T00:00:00').toLocaleDateString('pt-BR') + ' às ' + ap.hora.slice(0,5);
    document.getElementById('recibo-body').innerHTML = `
      <div class="recibo-row"><span>Cliente</span><span>${escapeHtml(ap.cliente)}</span></div>
      ${ap.veiculo?`<div class="recibo-row"><span>Veículo</span><span>${escapeHtml(ap.veiculo)}</span></div>`:''}
      ${ap.placa?`<div class="recibo-row"><span>Placa</span><span>${escapeHtml(ap.placa.toUpperCase())}</span></div>`:''}
      <div class="recibo-row"><span>Serviço</span><span>${escapeHtml(ap.servico_nome || serviceName(ap.servico_id))}</span></div>
      <div class="recibo-row"><span>Forma de pagamento</span><span>${ap.forma_pagamento||'—'}</span></div>
      <div class="recibo-total"><span>Total</span><span>${money(ap.valor)}</span></div>
    `;
    window.print();
  }

  // ---------- FINANCEIRO ----------
  async function refreshFinanceiro(){
    try{
      const range = await fetchWideRange();
      allDoneCache = range.filter(a=>a.status==='concluido');
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
    if(!confirm('Remover este serviço da tabela de preços?')) return;
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

  window.App = {
    setStatus, deleteAppointment, setPayment, setPaymentMethod, undoPayment,
    printReceipt, editService, removeService
  };

  (async function init(){
    checkConnection();
    setInterval(checkConnection, 30000);
    await loadServices();
    await refreshAgenda();
    await refreshSideStats();
  })();

})();
