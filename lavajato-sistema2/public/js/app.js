// ============================================================
// REDIRECIONA PARA /429.html EM QUALQUER LIMITE DE REQUISIÇÕES
// ============================================================

(function(){

  const fetchOriginal = window.fetch;

  window.fetch = async function(...args){

    const resposta = await fetchOriginal.apply(this, args);

    if(resposta.status === 429){

      const url = String(
        typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || ''
      );

      const jaEstaNaPagina = window.location.pathname.endsWith('/429.html');

      if(url.includes('/api/') && !jaEstaNaPagina){

        let destino = '/429.html';

        try{
          const dados = await resposta.clone().json();
          if(dados && dados.redirecionar){ destino = dados.redirecionar; }
        }catch(e){}

        // Só aceita caminhos do próprio site (evita redirecionamento externo)
        if(!destino.startsWith('/') || destino.startsWith('//')){
          destino = '/429.html';
        }

        window.location.replace(destino);
      }
    }

    return resposta;
  };

})();

(function(){
  "use strict";

  const API = '/api';
  const AUTH_TOKEN_KEY = 'lavajato_auth_token';

  let state = { services: [], appointments: [] };

  let usuarioLogado = null;
  let empresaLogada = null;

  let allDoneCache = [];
  let allExpensesCache = [];
  let currentAgendaItems = [];
  let activeTab = 'agenda';
  let selectedDate = todayISO();
  let editingServiceId = null;
  let editingAppointmentId = null;
  let editingUserId = null;

  let connectionInterval = null;
  let assinaturaVerificada = false;


  // ============================================================
  // NICHOS DE EMPRESA
  // ------------------------------------------------------------
  // Os campos extras reaproveitam as colunas já existentes:
  //   extra1 -> "placa"   (campo ap-plate)
  //   extra2 -> "veiculo" (campo ap-vehicle)
  // Assim o backend continua funcionando sem mudanças.
  // Use extra = null para esconder o campo naquele nicho.
  // ============================================================

  const NICHO_PADRAO = 'lavajato';

  const NICHOS = {
    lavajato: {
      nome: 'Lava-jato / Estética automotiva',
      cliente: 'Cliente',
      servico: 'Serviço',
      servicos: 'Serviços',
      novoServico: 'Novo serviço',
      extra1: { label: 'Placa', placeholder: 'ABC1D23', upper: true },
      extra2: { label: 'Veículo', placeholder: 'Modelo / cor' }
    },
    barbearia: {
      nome: 'Barbearia / Salão de beleza',
      cliente: 'Cliente',
      servico: 'Serviço',
      servicos: 'Serviços',
      novoServico: 'Novo serviço',
      extra1: { label: 'Profissional', placeholder: 'Quem vai atender' },
      extra2: null
    },
    clinica: {
      nome: 'Clínica / Consultório',
      cliente: 'Paciente',
      servico: 'Procedimento',
      servicos: 'Procedimentos',
      novoServico: 'Novo procedimento',
      extra1: { label: 'Convênio', placeholder: 'Particular, Unimed...' },
      extra2: { label: 'Profissional', placeholder: 'Médico / dentista' }
    },
    pet: {
      nome: 'Pet shop / Veterinária',
      cliente: 'Tutor',
      servico: 'Serviço',
      servicos: 'Serviços',
      novoServico: 'Novo serviço',
      extra1: { label: 'Nome do pet', placeholder: 'Ex: Thor' },
      extra2: { label: 'Raça / porte', placeholder: 'Ex: Golden, grande' }
    },
    oficina: {
      nome: 'Oficina mecânica',
      cliente: 'Cliente',
      servico: 'Serviço',
      servicos: 'Serviços',
      novoServico: 'Novo serviço',
      extra1: { label: 'Placa', placeholder: 'ABC1D23', upper: true },
      extra2: { label: 'Veículo', placeholder: 'Modelo / ano' }
    },
    personal: {
      nome: 'Personal / Aulas / Consultoria',
      cliente: 'Aluno / Cliente',
      servico: 'Aula / Sessão',
      servicos: 'Aulas e sessões',
      novoServico: 'Nova aula / sessão',
      extra1: null,
      extra2: null
    },
    generico: {
      nome: 'Outro',
      cliente: 'Cliente',
      servico: 'Serviço',
      servicos: 'Serviços',
      novoServico: 'Novo serviço',
      extra1: null,
      extra2: null
    }
  };


  function getNicho(){
    const chave = empresaLogada && empresaLogada.nicho;
    return NICHOS[chave] || NICHOS[NICHO_PADRAO];
  }


  function aplicarNicho(chave){

    // Sem nicho informado (ex.: resposta que ainda não traz o campo),
    // mantém o último nicho aplicado em vez de voltar para o padrão.
    if(!chave){
      chave =
        window.nichoAtual ||
        (empresaLogada && empresaLogada.nicho) ||
        NICHO_PADRAO;
    }

    const chaveValida = NICHOS[chave] ? chave : NICHO_PADRAO;
    const n = NICHOS[chaveValida];

    window.nichoAtual = chaveValida;

    // Garante que getNicho() reflita a escolha mesmo antes do /auth/me
    if(empresaLogada){
      empresaLogada.nicho = chaveValida;
    }

    // Modal de agendamento
    const lblServico = document.getElementById('ap-service-label');
    if(lblServico){ lblServico.textContent = n.servico; }

    const lblCliente = document.getElementById('ap-client-label');
    if(lblCliente){ lblCliente.textContent = n.cliente; }

    [
      ['extra1', 'ap-plate'],
      ['extra2', 'ap-vehicle']
    ].forEach(([chaveExtra, inputId]) => {

      const cfg = n[chaveExtra];
      const campo = document.getElementById('ap-' + chaveExtra + '-field');
      const input = document.getElementById(inputId);
      const label = document.getElementById('ap-' + chaveExtra + '-label');

      if(!campo || !input){ return; }

      if(cfg){
        campo.style.display = '';
        if(label){ label.textContent = cfg.label; }
        input.placeholder = cfg.placeholder;
      }else{
        campo.style.display = 'none';
        input.value = '';
      }
    });

    // Menu e títulos de Serviços
    const navServicos = document.querySelector('[data-tab="servicos"] .nav-text');
    if(navServicos){ navServicos.textContent = n.servicos; }

    const h1Servicos = document.querySelector('#panel-servicos h1');
    if(h1Servicos){ h1Servicos.textContent = n.servicos; }

    const btnNovoServico = document.getElementById('btn-new-service');
    if(btnNovoServico){ btnNovoServico.textContent = n.novoServico; }

    // Busca de clientes
    const buscaCli = document.getElementById('cli-search-input');
    if(buscaCli){
      buscaCli.placeholder =
        n.extra1
          ? 'Nome, telefone ou ' + n.extra1.label.toLowerCase() + '...'
          : 'Nome ou telefone...';
    }

    // Seletor de nicho nas configurações
    const selConfig = document.getElementById('config-empresa-nicho');
    if(selConfig){ selConfig.value = chaveValida; }
  }


  // Valor do campo extra (respeita maiúsculas quando necessário)
  function formatExtra(valor, cfg){
    const v = String(valor || '');
    return cfg && cfg.upper ? v.toUpperCase() : v;
  }


  // Spans de detalhes (extra2, extra1 e observações) para listagens
  function detalhesHtml(ap){

    const n = getNicho();
    let html = '';

    if(ap.veiculo){
      html += '<span title="' + escapeHtml(n.extra2 ? n.extra2.label : 'Detalhe') + '">' +
        escapeHtml(ap.veiculo) + '</span>';
    }

    if(ap.placa){
      html += '<span title="' + escapeHtml(n.extra1 ? n.extra1.label : 'Detalhe') + '">' +
        escapeHtml(formatExtra(ap.placa, n.extra1)) + '</span>';
    }

    if(ap.observacoes){
      html += '<span title="Observações">' + escapeHtml(ap.observacoes) + '</span>';
    }

    return html;
  }


  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  function todayISO(){
    const d = new Date();
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);

    return local.toISOString().slice(0,10);
  }


  function uid(){
    return 'tmp-' +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2,6);
  }


  function money(n){
    return 'R$ ' +
      (Number(n) || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
  }


  function fmtDatePretty(iso){
    const [y,m,d] = iso.split('-');
    const date = new Date(Number(y), Number(m) - 1, Number(d));

    return date.toLocaleDateString('pt-BR', {
      weekday:'long',
      day:'numeric',
      month:'long'
    });
  }


  function capitalize(s){
    return s.charAt(0).toUpperCase() + s.slice(1);
  }


  function escapeHtml(s){
    return String(s || '').replace(
      /[&<>"']/g,
      c => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
      }[c])
    );
  }


  function isAdministrador(){
    return (usuarioLogado && usuarioLogado.perfil === 'administrador');
  }


  // ============================================================
  // PRIVACIDADE
  // ============================================================

  function abrirPrivacidade(){

    if(usuarioLogado && usuarioLogado.perfil === 'administrador'){
      window.location.href = '/empresa/privacidade.html';
      return;
    }

    window.location.href = '/privacidade.html';
  }

  window.abrirPrivacidade = abrirPrivacidade;


  const btnPrivacidade = document.getElementById('btn-privacidade');

  if(btnPrivacidade){
    btnPrivacidade.addEventListener('click', function(event){
      event.preventDefault();
      event.stopPropagation();
      abrirPrivacidade();
    });
  }


  // ============================================================
  // PERMISSÕES POR FUNCIONÁRIO
  // ============================================================

  const PERMISSOES_DISPONIVEIS = [
    { chave:'agenda',      label:'Agenda' },
    { chave:'faturamento', label:'Faturamento' },
    { chave:'financeiro',  label:'Financeiro' },
    { chave:'servicos',    label:'Serviços' },
    { chave:'clientes',    label:'Clientes' },
    { chave:'despesas',    label:'Despesas' }
  ];


  function temPermissao(chave){

    if(!usuarioLogado){ return false; }

    if(usuarioLogado.perfil === 'administrador'){ return true; }

    const permissoes =
      Array.isArray(usuarioLogado.permissoes)
        ? usuarioLogado.permissoes
        : [];

    return permissoes.includes(chave);
  }


  // ============================================================
  // API
  // ============================================================

  async function api(path, options = {}){

    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    const headers = Object.assign(
      { 'Content-Type':'application/json' },
      options.headers || {}
    );

    if(token){
      headers.Authorization = `Bearer ${token}`;
    }

    const requestOptions = Object.assign({}, options, { headers });

    const res = await fetch(API + path, requestOptions);


    if(res.status === 401){

      if(path !== '/auth/login' && path !== '/auth/cadastro'){

        localStorage.removeItem(AUTH_TOKEN_KEY);

        usuarioLogado = null;
        empresaLogada = null;

        showAuthScreen();

        throw new Error('Sessão expirada. Faça login novamente.');
      }
    }


    if(!res.ok){

      let msg = 'Erro na requisição';
      let codigo = null;

      try{
        const j = await res.json();
        msg = j.erro || msg;
        codigo = j.codigo || null;
      }catch(e){}

      const erro = new Error(msg);

      erro.status = res.status;
      erro.codigo = codigo;

      throw erro;
    }


    if(res.status === 204){ return null; }

    return res.json();
  }


  // ============================================================
  // AUTENTICAÇÃO
  // ============================================================

  const authScreen = document.getElementById('auth-screen');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');
  const loginSubmit = document.getElementById('login-submit');
  const registerSubmit = document.getElementById('register-submit');
  const showRegisterBtn = document.getElementById('show-register');
  const showLoginBtn = document.getElementById('show-login');


  function showAuthScreen(){
    if(!authScreen){ return; }
    authScreen.style.display = 'flex';
  }


  function hideAuthScreen(){
    if(!authScreen){ return; }
    authScreen.style.display = 'none';
  }


  function showAuthError(element, message){
    if(!element){ return; }
    element.textContent = message;
    element.style.display = 'block';
  }


  function clearAuthError(element){
    if(!element){ return; }
    element.textContent = '';
    element.style.display = 'none';
  }


  // ============================================================
  // SIDEBAR - USUÁRIO E EMPRESA
  // ============================================================

  function atualizarSidebarUsuario(){

    const empresaElement = document.getElementById('sidebar-company');
    const nomeElement = document.getElementById('sidebar-user-name');
    const perfilElement = document.getElementById('sidebar-user-profile');
    const avatarElement = document.getElementById('sidebar-user-avatar');

    if(empresaElement && empresaLogada){
      empresaElement.textContent = empresaLogada.nome || 'Minha empresa';
    }

    if(nomeElement && usuarioLogado){
      nomeElement.textContent = usuarioLogado.nome || 'Usuário';
    }

    if(perfilElement && usuarioLogado){
      perfilElement.textContent =
        usuarioLogado.perfil === 'administrador'
          ? 'Administrador'
          : 'Funcionário';
    }

    if(avatarElement && usuarioLogado){
      const nome = usuarioLogado.nome || 'U';
      avatarElement.textContent = nome.charAt(0).toUpperCase();
    }

    // Aplica rótulos e campos do nicho da empresa
    aplicarNicho(empresaLogada && empresaLogada.nicho);

    atualizarAcessoUsuarios();
  }


  // ============================================================
  // ACESSO À ÁREA DE USUÁRIOS
  // ============================================================

  function atualizarAcessoUsuarios(){

    const btn = document.getElementById('nav-usuarios');

    if(btn){

      if(isAdministrador()){

        btn.style.display = '';

      }else{

        btn.style.display = 'none';

        if(activeTab === 'usuarios'){
          goToTab('agenda');
        }
      }
    }


    document
      .querySelectorAll('.nav-btn, .bn-btn')
      .forEach(navBtn => {

        const tab = navBtn.dataset.tab;

        if(!tab || tab === 'usuarios'){ return; }

        navBtn.style.display = temPermissao(tab) ? '' : 'none';
      });


    if(activeTab !== 'usuarios' && !temPermissao(activeTab)){

      const proxima =
        PERMISSOES_DISPONIVEIS.find(p => temPermissao(p.chave));

      goToTab(proxima ? proxima.chave : 'agenda');
    }
  }


  // ============================================================
  // MOSTRAR CADASTRO / LOGIN
  // ============================================================

  showRegisterBtn?.addEventListener('click', () => {

    if(loginForm){ loginForm.style.display = 'none'; }
    if(registerForm){ registerForm.style.display = 'flex'; }

    clearAuthError(loginError);
    clearAuthError(registerError);

    const subtitle = document.getElementById('auth-subtitle');

    if(subtitle){
      subtitle.textContent =
        'Crie sua conta e sua empresa para começar a usar o sistema';
    }
  });


  showLoginBtn?.addEventListener('click', () => {

    if(registerForm){ registerForm.style.display = 'none'; }
    if(loginForm){ loginForm.style.display = 'flex'; }

    clearAuthError(loginError);
    clearAuthError(registerError);

    const subtitle = document.getElementById('auth-subtitle');

    if(subtitle){
      subtitle.textContent = 'Entre na sua conta para continuar';
    }
  });


  // ============================================================
  // LOGIN
  // ============================================================

  loginForm?.addEventListener('submit', async event => {

    event.preventDefault();

    clearAuthError(loginError);

    if(loginSubmit){
      loginSubmit.disabled = true;
      loginSubmit.textContent = 'Entrando...';
    }

    const email = document.getElementById('login-email')?.value.trim();
    const senha = document.getElementById('login-password')?.value;

    try{

      const resposta = await api('/auth/login', {
        method:'POST',
        body:JSON.stringify({ email, senha })
      });

      localStorage.setItem(AUTH_TOKEN_KEY, resposta.token);

      usuarioLogado = resposta.usuario || null;
      empresaLogada = resposta.empresa || null;

      if(usuarioLogado?.perfil === 'dev'){
        window.location.href = '/admin/dashboard.html';
        return;
      }

      atualizarSidebarUsuario();
      hideAuthScreen();

      await iniciarSistema();

    }catch(error){

      // HTTP 429 - limite de tentativas
      if(
        error?.status === 429 ||
        error?.statusCode === 429 ||
        error?.response?.status === 429 ||
        error?.codigo === 'RATE_LIMIT_AUTENTICACAO'
      ){

        window.location.replace('/429.html');

        return;
      }

      showAuthError(
        loginError,
        error.message || 'Não foi possível realizar o login.'
      );

    }finally{

      if(loginSubmit){
        loginSubmit.disabled = false;
        loginSubmit.textContent = 'Entrar';
      }
    }
  });


  // ============================================================
  // CADASTRO
  // ============================================================

  registerForm?.addEventListener('submit', async event => {

    event.preventDefault();

    clearAuthError(registerError);

    if(registerSubmit){
      registerSubmit.disabled = true;
      registerSubmit.textContent = 'Criando conta...';
    }

    const empresa = document.getElementById('register-company')?.value.trim();
    const email_empresa = document.getElementById('register-company-email')?.value.trim();
    const telefone = document.getElementById('register-phone')?.value.trim();
    const nicho = document.getElementById('register-nicho')?.value || NICHO_PADRAO;
    const nome = document.getElementById('register-name')?.value.trim();
    const email = document.getElementById('register-email')?.value.trim();
    const senha = document.getElementById('register-password')?.value;

    try{

      const resposta = await api('/auth/cadastro', {
        method:'POST',
        body:JSON.stringify({
          empresa,
          email_empresa,
          telefone,
          nicho,
          nome,
          email,
          senha
        })
      });

      localStorage.setItem(AUTH_TOKEN_KEY, resposta.token);

      usuarioLogado = resposta.usuario || null;
      empresaLogada = resposta.empresa || null;

      atualizarSidebarUsuario();
      hideAuthScreen();

      await iniciarSistema();

    }catch(error){

      // HTTP 429 - limite de cadastro
      if(
        error?.status === 429 ||
        error?.statusCode === 429 ||
        error?.response?.status === 429 ||
        error?.codigo === 'RATE_LIMIT_AUTENTICACAO'
      ){

        window.location.replace('/429.html');

        return;
      }

      showAuthError(
        registerError,
        error.message || 'Não foi possível criar a conta.'
      );

    }finally{

      if(registerSubmit){
        registerSubmit.disabled = false;
        registerSubmit.textContent = 'Criar conta';
      }
    }
  });


  // ============================================================
  // VERIFICAR SESSÃO
  // ============================================================

  async function verificarSessao(){

    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    if(!token){

      usuarioLogado = null;
      empresaLogada = null;

      atualizarAcessoUsuarios();
      showAuthScreen();

      return false;
    }

    try{

      const resposta = await api('/auth/me');

      usuarioLogado = resposta.usuario || null;
      empresaLogada = resposta.empresa || null;

      if(usuarioLogado?.perfil === 'dev'){
        window.location.href = '/admin/dashboard.html';
        return false;
      }

      atualizarSidebarUsuario();
      hideAuthScreen();

      return true;

    }catch(error){

      localStorage.removeItem(AUTH_TOKEN_KEY);

      usuarioLogado = null;
      empresaLogada = null;

      atualizarAcessoUsuarios();
      showAuthScreen();

      return false;
    }
  }


  // ============================================================
  // CONEXÃO
  // ============================================================

  async function checkConnection(){

    const badge = document.getElementById('conn-badge');

    if(!badge){ return; }

    try{

      await api('/status');

      badge.textContent = 'conectado';
      badge.className = 'ok';

    }catch(e){

      badge.textContent = 'sem conexão';
      badge.className = 'fail';
    }
  }


  // ============================================================
  // TAB SWITCHING
  // ============================================================

  function goToTab(tab){

    if(tab === 'usuarios' && !isAdministrador()){ return; }

    if(tab !== 'usuarios' && !temPermissao(tab)){ return; }

    activeTab = tab;

    document
      .querySelectorAll('.nav-btn')
      .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

    document
      .querySelectorAll('.bn-btn')
      .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

    document
      .querySelectorAll('.panel')
      .forEach(p => p.classList.remove('active'));

    const panel = document.getElementById('panel-' + tab);

    if(panel){ panel.classList.add('active'); }

    loadTabData(tab);
  }


  document
    .querySelectorAll('.nav-btn, .bn-btn')
    .forEach(btn => {

      btn.addEventListener('click', () => {

        if(btn.dataset.tab){
          goToTab(btn.dataset.tab);
        }
      });
    });


  async function loadTabData(tab){

    if(tab === 'agenda'){ await refreshAgenda(); }

    if(tab === 'faturamento'){ await refreshFaturamento(); }

    if(tab === 'financeiro'){ await refreshFinanceiro(); }

    if(tab === 'servicos'){ await refreshServicos(); }

    if(tab === 'clientes'){
      document.getElementById('cli-search-input')?.focus();
    }

    if(tab === 'despesas'){ await refreshDespesas(); }

    if(tab === 'usuarios'){
      if(isAdministrador()){ await refreshUsuarios(); }
    }
  }


  // ============================================================
  // SERVIÇOS (CARGA)
  // ============================================================

  async function loadServices(){
    state.services = await api('/servicos');
  }


  function serviceName(id){

    const s = state.services.find(x => String(x.id) === String(id));

    return s ? s.nome : getNicho().servico + ' removido';
  }


  // ============================================================
  // AGENDA
  // ============================================================

  const dateInput = document.getElementById('agenda-date-input');

  if(dateInput){

    dateInput.value = selectedDate;

    dateInput.addEventListener('change', () => {
      selectedDate = dateInput.value || todayISO();
      refreshAgenda();
    });
  }


  document.getElementById('btn-today')?.addEventListener('click', () => {

    selectedDate = todayISO();

    if(dateInput){ dateInput.value = selectedDate; }

    refreshAgenda();
  });


  async function refreshAgenda(){

    const label = document.getElementById('agenda-date-label');

    if(label){
      label.textContent = capitalize(fmtDatePretty(selectedDate));
    }

    const list = document.getElementById('agenda-list');

    if(!list){ return; }

    list.innerHTML = '<div class="empty">Carregando…</div>';

    try{

      const items = await api('/agendamentos?data=' + selectedDate);

      currentAgendaItems = items;

      renderAgendaList(items);

      updateSideStats();

    }catch(e){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Não foi possível carregar a agenda</strong>' +
          'Verifique a conexão com o banco de dados.' +
        '</div>';
    }
  }


  function renderAgendaList(items){

    const list = document.getElementById('agenda-list');

    if(!list){ return; }

    items = items.slice().sort((a,b) => a.hora.localeCompare(b.hora));

    if(items.length === 0){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Nenhum agendamento nesta data</strong>' +
          'Toque em "Novo agendamento" para adicionar o primeiro item do dia.' +
        '</div>';

    }else{

      list.innerHTML = items.map(ap => {

        const [h,m] = ap.hora.slice(0,5).split(':');

        let actions =
          `<button class="btn btn-small btn-ghost" onclick="App.openEditAppointment('${ap.id}')">Editar</button>`;

        if(ap.status === 'agendado'){

          actions +=
            `<button class="btn btn-small btn-accent" onclick="App.setStatus('${ap.id}','em_andamento')">Iniciar</button>`;

          actions +=
            `<button class="btn btn-small btn-ghost" onclick="App.setStatus('${ap.id}','cancelado')">Cancelar</button>`;

        }else if(ap.status === 'em_andamento'){

          actions +=
            `<button class="btn btn-small btn-primary" onclick="App.setStatus('${ap.id}','concluido')">Concluir</button>`;

          actions +=
            `<button class="btn btn-small btn-ghost" onclick="App.setStatus('${ap.id}','cancelado')">Cancelar</button>`;

        }else if(ap.status === 'cancelado'){

          actions +=
            `<button class="btn btn-small btn-ghost" onclick="App.deleteAppointment('${ap.id}')">Remover</button>`;

        }else if(ap.status === 'concluido'){

          actions +=
            `<span class="badge badge-${ap.status_pagamento}">` +
            `${ap.status_pagamento === 'pago' ? 'Pago' : 'A receber'}` +
            `</span>`;
        }

        const statusLabel = {
          agendado:'agendado',
          em_andamento:'em andamento',
          concluido:'concluído',
          cancelado:'cancelado'
        }[ap.status];

        return `
          <div class="ticket status-${ap.status}">

            <div class="ticket-time">
              ${h}:${m}
              <small>${statusLabel}</small>
            </div>

            <div class="ticket-body">

              <div class="client">${escapeHtml(ap.cliente)}</div>

              <div class="meta">
                <span>${escapeHtml(ap.servico_nome || serviceName(ap.servico_id))}</span>
                ${detalhesHtml(ap)}
              </div>

            </div>

            <div class="ticket-actions">
              <span class="price-tag">${money(ap.valor)}</span>
              ${actions}
            </div>

          </div>
        `;

      }).join('');
    }

    const navCount = document.getElementById('nav-count-agenda');

    if(navCount){
      navCount.textContent =
        items.filter(a => a.status !== 'cancelado').length || '';
    }
  }


  // ============================================================
  // NOVO AGENDAMENTO
  // ============================================================

  const overlayAppointment = document.getElementById('overlay-appointment');


  document
    .getElementById('btn-new-appointment')
    ?.addEventListener('click', async () => {

      editingAppointmentId = null;

      document.getElementById('appointment-modal-title').textContent =
        'Novo agendamento';

      document.getElementById('appointment-submit-btn').textContent =
        'Agendar';

      document.getElementById('ap-date').value = selectedDate;
      document.getElementById('ap-time').value = '';
      document.getElementById('ap-client').value = '';
      document.getElementById('ap-phone').value = '';
      document.getElementById('ap-plate').value = '';
      document.getElementById('ap-vehicle').value = '';

      const notes = document.getElementById('ap-notes');
      if(notes){ notes.value = ''; }

      if(state.services.length === 0){ await loadServices(); }

      fillServiceSelect();
      updatePriceFromService();

      overlayAppointment?.classList.add('active');

      document.getElementById('ap-client')?.focus();
    });


  document
    .getElementById('btn-cancel-appointment')
    ?.addEventListener('click', () => {
      overlayAppointment?.classList.remove('active');
    });


  overlayAppointment?.addEventListener('click', e => {

    if(e.target === overlayAppointment){
      overlayAppointment.classList.remove('active');
    }
  });


  async function openEditAppointment(id){

    const ap = currentAgendaItems.find(a => String(a.id) === String(id));

    if(!ap){ return; }

    editingAppointmentId = id;

    document.getElementById('appointment-modal-title').textContent =
      'Editar agendamento';

    document.getElementById('appointment-submit-btn').textContent =
      'Salvar alterações';

    if(state.services.length === 0){ await loadServices(); }

    fillServiceSelect();

    document.getElementById('ap-date').value = ap.data;
    document.getElementById('ap-time').value = ap.hora.slice(0,5);
    document.getElementById('ap-client').value = ap.cliente;
    document.getElementById('ap-phone').value = ap.telefone || '';
    document.getElementById('ap-plate').value = ap.placa || '';
    document.getElementById('ap-vehicle').value = ap.veiculo || '';
    document.getElementById('ap-service').value = ap.servico_id;
    document.getElementById('ap-price').value = ap.valor;

    const notes = document.getElementById('ap-notes');
    if(notes){ notes.value = ap.observacoes || ''; }

    overlayAppointment?.classList.add('active');
  }


  function fillServiceSelect(){

    const sel = document.getElementById('ap-service');

    if(!sel){ return; }

    sel.innerHTML =
      state.services
        .map(s =>
          `<option value="${s.id}">` +
          `${escapeHtml(s.nome)} — ${money(s.preco)}` +
          `</option>`
        )
        .join('');
  }


  document
    .getElementById('ap-service')
    ?.addEventListener('change', updatePriceFromService);


  function updatePriceFromService(){

    const sel = document.getElementById('ap-service');

    if(!sel){ return; }

    const s = state.services.find(x => String(x.id) === String(sel.value));

    if(s){
      const price = document.getElementById('ap-price');
      if(price){ price.value = s.preco; }
    }
  }


  // ============================================================
  // ESTATÍSTICAS
  // ============================================================

  async function refreshSideStats(){

    try{

      const range = await fetchWideRange();

      allDoneCache = range.filter(a => a.status === 'concluido');

      updateSideStats();

    }catch(e){}
  }


  // ============================================================
  // CONFLITO DE HORÁRIO
  // ============================================================

  function timeToMinutes(t){
    const [h,m] = t.split(':').map(Number);
    return h * 60 + m;
  }


  function serviceDuration(servico_id){

    const s = state.services.find(x => String(x.id) === String(servico_id));

    return s ? Number(s.duracao_min) || 30 : 30;
  }


  async function findConflict(data, hora, servico_id, excludeId){

    let items;

    try{
      items = await api('/agendamentos?data=' + data);
    }catch(e){
      return null;
    }

    const novoInicio = timeToMinutes(hora);
    const novoFim = novoInicio + serviceDuration(servico_id);

    for(const ap of items){

      if(ap.status === 'cancelado'){ continue; }

      if(excludeId && String(ap.id) === String(excludeId)){ continue; }

      const inicio = timeToMinutes(ap.hora.slice(0,5));
      const fim = inicio + serviceDuration(ap.servico_id);

      if(novoInicio < fim && inicio < novoFim){
        return ap;
      }
    }

    return null;
  }


  // ============================================================
  // FORMULÁRIO AGENDAMENTO
  // ============================================================

  document
    .getElementById('form-appointment')
    ?.addEventListener('submit', async e => {

      e.preventDefault();

      const n = getNicho();

      const payload = {
        data: document.getElementById('ap-date').value,
        hora: document.getElementById('ap-time').value,
        cliente: document.getElementById('ap-client').value.trim(),
        telefone: document.getElementById('ap-phone').value.trim(),
        placa: n.extra1 ? document.getElementById('ap-plate').value.trim() : '',
        veiculo: n.extra2 ? document.getElementById('ap-vehicle').value.trim() : '',
        observacoes: (document.getElementById('ap-notes')?.value || '').trim(),
        servico_id: document.getElementById('ap-service').value,
        valor: parseFloat(document.getElementById('ap-price').value) || 0
      };

      const conflito = await findConflict(
        payload.data,
        payload.hora,
        payload.servico_id,
        editingAppointmentId
      );

      if(conflito){

        const nomeServico =
          conflito.servico_nome || serviceName(conflito.servico_id);

        const seguir = confirm(
          `Esse horário conflita com o agendamento de ${conflito.cliente} às ${conflito.hora.slice(0,5)} (${nomeServico}).\n\nAgendar mesmo assim?`
        );

        if(!seguir){ return; }
      }

      try{

        if(editingAppointmentId){

          await api('/agendamentos/' + editingAppointmentId, {
            method:'PATCH',
            body:JSON.stringify(payload)
          });

        }else{

          await api('/agendamentos', {
            method:'POST',
            body:JSON.stringify(payload)
          });
        }

        overlayAppointment?.classList.remove('active');

        selectedDate = payload.data;

        if(dateInput){ dateInput.value = selectedDate; }

        await refreshAgenda();
        await refreshSideStats();

      }catch(err){

        alert('Não foi possível salvar: ' + err.message);
      }
    });


  // ============================================================
  // STATUS / PAGAMENTO
  // ============================================================

  async function setStatus(id, status){

    try{

      await api('/agendamentos/' + id, {
        method:'PATCH',
        body:JSON.stringify({ status })
      });

      await refreshCurrentTab();

    }catch(e){

      alert('Erro ao atualizar status: ' + e.message);
    }
  }


  async function deleteAppointment(id){

    if(!confirm('Remover este agendamento definitivamente?')){ return; }

    try{

      await api('/agendamentos/' + id, { method:'DELETE' });

      await refreshCurrentTab();

    }catch(e){

      alert('Erro ao remover: ' + e.message);
    }
  }


  async function setPayment(id, status_pagamento){

    try{

      await api('/agendamentos/' + id, {
        method:'PATCH',
        body:JSON.stringify({ status_pagamento })
      });

      await refreshCurrentTab();

    }catch(e){

      alert('Erro ao atualizar pagamento: ' + e.message);
    }
  }


  async function setPaymentMethod(id, forma_pagamento){

    try{

      await api('/agendamentos/' + id, {
        method:'PATCH',
        body:JSON.stringify({ forma_pagamento })
      });

    }catch(e){

      console.error(e);
    }
  }


  async function undoPayment(id){

    if(!confirm(
      'Desfazer a confirmação de pagamento? Você poderá trocar a forma de pagamento novamente depois.'
    )){ return; }

    try{

      await api('/agendamentos/' + id, {
        method:'PATCH',
        body:JSON.stringify({ status_pagamento:'pendente' })
      });

      await refreshCurrentTab();

    }catch(e){

      alert('Erro ao desfazer: ' + e.message);
    }
  }


  async function refreshCurrentTab(){
    await loadTabData(activeTab);
    await refreshSideStats();
  }


  // ============================================================
  // FATURAMENTO
  // ============================================================

  async function refreshFaturamento(){

    const container = document.getElementById('fat-list');

    if(!container){ return; }

    container.innerHTML = '<div class="empty">Carregando…</div>';

    try{

      const range = await fetchWideRange();

      allDoneCache = range.filter(a => a.status === 'concluido');

      renderFaturamento();

    }catch(e){

      container.innerHTML =
        '<div class="empty">' +
          '<strong>Não foi possível carregar o faturamento</strong>' +
          'Verifique a conexão com o banco de dados.' +
        '</div>';
    }
  }


  function renderFaturamento(){

    const done = allDoneCache
      .slice()
      .sort((a,b) => (b.data + b.hora).localeCompare(a.data + a.hora));

    const total = done.reduce((s,a) => s + Number(a.valor), 0);

    const pago = done
      .filter(a => a.status_pagamento === 'pago')
      .reduce((s,a) => s + Number(a.valor), 0);

    const pendente = total - pago;

    document.getElementById('fat-total').textContent = money(total);
    document.getElementById('fat-pago').textContent = money(pago);
    document.getElementById('fat-pendente').textContent = money(pendente);

    const navCount = document.getElementById('nav-count-fat');

    if(navCount){
      navCount.textContent =
        done.filter(a => a.status_pagamento === 'pendente').length || '';
    }

    const list = document.getElementById('fat-list');

    if(!list){ return; }

    if(done.length === 0){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Nenhum atendimento concluído ainda</strong>' +
          'Conclua um agendamento na Agenda para ele aparecer aqui.' +
        '</div>';

      return;
    }

    const n = getNicho();

    list.innerHTML = done.map(ap => {

      const extras = [];

      if(ap.veiculo){ extras.push(escapeHtml(ap.veiculo)); }

      if(ap.placa){ extras.push(escapeHtml(formatExtra(ap.placa, n.extra1))); }

      return `

        <div class="invoice-row">

          <div>

            <div class="client">${escapeHtml(ap.cliente)}</div>

            <div class="meta">
              ${new Date(ap.data + 'T00:00:00').toLocaleDateString('pt-BR')}
              ·
              ${escapeHtml(ap.servico_nome || serviceName(ap.servico_id))}
              ${extras.length ? ' · ' + extras.join(' · ') : ''}
            </div>

          </div>

          <span class="price-tag">${money(ap.valor)}</span>

          ${
            ap.status_pagamento === 'pago'

              ? `<div class="pay-method-locked">
                  ${ap.forma_pagamento ? escapeHtml(ap.forma_pagamento) : 'Forma não informada'}
                </div>`

              : `<select
                  class="pay-method"
                  onchange="App.setPaymentMethod('${ap.id}', this.value)"
                >
                  <option value="" ${!ap.forma_pagamento ? 'selected' : ''}>Forma de pagamento</option>
                  <option value="Dinheiro" ${ap.forma_pagamento === 'Dinheiro' ? 'selected' : ''}>Dinheiro</option>
                  <option value="Pix" ${ap.forma_pagamento === 'Pix' ? 'selected' : ''}>Pix</option>
                  <option value="Cartão de débito" ${ap.forma_pagamento === 'Cartão de débito' ? 'selected' : ''}>Cartão de débito</option>
                  <option value="Cartão de crédito" ${ap.forma_pagamento === 'Cartão de crédito' ? 'selected' : ''}>Cartão de crédito</option>
                </select>`
          }

          <div class="ticket-actions">

            ${
              ap.status_pagamento === 'pago'

                ? `<span
                    class="badge badge-pago"
                    title="Toque para desfazer o pagamento"
                    onclick="App.undoPayment('${ap.id}')"
                  >Pago</span>`

                : `<button
                    class="btn btn-small btn-primary"
                    onclick="App.setPayment('${ap.id}','pago')"
                  >Marcar pago</button>`
            }

            <button
              class="btn btn-small btn-ghost"
              onclick="App.printReceipt('${ap.id}')"
            >Recibo</button>

          </div>

        </div>

      `;

    }).join('');
  }


  function printReceipt(id){

    const ap = allDoneCache.find(a => String(a.id) === String(id));

    if(!ap){ return; }

    const n = getNicho();

    const dataHora =
      new Date(ap.data + 'T00:00:00').toLocaleDateString('pt-BR') +
      ' às ' +
      ap.hora.slice(0,5);

    const linhaExtra = (rotulo, valor) =>
      valor
        ? `<div class="recibo-row">
            <span>${escapeHtml(rotulo)}</span>
            <span>${escapeHtml(valor)}</span>
          </div>`
        : '';

    document.getElementById('print-area').innerHTML = `

      <div class="recibo-header">
        <h2>${escapeHtml((empresaLogada && empresaLogada.nome) || 'Orvix')} — Recibo</h2>
        <div>${dataHora}</div>
      </div>

      <div class="recibo-row">
        <span>${escapeHtml(n.cliente)}</span>
        <span>${escapeHtml(ap.cliente)}</span>
      </div>

      ${linhaExtra(n.extra2 ? n.extra2.label : 'Detalhe', ap.veiculo)}

      ${linhaExtra(
        n.extra1 ? n.extra1.label : 'Detalhe',
        ap.placa ? formatExtra(ap.placa, n.extra1) : ''
      )}

      <div class="recibo-row">
        <span>${escapeHtml(n.servico)}</span>
        <span>${escapeHtml(ap.servico_nome || serviceName(ap.servico_id))}</span>
      </div>

      <div class="recibo-row">
        <span>Forma de pagamento</span>
        <span>${escapeHtml(ap.forma_pagamento || '—')}</span>
      </div>

      <div class="recibo-total">
        <span>Total</span>
        <span>${money(ap.valor)}</span>
      </div>

    `;

    window.print();
  }


  // ============================================================
  // FECHAMENTO DO DIA
  // ============================================================

  document.getElementById('btn-closing')?.addEventListener('click', printClosing);


  async function printClosing(){

    let items;

    try{

      items = await api('/agendamentos?data=' + selectedDate);

    }catch(e){

      alert('Não foi possível carregar os dados do fechamento.');

      return;
    }

    const done = items
      .filter(a => a.status === 'concluido')
      .sort((a,b) => a.hora.localeCompare(b.hora));

    const total = done.reduce((s,a) => s + Number(a.valor), 0);

    const pago = done
      .filter(a => a.status_pagamento === 'pago')
      .reduce((s,a) => s + Number(a.valor), 0);

    const pendente = total - pago;

    const porForma = {};

    done
      .filter(a => a.status_pagamento === 'pago')
      .forEach(a => {

        const f = a.forma_pagamento || 'Não informado';

        porForma[f] = (porForma[f] || 0) + Number(a.valor);
      });

    const formaLinhas =
      Object.entries(porForma)
        .map(([f,v]) =>
          `<div class="recibo-row">
            <span>${escapeHtml(f)}</span>
            <span>${money(v)}</span>
          </div>`
        )
        .join('') ||

        '<div class="recibo-row">' +
          '<span>Nenhum pagamento confirmado</span>' +
          '<span></span>' +
        '</div>';

    const linhas =
      done.map(a =>
        `<div class="recibo-row">
          <span>
            ${a.hora.slice(0,5)}
            —
            ${escapeHtml(a.cliente)}
            (${escapeHtml(a.servico_nome || serviceName(a.servico_id))})
          </span>
          <span>${money(a.valor)}</span>
        </div>`
      ).join('') ||

      '<div class="recibo-row">' +
        '<span>Nenhum item concluído nesta data.</span>' +
        '<span></span>' +
      '</div>';

    const pendentesQtd =
      items.filter(a => a.status === 'agendado' || a.status === 'em_andamento').length;

    document.getElementById('print-area').innerHTML = `

      <div class="recibo-header">
        <h2>${escapeHtml((empresaLogada && empresaLogada.nome) || 'Orvix')} — Fechamento do dia</h2>
        <div>${capitalize(fmtDatePretty(selectedDate))}</div>
      </div>

      <div class="recibo-row" style="font-weight:600;">
        <span>Itens concluídos</span>
        <span>${done.length}</span>
      </div>

      ${linhas}

      <div class="recibo-total">
        <span>Total faturado</span>
        <span>${money(total)}</span>
      </div>

      <div class="recibo-row">
        <span>Recebido</span>
        <span>${money(pago)}</span>
      </div>

      <div class="recibo-row">
        <span>Pendente</span>
        <span>${money(pendente)}</span>
      </div>

      <h3 style="margin-top:18px; font-size:14px;">Por forma de pagamento</h3>

      ${formaLinhas}

      ${
        pendentesQtd > 0
          ? `<div class="recibo-row" style="margin-top:12px;">
              <span>Ainda agendados/em andamento hoje</span>
              <span>${pendentesQtd}</span>
            </div>`
          : ''
      }

    `;

    window.print();
  }


  // ============================================================
  // FINANCEIRO
  // ============================================================

  async function refreshFinanceiro(){

    try{

      const [range, despesas] = await Promise.all([
        fetchWideRange(),
        fetchWideRangeExpenses()
      ]);

      allDoneCache = range.filter(a => a.status === 'concluido');

      allExpensesCache = despesas;

      renderFinanceiro();

    }catch(e){

      const bars = document.getElementById('fin-bars');

      if(bars){
        bars.innerHTML =
          '<div class="empty">' +
            '<strong>Não foi possível carregar os dados</strong>' +
            'Verifique a conexão com o banco de dados.' +
          '</div>';
      }
    }
  }


  function wideRangeDates(){

    const now = new Date();
    const past = new Date(now);

    past.setDate(now.getDate() - 90);

    return {
      de: past.toISOString().slice(0,10),
      ate: now.toISOString().slice(0,10)
    };
  }


  async function fetchWideRange(){
    const { de, ate } = wideRangeDates();
    return api(`/agendamentos?de=${de}&ate=${ate}`);
  }


  async function fetchWideRangeExpenses(){
    const { de, ate } = wideRangeDates();
    return api(`/despesas?de=${de}&ate=${ate}`);
  }


  function renderBars(containerId, entries, emptyMsg){

    const el = document.getElementById(containerId);

    if(!el){ return; }

    if(entries.length === 0){
      el.innerHTML = '<div class="empty">' + emptyMsg + '</div>';
      return;
    }

    const maxVal = entries[0][1];

    el.innerHTML = entries.map(([name,val]) =>
      `<div class="bar-row">
        <div class="name">${escapeHtml(name)}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${maxVal ? val / maxVal * 100 : 0}%"></div>
        </div>
        <div class="amount">${money(val)}</div>
      </div>`
    ).join('');
  }


  function renderFinanceiro(){

    const done = allDoneCache;
    const today = todayISO();
    const now = new Date();

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);

    const monthStr = today.slice(0,7);

    const sumWhere = fn =>
      done.filter(fn).reduce((s,a) => s + Number(a.valor), 0);

    const hoje = sumWhere(a => a.data === today);

    const semana = sumWhere(a => a.data >= sevenDaysAgo.toISOString().slice(0,10));

    const mes = sumWhere(a => a.data.slice(0,7) === monthStr);

    const doneMes = done.filter(a => a.data.slice(0,7) === monthStr);

    document.getElementById('fin-hoje').textContent = money(hoje);
    document.getElementById('fin-semana').textContent = money(semana);
    document.getElementById('fin-mes').textContent = money(mes);
    document.getElementById('fin-count').textContent = doneMes.length;

    const despesasMes =
      allExpensesCache.filter(d => d.data.slice(0,7) === monthStr);

    const totalDespesasMes =
      despesasMes.reduce((s,d) => s + Number(d.valor), 0);

    const lucroMes = mes - totalDespesasMes;

    document.getElementById('fin-despesas-mes').textContent =
      money(totalDespesasMes);

    const lucroEl = document.getElementById('fin-lucro-mes');

    if(lucroEl){ lucroEl.textContent = money(lucroMes); }

    document
      .getElementById('fin-lucro-card')
      ?.classList.toggle('negative', lucroMes < 0);

    const bySvc = {};

    doneMes.forEach(a => {

      const name = a.servico_nome || serviceName(a.servico_id);

      bySvc[name] = (bySvc[name] || 0) + Number(a.valor);
    });

    renderBars(
      'fin-bars',
      Object.entries(bySvc).sort((a,b) => b[1] - a[1]),
      'Nenhum faturamento registrado este mês ainda.'
    );

    const byCat = {};

    despesasMes.forEach(d => {

      const cat = d.categoria || 'Outros';

      byCat[cat] = (byCat[cat] || 0) + Number(d.valor);
    });

    renderBars(
      'fin-despesas-bars',
      Object.entries(byCat).sort((a,b) => b[1] - a[1]),
      'Nenhuma despesa registrada este mês ainda.'
    );

    updateSideStats(hoje);
  }


  function updateSideStats(hojeVal){

    if(hojeVal === undefined){

      const today = todayISO();

      hojeVal =
        allDoneCache
          .filter(a => a.data === today)
          .reduce((s,a) => s + Number(a.valor), 0);
    }

    const todayEl = document.getElementById('side-today');

    if(todayEl){ todayEl.textContent = money(hojeVal); }

    const pendenteTotal =
      allDoneCache
        .filter(a => a.status_pagamento === 'pendente')
        .reduce((s,a) => s + Number(a.valor), 0);

    const pendingEl = document.getElementById('side-pending');

    if(pendingEl){ pendingEl.textContent = money(pendenteTotal); }
  }


  // ============================================================
  // SERVIÇOS (CRUD)
  // ============================================================

  const overlayService = document.getElementById('overlay-service');


  document.getElementById('btn-new-service')?.addEventListener('click', () => {

    editingServiceId = null;

    document.getElementById('sv-name').value = '';
    document.getElementById('sv-price').value = '';
    document.getElementById('sv-duration').value = '';

    overlayService?.classList.add('active');
  });


  document
    .getElementById('btn-cancel-service')
    ?.addEventListener('click', () => overlayService?.classList.remove('active'));


  overlayService?.addEventListener('click', e => {

    if(e.target === overlayService){
      overlayService.classList.remove('active');
    }
  });


  document.getElementById('form-service')?.addEventListener('submit', async e => {

    e.preventDefault();

    const nome = document.getElementById('sv-name').value.trim();
    const preco = parseFloat(document.getElementById('sv-price').value) || 0;
    const duracao_min = parseInt(document.getElementById('sv-duration').value) || 0;

    try{

      if(editingServiceId){

        await api('/servicos/' + editingServiceId, {
          method:'PUT',
          body:JSON.stringify({ nome, preco, duracao_min })
        });

      }else{

        await api('/servicos', {
          method:'POST',
          body:JSON.stringify({ nome, preco, duracao_min })
        });
      }

      overlayService?.classList.remove('active');

      await loadServices();
      await refreshServicos();

    }catch(err){

      alert('Não foi possível salvar: ' + err.message);
    }
  });


  function editService(id){

    const s = state.services.find(x => String(x.id) === String(id));

    if(!s){ return; }

    editingServiceId = id;

    document.getElementById('sv-name').value = s.nome;
    document.getElementById('sv-price').value = s.preco;
    document.getElementById('sv-duration').value = s.duracao_min;

    overlayService?.classList.add('active');
  }


  async function removeService(id){

    if(!confirm(
      'Remover este item permanentemente? Agendamentos que já o usam continuam existindo, só perdem a referência ao nome.'
    )){ return; }

    try{

      await api('/servicos/' + id, { method:'DELETE' });

      await loadServices();
      await refreshServicos();

    }catch(e){

      alert('Erro ao remover: ' + e.message);
    }
  }


  async function refreshServicos(){

    if(state.services.length === 0){ await loadServices(); }

    const list = document.getElementById('services-list');

    if(!list){ return; }

    if(state.services.length === 0){

      list.innerHTML =
        '<div class="empty">Nenhum item cadastrado ainda.</div>';

      return;
    }

    list.innerHTML = state.services.map(s =>
      `<div class="invoice-row" style="grid-template-columns:1fr auto auto;">

        <div>
          <div class="client">${escapeHtml(s.nome)}</div>
          <div class="meta">${s.duracao_min} min</div>
        </div>

        <span class="price-tag">${money(s.preco)}</span>

        <div class="ticket-actions">
          <button class="btn btn-small btn-ghost" onclick="App.editService('${s.id}')">Editar</button>
          <button class="btn btn-small btn-ghost" onclick="App.removeService('${s.id}')">Remover</button>
        </div>

      </div>`
    ).join('');
  }


  // ============================================================
  // CLIENTES
  // ============================================================

  function clientesEmptyHtml(){

    const n = getNicho();

    const dica = n.extra1
      ? 'nome, telefone ou ' + n.extra1.label.toLowerCase()
      : 'nome ou telefone';

    return `
      <div class="empty">
        <svg class="empty-icon" viewBox="0 0 20 20">
          <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <path d="M17 17l-4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <strong>Busque um(a) ${escapeHtml(n.cliente.toLowerCase())}</strong>
        Digite ${escapeHtml(dica)} e veja todo o histórico de atendimentos.
      </div>
    `;
  }


  document.getElementById('btn-cli-search')?.addEventListener('click', runClientSearch);


  document.getElementById('cli-search-input')?.addEventListener('keydown', e => {

    if(e.key === 'Enter'){
      e.preventDefault();
      runClientSearch();
    }
  });


  document.getElementById('cli-search-input')?.addEventListener('input', e => {

    document
      .getElementById('btn-cli-clear')
      ?.classList.toggle('visible', e.target.value.length > 0);
  });


  document.getElementById('btn-cli-clear')?.addEventListener('click', () => {

    const input = document.getElementById('cli-search-input');

    if(!input){ return; }

    input.value = '';

    document.getElementById('btn-cli-clear')?.classList.remove('visible');

    document.getElementById('cli-summary').innerHTML = '';
    document.getElementById('cli-results').innerHTML = clientesEmptyHtml();

    input.focus();
  });


  async function runClientSearch(){

    const termo = document.getElementById('cli-search-input').value.trim();

    const resultsEl = document.getElementById('cli-results');
    const summaryEl = document.getElementById('cli-summary');

    if(!termo){

      resultsEl.innerHTML = clientesEmptyHtml();
      summaryEl.innerHTML = '';

      return;
    }

    resultsEl.innerHTML = '<div class="empty">Buscando…</div>';
    summaryEl.innerHTML = '';

    try{

      const items = await api('/agendamentos?busca=' + encodeURIComponent(termo));

      renderClientResults(items);

    }catch(e){

      resultsEl.innerHTML =
        '<div class="empty">' +
          '<strong>Não foi possível buscar</strong>' +
          'Verifique a conexão com o banco de dados.' +
        '</div>';
    }
  }


  function renderClientResults(items){

    const summaryEl = document.getElementById('cli-summary');
    const resultsEl = document.getElementById('cli-results');

    if(items.length === 0){

      summaryEl.innerHTML = '';

      resultsEl.innerHTML =
        '<div class="empty">' +
          '<strong>Nada encontrado</strong>' +
          'Confira se digitou corretamente.' +
        '</div>';

      return;
    }

    const concluidos = items.filter(a => a.status === 'concluido');

    const totalGasto = concluidos.reduce((s,a) => s + Number(a.valor), 0);

    const ultima = items[0];

    summaryEl.innerHTML = `

      <div class="totals-strip">

        <div class="stat-card">
          <div class="label">Visitas encontradas</div>
          <div class="value">${items.length}</div>
        </div>

        <div class="stat-card money">
          <div class="label">Total gasto (concluídos)</div>
          <div class="value">${money(totalGasto)}</div>
        </div>

        <div class="stat-card">
          <div class="label">Última visita</div>
          <div class="value" style="font-size:16px;">
            ${new Date(ultima.data + 'T00:00:00').toLocaleDateString('pt-BR')}
          </div>
        </div>

      </div>
    `;

    resultsEl.innerHTML = items.map(ap => {

      const statusLabel = {
        agendado:'agendado',
        em_andamento:'em andamento',
        concluido:'concluído',
        cancelado:'cancelado'
      }[ap.status];

      const dataCurta =
        new Date(ap.data + 'T00:00:00').toLocaleDateString('pt-BR', {
          day:'2-digit',
          month:'2-digit'
        });

      return `

        <div class="ticket status-${ap.status}">

          <div class="ticket-time">
            ${dataCurta}
            <small>${statusLabel}</small>
          </div>

          <div class="ticket-body">

            <div class="client">${escapeHtml(ap.cliente)}</div>

            <div class="meta">
              <span>${ap.hora.slice(0,5)}</span>
              <span>${escapeHtml(ap.servico_nome || serviceName(ap.servico_id))}</span>
              ${detalhesHtml(ap)}
            </div>

          </div>

          <div class="ticket-actions">
            <span class="price-tag">${money(ap.valor)}</span>
          </div>

        </div>

      `;

    }).join('');
  }


  // ============================================================
  // DESPESAS
  // ============================================================

  const overlayExpense = document.getElementById('overlay-expense');


  document.getElementById('btn-new-expense')?.addEventListener('click', () => {

    document.getElementById('ex-desc').value = '';
    document.getElementById('ex-category').value = 'Produtos de limpeza';
    document.getElementById('ex-date').value = todayISO();
    document.getElementById('ex-value').value = '';

    overlayExpense?.classList.add('active');

    document.getElementById('ex-desc')?.focus();
  });


  document
    .getElementById('btn-cancel-expense')
    ?.addEventListener('click', () => overlayExpense?.classList.remove('active'));


  overlayExpense?.addEventListener('click', e => {

    if(e.target === overlayExpense){
      overlayExpense.classList.remove('active');
    }
  });


  document.getElementById('form-expense')?.addEventListener('submit', async e => {

    e.preventDefault();

    const payload = {
      descricao: document.getElementById('ex-desc').value.trim(),
      categoria: document.getElementById('ex-category').value,
      data: document.getElementById('ex-date').value,
      valor: parseFloat(document.getElementById('ex-value').value) || 0
    };

    try{

      await api('/despesas', {
        method:'POST',
        body:JSON.stringify(payload)
      });

      overlayExpense?.classList.remove('active');

      await refreshDespesas();

    }catch(err){

      alert('Não foi possível salvar a despesa: ' + err.message);
    }
  });


  async function removeExpense(id){

    if(!confirm('Remover esta despesa?')){ return; }

    try{

      await api('/despesas/' + id, { method:'DELETE' });

      await refreshDespesas();

    }catch(e){

      alert('Erro ao remover: ' + e.message);
    }
  }


  async function refreshDespesas(){

    const listEl = document.getElementById('desp-list');

    if(!listEl){ return; }

    listEl.innerHTML = '<div class="empty">Carregando…</div>';

    let items;

    try{

      items = await fetchWideRangeExpenses();

    }catch(e){

      listEl.innerHTML =
        '<div class="empty">' +
          '<strong>Não foi possível carregar as despesas</strong>' +
          'Verifique a conexão com o banco de dados.' +
        '</div>';

      return;
    }

    allExpensesCache = items;

    const total = items.reduce((s,d) => s + Number(d.valor), 0);

    document.getElementById('desp-total').textContent = money(total);
    document.getElementById('desp-count').textContent = items.length;

    if(items.length === 0){

      listEl.innerHTML =
        '<div class="empty">' +
          '<strong>Nenhuma despesa nos últimos 90 dias</strong>' +
          'Toque em "Nova despesa" para lançar produtos, água, luz, manutenção etc.' +
        '</div>';

      return;
    }

    listEl.innerHTML = items.map(d =>
      `<div class="invoice-row" style="grid-template-columns:1fr auto auto;">

        <div>
          <div class="client">${escapeHtml(d.descricao)}</div>
          <div class="meta">
            ${new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR')}
            ·
            ${escapeHtml(d.categoria)}
          </div>
        </div>

        <span class="price-tag" style="color:var(--warn);">${money(d.valor)}</span>

        <div class="ticket-actions">
          <button class="btn btn-small btn-ghost" onclick="App.removeExpense('${d.id}')">Remover</button>
        </div>

      </div>`
    ).join('');
  }


  // ============================================================
  // USUÁRIOS
  // ============================================================

  const overlayUser = document.getElementById('overlay-user');
  const formUser = document.getElementById('form-user');


  document.getElementById('btn-new-user')?.addEventListener('click', openNewUser);


  function openNewUser(){

    if(!isAdministrador()){
      alert('Apenas administradores podem gerenciar usuários.');
      return;
    }

    editingUserId = null;

    const title = document.getElementById('user-modal-title');
    if(title){ title.textContent = 'Novo usuário'; }

    const submit = document.getElementById('user-submit-btn');
    if(submit){ submit.textContent = 'Criar usuário'; }

    const name = document.getElementById('user-name');
    const email = document.getElementById('user-email');
    const profile = document.getElementById('user-profile');
    const password = document.getElementById('user-password');
    const passwordField = document.getElementById('user-password-field');
    const activeField = document.getElementById('user-active-field');

    if(name){ name.value = ''; }
    if(email){ email.value = ''; }
    if(profile){ profile.value = 'funcionario'; }

    if(password){
      password.value = '';
      password.required = true;
    }

    if(passwordField){ passwordField.style.display = ''; }
    if(activeField){ activeField.style.display = 'none'; }

    marcarPermissoesNoFormulario([]);
    atualizarVisibilidadePermissoes();

    overlayUser?.classList.add('active');

    name?.focus();
  }


  document.getElementById('btn-cancel-user')?.addEventListener('click', closeUserModal);


  overlayUser?.addEventListener('click', e => {

    if(e.target === overlayUser){ closeUserModal(); }
  });


  function closeUserModal(){
    overlayUser?.classList.remove('active');
    editingUserId = null;
  }


  // CHECKBOXES DE PERMISSÃO NO MODAL DE USUÁRIO

  function marcarPermissoesNoFormulario(selecionadas){

    const checkboxes = document.querySelectorAll(
      '#form-user .user-permissao-checkbox, #form-user [data-permission]'
    );

    const lista = Array.isArray(selecionadas) ? selecionadas.map(String) : [];

    checkboxes.forEach(cb => {

      const codigo =
        cb.value || cb.dataset.permission || cb.dataset.permissao || '';

      cb.checked = lista.includes(String(codigo));
    });
  }


  function lerPermissoesDoFormulario(){

    const checkboxes = document.querySelectorAll(
      '#form-user .user-permissao-checkbox, #form-user [data-permission]'
    );

    const permissoes = [];

    checkboxes.forEach(cb => {

      if(!cb.checked){ return; }

      const codigo =
        cb.value || cb.dataset.permission || cb.dataset.permissao || '';

      if(codigo && !permissoes.includes(codigo)){
        permissoes.push(codigo);
      }
    });

    return permissoes;
  }


  // VISIBILIDADE DAS PERMISSÕES (grid some para administrador)

  function atualizarVisibilidadePermissoes(){

    const profileEl = document.getElementById('user-profile');

    const grid =
      document.getElementById('permissions-grid') ||
      document.getElementById('user-permissions-field');

    const aviso = document.getElementById('admin-permission-notice');

    if(!profileEl){ return; }

    const admin = profileEl.value === 'administrador';

    if(grid){ grid.style.display = admin ? 'none' : ''; }
    if(aviso){ aviso.style.display = admin ? '' : 'none'; }
  }


  document
    .getElementById('user-profile')
    ?.addEventListener('change', atualizarVisibilidadePermissoes);


  // FORMULÁRIO USUÁRIO

  formUser?.addEventListener('submit', async e => {

    e.preventDefault();

    if(!isAdministrador()){
      alert('Apenas administradores podem realizar esta operação.');
      return;
    }

    const nome = document.getElementById('user-name')?.value.trim();
    const email = document.getElementById('user-email')?.value.trim();
    const perfil = document.getElementById('user-profile')?.value;
    const senha = document.getElementById('user-password')?.value;

    if(!nome || !email){
      alert('Informe nome e e-mail.');
      return;
    }

    const submit = document.getElementById('user-submit-btn');

    if(submit){
      submit.disabled = true;
      submit.textContent = editingUserId ? 'Salvando...' : 'Criando...';
    }

    const permissoes =
      perfil === 'administrador' ? [] : lerPermissoesDoFormulario();

    try{

      if(editingUserId){

        const ativoSelect = document.getElementById('user-active');

        const ativo = ativoSelect ? ativoSelect.value === 'true' : true;

        await api('/usuarios/' + editingUserId, {
          method:'PUT',
          body:JSON.stringify({ nome, email, perfil, ativo, permissoes })
        });

        if(senha && senha.trim().length > 0){

          await api('/usuarios/' + editingUserId + '/senha', {
            method:'PATCH',
            body:JSON.stringify({ senha })
          });
        }

      }else{

        if(!senha){
          alert('Informe uma senha para o novo usuário.');
          return;
        }

        await api('/usuarios', {
          method:'POST',
          body:JSON.stringify({ nome, email, senha, perfil, permissoes })
        });
      }

      closeUserModal();

      await refreshUsuarios();

    }catch(err){

      alert('Não foi possível salvar o usuário: ' + err.message);

    }finally{

      if(submit){
        submit.disabled = false;
        submit.textContent = editingUserId ? 'Salvar alterações' : 'Criar usuário';
      }
    }
  });


  // LISTAR USUÁRIOS

  async function refreshUsuarios(){

    if(!isAdministrador()){
      atualizarAcessoUsuarios();
      return;
    }

    const list = document.getElementById('usuarios-list');

    if(!list){ return; }

    list.innerHTML = '<div class="empty">Carregando usuários…</div>';

    try{

      const usuarios = await api('/usuarios');

      renderUsuarios(usuarios);

    }catch(error){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Não foi possível carregar os usuários</strong>' +
          escapeHtml(error.message) +
        '</div>';
    }
  }


  function renderUsuarios(usuarios){

    const list = document.getElementById('usuarios-list');

    if(!list){ return; }

    const total = document.getElementById('usuarios-total');
    const admins = document.getElementById('usuarios-admins');
    const funcionarios = document.getElementById('usuarios-funcionarios');

    const qtdAdmins = usuarios.filter(u => u.perfil === 'administrador').length;
    const qtdFuncionarios = usuarios.filter(u => u.perfil === 'funcionario').length;

    if(total){ total.textContent = usuarios.length; }
    if(admins){ admins.textContent = qtdAdmins; }
    if(funcionarios){ funcionarios.textContent = qtdFuncionarios; }

    if(usuarios.length === 0){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Nenhum usuário cadastrado</strong>' +
          'Clique em "Novo usuário" para adicionar alguém à sua empresa.' +
        '</div>';

      return;
    }

    list.innerHTML =
      usuarios.map(usuario => renderUsuario(usuario, usuarios)).join('');
  }


  function renderUsuario(usuario, todosUsuarios){

    const nome = escapeHtml(usuario.nome);
    const email = escapeHtml(usuario.email);
    const inicial = (usuario.nome || 'U').charAt(0).toUpperCase();

    const isCurrentUser = Number(usuario.id) === Number(usuarioLogado?.id);

    const perfilLabel =
      usuario.perfil === 'administrador' ? 'Administrador' : 'Funcionário';

    const statusLabel = usuario.ativo ? 'Ativo' : 'Bloqueado';

    const adminCount =
      todosUsuarios.filter(u => u.perfil === 'administrador').length;

    const isLastAdmin = usuario.perfil === 'administrador' && adminCount <= 1;

    let actions = '';

    actions +=
      `<button class="btn btn-small btn-ghost" onclick="App.editUser('${usuario.id}')">Editar</button>`;

    if(!isCurrentUser){

      if(usuario.perfil === 'funcionario'){

        actions +=
          `<button class="btn btn-small btn-ghost" onclick="App.changeUserProfile('${usuario.id}','administrador')">Tornar administrador</button>`;

      }else if(!isLastAdmin){

        actions +=
          `<button class="btn btn-small btn-ghost" onclick="App.changeUserProfile('${usuario.id}','funcionario')">Rebaixar</button>`;
      }

      actions +=
        `<button class="btn btn-small btn-ghost" onclick="App.toggleUserStatus('${usuario.id}',${usuario.ativo ? 'false' : 'true'})">${usuario.ativo ? 'Bloquear' : 'Ativar'}</button>`;

      actions +=
        `<button class="btn btn-small btn-ghost" onclick="App.deleteUser('${usuario.id}')">Excluir</button>`;
    }

    return `
      <div class="ticket" style="align-items:center; opacity:${usuario.ativo ? '1' : '.65'};">

        <div
          class="sidebar-user-avatar"
          style="width:40px; height:40px; min-width:40px; font-size:14px; overflow-y:auto;"
        >${escapeHtml(inicial)}</div>

        <div class="ticket-body" style="min-width:0;">

          <div class="client">
            ${nome}
            ${isCurrentUser ? `<span class="badge badge-pago" style="margin-left:6px;">Você</span>` : ''}
          </div>

          <div class="meta">
            <span>${email}</span>
            <span>${perfilLabel}</span>
            <span>${statusLabel}</span>
          </div>

        </div>

        <div class="ticket-actions" style="flex-wrap:wrap; justify-content:flex-end;">
          ${actions}
        </div>

      </div>
    `;
  }


  async function editUser(id){

    if(!isAdministrador()){
      alert('Apenas administradores podem editar usuários.');
      return;
    }

    try{

      const usuarios = await api('/usuarios');

      const usuario = usuarios.find(u => String(u.id) === String(id));

      if(!usuario){
        alert('Usuário não encontrado.');
        return;
      }

      editingUserId = id;

      const title = document.getElementById('user-modal-title');
      if(title){ title.textContent = 'Editar usuário'; }

      const submit = document.getElementById('user-submit-btn');
      if(submit){ submit.textContent = 'Salvar alterações'; }

      const name = document.getElementById('user-name');
      const email = document.getElementById('user-email');
      const profile = document.getElementById('user-profile');
      const password = document.getElementById('user-password');
      const passwordField = document.getElementById('user-password-field');
      const activeField = document.getElementById('user-active-field');
      const active = document.getElementById('user-active');

      if(name){ name.value = usuario.nome || ''; }
      if(email){ email.value = usuario.email || ''; }
      if(profile){ profile.value = usuario.perfil || 'funcionario'; }

      if(password){
        password.value = '';
        password.required = false;
        password.placeholder = 'Deixe vazio para manter a atual';
      }

      if(passwordField){ passwordField.style.display = ''; }
      if(activeField){ activeField.style.display = ''; }
      if(active){ active.value = usuario.ativo ? 'true' : 'false'; }

      marcarPermissoesNoFormulario(usuario.permissoes || []);
      atualizarVisibilidadePermissoes();

      overlayUser?.classList.add('active');

      name?.focus();

    }catch(error){

      alert('Não foi possível carregar o usuário: ' + error.message);
    }
  }


  async function changeUserProfile(id, novoPerfil){

    if(!isAdministrador()){
      alert('Apenas administradores podem alterar cargos.');
      return;
    }

    const nomePerfil =
      novoPerfil === 'administrador' ? 'administrador' : 'funcionário';

    if(!confirm(`Deseja alterar este usuário para ${nomePerfil}?`)){ return; }

    try{

      await api('/usuarios/' + id, {
        method:'PUT',
        body:JSON.stringify({ perfil: novoPerfil })
      });

      await refreshUsuarios();

    }catch(error){

      alert('Não foi possível alterar o cargo: ' + error.message);
    }
  }


  async function toggleUserStatus(id, ativo){

    if(!isAdministrador()){
      alert('Apenas administradores podem bloquear usuários.');
      return;
    }

    if(Number(id) === Number(usuarioLogado?.id)){
      alert('Você não pode bloquear o próprio usuário.');
      return;
    }

    const acao = ativo ? 'ativar' : 'bloquear';

    if(!confirm(`Deseja ${acao} este usuário?`)){ return; }

    try{

      await api('/usuarios/' + id, {
        method:'PUT',
        body:JSON.stringify({ ativo })
      });

      await refreshUsuarios();

    }catch(error){

      alert(`Não foi possível ${acao} o usuário: ` + error.message);
    }
  }


  async function deleteUser(id){

    if(!isAdministrador()){
      alert('Apenas administradores podem excluir usuários.');
      return;
    }

    if(Number(id) === Number(usuarioLogado?.id)){
      alert('Você não pode excluir o próprio usuário.');
      return;
    }

    if(!confirm('Deseja excluir este usuário definitivamente?')){ return; }

    try{

      await api('/usuarios/' + id, { method:'DELETE' });

      await refreshUsuarios();

    }catch(error){

      alert('Não foi possível excluir o usuário: ' + error.message);
    }
  }


  // ============================================================
  // MODAL OBRIGATÓRIO - SELEÇÃO DE PLANO
  // ============================================================

  function mostrarModalPlano(){

    const modal = document.getElementById('modal-plano-obrigatorio');

    if(!modal){
      console.warn('Modal obrigatório de plano não encontrado no HTML.');
      return;
    }

    modal.style.display = 'flex';

    document.body.style.overflow = 'hidden';
  }


  function esconderModalPlano(){

    const modal = document.getElementById('modal-plano-obrigatorio');

    if(!modal){ return; }

    modal.style.display = 'none';

    document.body.style.overflow = '';
  }


  async function carregarPlanosObrigatorios(){

    const loading = document.getElementById('modal-plano-loading');
    const lista = document.getElementById('modal-plano-lista');
    const erro = document.getElementById('modal-plano-erro');

    if(!lista){ return; }

    try{

      if(loading){ loading.style.display = 'block'; }

      lista.innerHTML = '';

      if(erro){
        erro.style.display = 'none';
        erro.textContent = '';
      }

      const planos = await api('/planos/disponiveis');

      if(loading){ loading.style.display = 'none'; }

      if(!Array.isArray(planos) || planos.length === 0){

        if(erro){
          erro.textContent = 'Nenhum plano está disponível no momento.';
          erro.style.display = 'block';
        }

        return;
      }

      planos.forEach(plano => {

        const card = document.createElement('div');
        card.className = 'modal-plano-card';

        const nome = document.createElement('h3');
        nome.textContent = plano.nome || 'Plano';

        const descricao = document.createElement('div');
        descricao.className = 'modal-plano-card-descricao';
        descricao.textContent = plano.descricao || 'Plano para sua empresa.';

        const preco = document.createElement('div');
        preco.className = 'modal-plano-card-preco';

        const valor = Number(plano.valor || 0);

        preco.innerHTML =
          'R$ ' +
          valor.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }) +
          ' <small>/' + (plano.periodo || 'mês') + '</small>';

        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'modal-plano-btn';
        botao.textContent = 'Escolher plano';

        botao.addEventListener('click', () => {
          selecionarPlanoObrigatorio(plano);
        });

        card.appendChild(nome);
        card.appendChild(descricao);
        card.appendChild(preco);
        card.appendChild(botao);

        lista.appendChild(card);
      });

    }catch(error){

      console.error('Erro ao carregar planos:', error);

      if(loading){ loading.style.display = 'none'; }

      if(erro){
        erro.textContent = error.message || 'Não foi possível carregar os planos.';
        erro.style.display = 'block';
      }
    }
  }


  function selecionarPlanoObrigatorio(plano){

    if(!plano || !plano.id){ return; }

    sessionStorage.setItem('orvix_plano_selecionado', JSON.stringify(plano));

    window.location.href = '/assinaturas.html';
  }


  // ============================================================
  // VERIFICAÇÃO DA ASSINATURA
  // ============================================================

  async function verificarAssinaturaObrigatoria(){

    // DEV e contas de teste não passam pelo Mercado Pago
    if(
      !usuarioLogado ||
      usuarioLogado.perfil === 'dev' ||
      usuarioLogado.conta_teste === true
    ){

      assinaturaVerificada = true;

      esconderModalPlano();

      return true;
    }

    if(empresaLogada && empresaLogada.conta_teste === true){

      assinaturaVerificada = true;

      esconderModalPlano();

      return true;
    }

    // Usuário precisa estar vinculado a uma empresa
    if(!usuarioLogado.empresa_id){

      assinaturaVerificada = false;

      mostrarModalPlano();

      await carregarPlanosObrigatorios();

      return false;
    }

    try{

      const resposta = await api('/mercado-pago/minha-assinatura');

      const possuiAssinatura = resposta?.possui_assinatura === true;

      const status = resposta?.assinatura?.status;

      const assinaturaValida =
        possuiAssinatura &&
        ['ativa', 'authorized', 'active'].includes(
          String(status || '').toLowerCase()
        );

      if(assinaturaValida){

        assinaturaVerificada = true;

        esconderModalPlano();

        return true;
      }

      assinaturaVerificada = false;

      mostrarModalPlano();

      await carregarPlanosObrigatorios();

      return false;

    }catch(error){

      console.warn('Empresa sem assinatura válida:', error.message);

      assinaturaVerificada = false;

      mostrarModalPlano();

      await carregarPlanosObrigatorios();

      return false;
    }
  }


  // ============================================================
  // APP GLOBAL
  // ============================================================

  window.NICHOS = NICHOS;
  window.aplicarNicho = aplicarNicho;

  window.App = {
    setStatus,
    deleteAppointment,
    setPayment,
    setPaymentMethod,
    undoPayment,
    printReceipt,
    editService,
    removeService,
    openEditAppointment,
    removeExpense,
    editUser,
    changeUserProfile,
    toggleUserStatus,
    deleteUser,
    refreshUsuarios,
    aplicarNicho
  };


  // ============================================================
  // INICIALIZAÇÃO DO SISTEMA
  // ============================================================

  async function iniciarSistema(){

    // Sem assinatura válida, o dashboard não carrega os dados da empresa
    const assinaturaLiberada = await verificarAssinaturaObrigatoria();

    if(!assinaturaLiberada){

      if(!connectionInterval){
        connectionInterval = setInterval(checkConnection, 30000);
      }

      return;
    }

    checkConnection();

    if(!connectionInterval){
      connectionInterval = setInterval(checkConnection, 30000);
    }

    atualizarSidebarUsuario();

    try{

      await loadServices();
      await refreshAgenda();
      await refreshSideStats();

    }catch(error){

      console.error('Erro ao iniciar o sistema:', error);
    }
  }


  // ============================================================
  // INICIALIZAÇÃO COM AUTENTICAÇÃO
  // ============================================================

  (async function initAuth(){

    const autenticado = await verificarSessao();

    if(autenticado){
      await iniciarSistema();
    }
  })();


  // ============================================================
  // LOGOUT
  // ============================================================

  document.getElementById('btn-logout')?.addEventListener('click', () => {

    if(!confirm('Deseja sair da sua conta?')){ return; }

    localStorage.removeItem(AUTH_TOKEN_KEY);

    usuarioLogado = null;
    empresaLogada = null;

    window.location.reload();
  });


  // ============================================================
  // SIDEBAR / MENU
  // ============================================================

  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebarOverlay = document.getElementById('sidebar-overlay');


  if(sidebar && sidebarToggle){

    sidebarToggle.addEventListener('click', () => {

      if(window.innerWidth <= 760){

        sidebar.classList.remove('mobile-open');
        sidebarOverlay?.classList.remove('active');

        return;
      }

      sidebar.classList.toggle('collapsed');

      localStorage.setItem(
        'lavajato-sidebar-collapsed',
        sidebar.classList.contains('collapsed')
      );
    });
  }


  if(mobileMenuBtn && sidebar){

    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.add('mobile-open');
      sidebarOverlay?.classList.add('active');
    });
  }


  if(sidebarOverlay && sidebar){

    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      sidebarOverlay.classList.remove('active');
    });
  }


  document.querySelectorAll('.sidebar .nav-btn').forEach(button => {

    button.addEventListener('click', () => {

      if(window.innerWidth <= 760){
        sidebar?.classList.remove('mobile-open');
        sidebarOverlay?.classList.remove('active');
      }
    });
  });


  if(
    sidebar &&
    window.innerWidth > 760 &&
    localStorage.getItem('lavajato-sidebar-collapsed') === 'true'
  ){
    sidebar.classList.add('collapsed');
  }


  window.addEventListener('resize', () => {

    if(window.innerWidth > 760){
      sidebar?.classList.remove('mobile-open');
      sidebarOverlay?.classList.remove('active');
    }
  });

})();



// ============================================================
// CONFIGURAÇÕES — SALVAR
// ============================================================

(() => {

  'use strict';

  const API_CONFIGURACOES = '/api/configuracoes';


  // ============================================================
  // ELEMENTOS
  // ============================================================

  const formEmpresa =
    document.getElementById('form-configuracoes');

  const btnSalvarEmpresa =
    document.getElementById('btn-salvar-configuracoes');

  const btnSalvarPreferencias =
    document.getElementById('btn-salvar-preferencias');

  const btnSalvarTema =
    document.getElementById('btn-salvar-tema');

  const btnRestaurarTema =
    document.getElementById('btn-restaurar-tema');

  const btnSalvarDocumentos =
    document.getElementById('btn-salvar-documentos');

  const btnSalvarAgenda =
    document.getElementById('btn-salvar-agenda');


  // ============================================================
  // LEITURA SEGURA DE CAMPOS
  // ============================================================

  function obterValor(id, fallback = '') {

    const elemento = document.getElementById(id);

    if (!elemento) {
      return fallback;
    }

    return typeof elemento.value === 'string'
      ? elemento.value.trim()
      : fallback;
  }


  function obterCheckbox(id, fallback = false) {

    const elemento = document.getElementById(id);

    if (!elemento) {
      return fallback;
    }

    return Boolean(elemento.checked);
  }


  function obterBooleano(id, fallback = false) {

    const elemento = document.getElementById(id);

    if (!elemento) {
      return fallback;
    }

    // Checkbox
    if (elemento.type === 'checkbox') {
      return Boolean(elemento.checked);
    }

    // Select / input normal
    const valor = String(elemento.value || '').trim().toLowerCase();

    if (valor === 'true') {
      return true;
    }

    if (valor === 'false') {
      return false;
    }

    return fallback;
  }


  function obterNumero(id, fallback = 0) {

    const elemento = document.getElementById(id);

    if (!elemento) {
      return fallback;
    }

    const valor = Number(elemento.value);

    return Number.isFinite(valor)
      ? valor
      : fallback;
  }


  // ============================================================
  // MENSAGENS
  // ============================================================

  function mostrarMensagem(
    elementoId,
    mensagem,
    sucesso = false
  ) {

    const elemento =
      document.getElementById(elementoId);

    if (!elemento) {
      return;
    }

    elemento.textContent = mensagem;

    elemento.style.display = 'block';

    if (sucesso) {

      elemento.style.color = '#166534';

      elemento.style.background =
        'rgba(34,197,94,.10)';

      elemento.style.borderColor =
        'rgba(34,197,94,.25)';

    } else {

      elemento.style.color = '#991B1B';

      elemento.style.background =
        'rgba(239,68,68,.10)';

      elemento.style.borderColor =
        'rgba(239,68,68,.25)';

    }

    clearTimeout(elemento._timeoutMensagem);

    elemento._timeoutMensagem =
      setTimeout(() => {

        elemento.style.display = 'none';

      }, 5000);
  }


  function esconderMensagem(elementoId) {

    const elemento =
      document.getElementById(elementoId);

    if (elemento) {
      elemento.style.display = 'none';
    }
  }


  // ============================================================
  // ESTADO DOS BOTÕES
  // ============================================================

  function alterarEstadoBotao(
    botao,
    carregando,
    textoNormal
  ) {

    if (!botao) {
      return;
    }

    if (carregando) {

      botao.disabled = true;

      botao.dataset.textoOriginal =
        botao.textContent;

      botao.textContent =
        'Salvando...';

    } else {

      botao.disabled = false;

      botao.textContent =
        botao.dataset.textoOriginal ||
        textoNormal;
    }
  }


  // ============================================================
  // REQUISIÇÃO
  // ============================================================

  async function salvarConfiguracoes(dados) {

    console.log(
      '[Orvix] Salvando configurações:',
      dados
    );

    const resposta =
      await fetch(
        API_CONFIGURACOES,
        {
          method: 'PUT',

          credentials: 'include',

          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },

          body: JSON.stringify(dados)
        }
      );


    let resultado = {};

    try {

      resultado =
        await resposta.json();

    } catch (_) {

      resultado = {};

    }


    // ==========================================================
    // SESSÃO EXPIRADA
    // ==========================================================

    if (resposta.status === 401) {

      localStorage.removeItem('lavajato_auth_token');

      window.location.href = '/';

      throw new Error(
        'Sua sessão expirou. Faça login novamente.'
      );
    }


    // ==========================================================
    // SEM PERMISSÃO
    // ==========================================================

    if (resposta.status === 403) {

      throw new Error(
        resultado.erro ||
        'Você não possui permissão para alterar estas configurações.'
      );
    }


    // ==========================================================
    // RATE LIMIT
    // ==========================================================

    if (resposta.status === 429) {

      window.location.replace('/429.html');

      throw new Error(
        'Muitas requisições. Aguarde alguns instantes.'
      );
    }


    // ==========================================================
    // OUTROS ERROS
    // ==========================================================

    if (!resposta.ok) {

      throw new Error(
        resultado.erro ||
        'Não foi possível salvar as configurações.'
      );
    }


    console.log(
      '[Orvix] Configurações salvas:',
      resultado
    );


    return resultado;
  }


  // ============================================================
  // ATUALIZA EMPRESA LOCAL
  // ============================================================

  function atualizarEmpresaLocal(resultado) {

    if (
      resultado &&
      resultado.empresa &&
      typeof empresaLogada === 'object'
    ) {

      empresaLogada = {
        ...empresaLogada,
        ...resultado.empresa
      };

      atualizarSidebarUsuario();

      return;
    }


    if (
      resultado &&
      resultado.configuracoes &&
      typeof empresaLogada === 'object'
    ) {

      empresaLogada = {
        ...empresaLogada,
        ...resultado.configuracoes
      };

      atualizarSidebarUsuario();
    }
  }


  // ============================================================
  // DADOS DA EMPRESA
  // ============================================================

  if (formEmpresa) {

    formEmpresa.addEventListener(
      'submit',
      async event => {

        event.preventDefault();

        esconderMensagem(
          'configuracoes-message'
        );


        const dados = {

          nome:
            obterValor(
              'config-empresa-nome'
            ),

          email:
            obterValor(
              'config-empresa-email'
            ),

          telefone:
            obterValor(
              'config-empresa-telefone'
            ) || null,

          nicho:
            obterValor(
              'config-empresa-nicho'
            ),

          nome_exibicao:
            obterValor(
              'config-empresa-nome-exibicao'
            ) || null,

          logo_url:
            obterValor(
              'config-logo-url'
            ) || null
        };


        console.log(
          '[Orvix] Dados da empresa:',
          dados
        );


        try {

          alterarEstadoBotao(
            btnSalvarEmpresa,
            true,
            'Salvar alterações'
          );


          const resultado =
            await salvarConfiguracoes(
              dados
            );


          atualizarEmpresaLocal(
            resultado
          );


          mostrarMensagem(
            'configuracoes-message',
            'Dados da empresa salvos com sucesso.',
            true
          );


        } catch (erro) {

          console.error(
            'Erro ao salvar dados da empresa:',
            erro
          );


          mostrarMensagem(
            'configuracoes-message',
            erro.message ||
            'Não foi possível salvar os dados da empresa.'
          );


        } finally {

          alterarEstadoBotao(
            btnSalvarEmpresa,
            false,
            'Salvar alterações'
          );
        }
      }
    );
  }


  // ============================================================
  // PREFERÊNCIAS REGIONAIS
  // ============================================================

  async function salvarPreferenciasRegionais() {

    const dados = {

      moeda:
        obterValor(
          'config-moeda'
        ),

      idioma:
        obterValor(
          'config-idioma'
        ),

      formato_data:
        obterValor(
          'config-formato-data'
        ),

      formato_hora:
        obterValor(
          'config-formato-hora'
        ),

      fuso_horario:
        obterValor(
          'config-fuso-horario'
        )
    };


    console.log(
      '[Orvix] Preferências regionais:',
      dados
    );


    return salvarConfiguracoes(
      dados
    );
  }


  // ============================================================
  // PREFERÊNCIAS DO SISTEMA
  // ============================================================

  if (btnSalvarPreferencias) {

    btnSalvarPreferencias.addEventListener(
      'click',
      async () => {

        try {

          alterarEstadoBotao(
            btnSalvarPreferencias,
            true,
            'Salvar preferências'
          );


          const dados = {

            notificacoes_ativas:
              obterBooleano(
                'config-notificacoes-ativas'
              ),

            mostrar_valores:
              obterBooleano(
                'config-mostrar-valores'
              ),

            dashboard_inicial:
              obterBooleano(
                'config-dashboard-inicial'
              ),

            modo_compacto:
              obterBooleano(
                'config-modo-compacto'
              )
          };


          console.log(
            '[Orvix] Preferências do sistema:',
            dados
          );


          const resultado =
            await salvarConfiguracoes(
              dados
            );


          atualizarEmpresaLocal(
            resultado
          );


          mostrarMensagem(
            'configuracoes-message',
            'Preferências salvas com sucesso.',
            true
          );


        } catch (erro) {

          console.error(
            'Erro ao salvar preferências:',
            erro
          );


          mostrarMensagem(
            'configuracoes-message',
            erro.message ||
            'Não foi possível salvar as preferências.'
          );


        } finally {

          alterarEstadoBotao(
            btnSalvarPreferencias,
            false,
            'Salvar preferências'
          );
        }
      }
    );
  }


  // ============================================================
  // APARÊNCIA — COLOR PICKER
  // ============================================================

  function sincronizarCor(
    inputColorId,
    inputTextId
  ) {

    const color =
      document.getElementById(
        inputColorId
      );

    const text =
      document.getElementById(
        inputTextId
      );


    if (!color || !text) {
      return;
    }


    color.addEventListener(
      'input',
      () => {

        text.value =
          color.value.toUpperCase();

        atualizarPreviewTema();
      }
    );


    text.addEventListener(
      'input',
      () => {

        const valor =
          text.value.trim();


        if (
          /^#[0-9A-Fa-f]{6}$/.test(
            valor
          )
        ) {

          color.value =
            valor;

          atualizarPreviewTema();
        }
      }
    );


    text.addEventListener(
      'blur',
      () => {

        const valor =
          text.value.trim();


        if (
          /^#[0-9A-Fa-f]{6}$/.test(
            valor
          )
        ) {

          text.value =
            valor.toUpperCase();
        }
      }
    );
  }


  sincronizarCor(
    'config-cor-principal',
    'config-cor-principal-text'
  );


  sincronizarCor(
    'config-cor-destaque',
    'config-cor-destaque-text'
  );


  sincronizarCor(
    'config-cor-fundo',
    'config-cor-fundo-text'
  );


  // ============================================================
  // PREVIEW DO TEMA
  // ============================================================

  function atualizarPreviewTema() {

    const primary =
      obterValor(
        'config-cor-principal',
        '#0E3A4C'
      ) || '#0E3A4C';


    const accent =
      obterValor(
        'config-cor-destaque',
        '#06B6C4'
      ) || '#06B6C4';


    const background =
      obterValor(
        'config-cor-fundo',
        '#F5F7FA'
      ) || '#F5F7FA';


    const preview =
      document.getElementById(
        'config-tema-preview'
      );


    const badge =
      document.getElementById(
        'config-tema-preview-badge'
      );


    const button =
      document.getElementById(
        'config-tema-preview-button'
      );


    if (preview) {
      preview.style.background =
        background;
    }


    if (badge) {
      badge.style.background =
        accent;
    }


    if (button) {
      button.style.background =
        primary;
    }
  }


  // ============================================================
  // TEMAS RÁPIDOS
  // ============================================================

  document
    .querySelectorAll('.theme-preset')
    .forEach(botao => {

      botao.addEventListener(
        'click',
        () => {

          const primary =
            botao.dataset.primary ||
            '#0E3A4C';

          const accent =
            botao.dataset.accent ||
            '#06B6C4';

          const background =
            botao.dataset.background ||
            '#F5F7FA';


          const inputPrimary =
            document.getElementById(
              'config-cor-principal'
            );

          const textPrimary =
            document.getElementById(
              'config-cor-principal-text'
            );


          const inputAccent =
            document.getElementById(
              'config-cor-destaque'
            );

          const textAccent =
            document.getElementById(
              'config-cor-destaque-text'
            );


          const inputBackground =
            document.getElementById(
              'config-cor-fundo'
            );

          const textBackground =
            document.getElementById(
              'config-cor-fundo-text'
            );


          if (inputPrimary) {
            inputPrimary.value =
              primary;
          }

          if (textPrimary) {
            textPrimary.value =
              primary.toUpperCase();
          }


          if (inputAccent) {
            inputAccent.value =
              accent;
          }

          if (textAccent) {
            textAccent.value =
              accent.toUpperCase();
          }


          if (inputBackground) {
            inputBackground.value =
              background;
          }

          if (textBackground) {
            textBackground.value =
              background.toUpperCase();
          }


          atualizarPreviewTema();
        }
      );
    });


  // ============================================================
  // SALVAR APARÊNCIA
  // ============================================================

  if (btnSalvarTema) {

    btnSalvarTema.addEventListener(
      'click',
      async () => {

        try {

          alterarEstadoBotao(
            btnSalvarTema,
            true,
            'Salvar aparência'
          );


          const corPrimaria =
            obterValor(
              'config-cor-principal'
            );

          const corDestaque =
            obterValor(
              'config-cor-destaque'
            );

          const corFundo =
            obterValor(
              'config-cor-fundo'
            );


          const dados = {

            cor_primaria:
              corPrimaria,

            cor_destaque:
              corDestaque,

            cor_fundo:
              corFundo
          };


          const resultado =
            await salvarConfiguracoes(
              dados
            );


          aplicarTema(
            corPrimaria,
            corDestaque,
            corFundo
          );


          atualizarEmpresaLocal(
            resultado
          );


          mostrarMensagem(
            'config-aparencia-message',
            'Aparência salva com sucesso.',
            true
          );


        } catch (erro) {

          console.error(
            'Erro ao salvar aparência:',
            erro
          );


          mostrarMensagem(
            'config-aparencia-message',
            erro.message ||
            'Não foi possível salvar a aparência.'
          );


        } finally {

          alterarEstadoBotao(
            btnSalvarTema,
            false,
            'Salvar aparência'
          );
        }
      }
    );
  }


  // ============================================================
  // APLICAR TEMA
  // ============================================================

  function aplicarTema(
    primary,
    accent,
    background
  ) {

    primary =
      primary ||
      '#0E3A4C';

    accent =
      accent ||
      '#06B6C4';

    background =
      background ||
      '#F5F7FA';


    document.documentElement.style.setProperty(
      '--primary',
      primary
    );

    document.documentElement.style.setProperty(
      '--primary-color',
      primary
    );

    document.documentElement.style.setProperty(
      '--accent',
      accent
    );

    document.documentElement.style.setProperty(
      '--accent-color',
      accent
    );

    document.documentElement.style.setProperty(
      '--bg',
      background
    );

    document.documentElement.style.setProperty(
      '--background',
      background
    );


    atualizarPreviewTema();
  }


  // ============================================================
  // RESTAURAR TEMA
  // ============================================================

  if (btnRestaurarTema) {

    btnRestaurarTema.addEventListener(
      'click',
      () => {

        const primary =
          '#0E3A4C';

        const accent =
          '#06B6C4';

        const background =
          '#F5F7FA';


        const inputPrimary =
          document.getElementById(
            'config-cor-principal'
          );

        const textPrimary =
          document.getElementById(
            'config-cor-principal-text'
          );


        const inputAccent =
          document.getElementById(
            'config-cor-destaque'
          );

        const textAccent =
          document.getElementById(
            'config-cor-destaque-text'
          );


        const inputBackground =
          document.getElementById(
            'config-cor-fundo'
          );

        const textBackground =
          document.getElementById(
            'config-cor-fundo-text'
          );


        if (inputPrimary) {
          inputPrimary.value =
            primary;
        }

        if (textPrimary) {
          textPrimary.value =
            primary;
        }


        if (inputAccent) {
          inputAccent.value =
            accent;
        }

        if (textAccent) {
          textAccent.value =
            accent;
        }


        if (inputBackground) {
          inputBackground.value =
            background;
        }

        if (textBackground) {
          textBackground.value =
            background;
        }


        aplicarTema(
          primary,
          accent,
          background
        );
      }
    );
  }


  // ============================================================
  // DOCUMENTOS
  // ============================================================

  if (btnSalvarDocumentos) {

    btnSalvarDocumentos.addEventListener(
      'click',
      async () => {

        try {

          alterarEstadoBotao(
            btnSalvarDocumentos,
            true,
            'Salvar documentos'
          );


          const dados = {

            rodape_documentos:
              obterValor(
                'config-rodape-documentos'
              ) || null,

            telefone_documentos:
              obterBooleano(
                'config-telefone-documentos'
              )
          };


          console.log(
            '[Orvix] Documentos:',
            dados
          );


          const resultado =
            await salvarConfiguracoes(
              dados
            );


          atualizarEmpresaLocal(
            resultado
          );


          mostrarMensagem(
            'configuracoes-message',
            'Configurações de documentos salvas com sucesso.',
            true
          );


        } catch (erro) {

          console.error(
            'Erro ao salvar documentos:',
            erro
          );


          mostrarMensagem(
            'configuracoes-message',
            erro.message ||
            'Não foi possível salvar os documentos.'
          );


        } finally {

          alterarEstadoBotao(
            btnSalvarDocumentos,
            false,
            'Salvar documentos'
          );
        }
      }
    );
  }


// ============================================================
// AGENDA
// ============================================================

if (btnSalvarAgenda) {

  btnSalvarAgenda.addEventListener(
    'click',
    async () => {

      try {

        alterarEstadoBotao(
          btnSalvarAgenda,
          true,
          'Salvando...'
        );

        // --------------------------------------------------------
        // HORÁRIO INICIAL
        // --------------------------------------------------------

        const campoInicio =
          document.getElementById(
            'config-agenda-inicio'
          );

        const campoFim =
          document.getElementById(
            'config-agenda-fim'
          );

        const campoIntervalo =
          document.getElementById(
            'config-agenda-intervalo'
          );


        if (!campoInicio) {
          throw new Error(
            'Campo de horário inicial da agenda não encontrado.'
          );
        }

        if (!campoFim) {
          throw new Error(
            'Campo de horário final da agenda não encontrado.'
          );
        }

        if (!campoIntervalo) {
          throw new Error(
            'Campo de intervalo da agenda não encontrado.'
          );
        }


        // --------------------------------------------------------
        // NORMALIZA HORÁRIO
        // --------------------------------------------------------
        //
        // Aceita:
        // 09:00
        // 09:00:00
        //
        // E sempre envia:
        // 09:00
        //
        // --------------------------------------------------------

        function normalizarHorario(valor) {

          if (
            valor === null ||
            valor === undefined
          ) {
            return null;
          }

          let horario =
            String(valor).trim();


          if (!horario) {
            return null;
          }


          // Caso venha como HH:MM:SS
          const match =
            horario.match(
              /^(\d{2}):(\d{2})(?::\d{2})?$/
            );


          if (!match) {

            throw new Error(
              `Horário inválido: "${horario}". Use o formato HH:MM.`
            );
          }


          const horas =
            Number(match[1]);

          const minutos =
            Number(match[2]);


          if (
            horas < 0 ||
            horas > 23 ||
            minutos < 0 ||
            minutos > 59
          ) {

            throw new Error(
              `Horário inválido: "${horario}".`
            );
          }


          return (
            String(horas).padStart(2, '0') +
            ':' +
            String(minutos).padStart(2, '0')
          );
        }


        const inicio =
          normalizarHorario(
            campoInicio.value
          );


        const fim =
          normalizarHorario(
            campoFim.value
          );


        // --------------------------------------------------------
        // INTERVALO
        // --------------------------------------------------------

        let intervaloTexto =
          String(
            campoIntervalo.value ?? ''
          ).trim();


        /*
         * Permite tanto:
         *
         * 15
         * 30
         * 45
         * 60
         *
         * quanto valores como:
         *
         * "15 minutos"
         */

        const intervaloMatch =
          intervaloTexto.match(/\d+/);


        if (!intervaloMatch) {

          throw new Error(
            'Intervalo da agenda inválido.'
          );
        }


        const intervalo =
          Number(
            intervaloMatch[0]
          );


        const intervalosValidos = [
          15,
          30,
          45,
          60,
          90,
          120
        ];


        if (
          !intervalosValidos.includes(
            intervalo
          )
        ) {

          throw new Error(
            'Intervalo inválido. Escolha 15, 30, 45, 60, 90 ou 120 minutos.'
          );
        }


        // --------------------------------------------------------
        // VALIDAÇÃO DOS HORÁRIOS
        // --------------------------------------------------------

        if (!inicio) {

          throw new Error(
            'Informe o horário inicial da agenda.'
          );
        }


        if (!fim) {

          throw new Error(
            'Informe o horário final da agenda.'
          );
        }


        // --------------------------------------------------------
        // VALIDAÇÃO DA ORDEM DOS HORÁRIOS
        // --------------------------------------------------------

        const inicioMinutos =
          (
            Number(inicio.substring(0, 2)) * 60
          ) +
          Number(inicio.substring(3, 5));


        const fimMinutos =
          (
            Number(fim.substring(0, 2)) * 60
          ) +
          Number(fim.substring(3, 5));


        if (
          fimMinutos <= inicioMinutos
        ) {

          throw new Error(
            'O horário final deve ser maior que o horário inicial.'
          );
        }


        // --------------------------------------------------------
        // PAYLOAD
        // --------------------------------------------------------

        const dados = {

          agenda_horario_inicio:
            inicio,

          agenda_horario_fim:
            fim,

          agenda_intervalo:
            intervalo
        };


        console.log(
          '[Orvix] Agenda:',
          dados
        );


        // --------------------------------------------------------
        // SALVA
        // --------------------------------------------------------

        const resultado =
          await salvarConfiguracoes(
            dados
          );


        // --------------------------------------------------------
        // ATUALIZA ESTADO LOCAL
        // --------------------------------------------------------

        atualizarEmpresaLocal(
          resultado
        );


        // --------------------------------------------------------
        // MENSAGEM
        // --------------------------------------------------------

        mostrarMensagem(
          'configuracoes-message',
          'Configurações da agenda salvas com sucesso.',
          true
        );


      } catch (erro) {

        console.error(
          '[Orvix] Erro ao salvar agenda:',
          erro
        );


        mostrarMensagem(
          'configuracoes-message',
          erro.message ||
          'Não foi possível salvar a agenda.'
        );


      } finally {

        alterarEstadoBotao(
          btnSalvarAgenda,
          false,
          'Salvar agenda'
        );

      }

    }
  );
}


  // ============================================================
  // EXPÕE FUNÇÕES
  // ============================================================

  window.OrvixConfiguracoes = {

    salvarConfiguracoes,

    aplicarTema,

    atualizarPreviewTema,

    salvarPreferenciasRegionais
  };

})();