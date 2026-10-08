// ============================================================
// REDIRECIONA PARA /429.html EM QUALQUER LIMITE DE REQUISIÇÕES
// ============================================================

(function(){

  const fetchOriginal = window.fetch;

  window.fetch = async function(...args){

    const resposta = await fetchOriginal.apply(this, args);

    if(resposta.status === 429){

      const url = String(
        typeof args[0] === 'string'
          ? args[0]
          : (args[0] && args[0].url) || ''
      );

      const jaEstaNaPagina =
        window.location.pathname.endsWith('/429.html');

      if(url.includes('/api/') && !jaEstaNaPagina){

        let destino = '/429.html';

        try{

          const dados = await resposta.clone().json();

          if(dados && dados.redirecionar){
            destino = dados.redirecionar;
          }

        }catch(e){}

        // Só aceita caminhos do próprio site
        if(
          !destino.startsWith('/') ||
          destino.startsWith('//')
        ){
          destino = '/429.html';
        }

        window.location.replace(destino);
      }
    }

    return resposta;
  };

})();


// ============================================================
// ORVIX — APLICAÇÃO PRINCIPAL
// ============================================================

(function(){

  "use strict";

  const API = '/api';
  const AUTH_TOKEN_KEY = 'lavajato_auth_token';
  const NICHO_PADRAO = 'lavajato';

  let state = {
    services: [],
    appointments: []
  };

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
  // ESTADO GLOBAL PARA CONFIGURAÇÕES
  // ============================================================

  Object.defineProperty(window, 'empresaLogada', {
    configurable: true,

    get(){
      return empresaLogada;
    },

    set(v){
      empresaLogada = v;
    }
  });

  Object.defineProperty(window, 'usuarioLogado', {
    configurable: true,

    get(){
      return usuarioLogado;
    },

    set(v){
      usuarioLogado = v;
    }
  });


  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  function toLocalISO(d){

    const local =
      new Date(
        d.getTime() -
        d.getTimezoneOffset() * 60000
      );

    return local.toISOString().slice(0,10);
  }


  function todayISO(){

    return toLocalISO(
      new Date()
    );
  }


  function money(n){

    return 'R$ ' +
      (Number(n) || 0).toLocaleString(
        'pt-BR',
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );
  }


  function fmtDatePretty(iso){

    const [y,m,d] = iso.split('-');

    const date =
      new Date(
        Number(y),
        Number(m) - 1,
        Number(d)
      );

    return date.toLocaleDateString(
      'pt-BR',
      {
        weekday:'long',
        day:'numeric',
        month:'long'
      }
    );
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


  function $(id){

    return document.getElementById(id);
  }


  function isAdministrador(){

    return (
      usuarioLogado &&
      usuarioLogado.perfil === 'administrador'
    );
  }


  function mesmoId(a,b){

    return String(a) === String(b);
  }


  // ============================================================
  // NICHOS
  // ============================================================

  const NICHOS = {

    lavajato: {
      nome: 'Lava-jato / Estética automotiva',
      cliente: 'Cliente',
      servico: 'Serviço',
      servicos: 'Serviços',
      novoServico: 'Novo serviço',
      extra1: {
        label:'Placa',
        placeholder:'ABC1D23',
        upper:true
      },
      extra2: {
        label:'Veículo',
        placeholder:'Modelo / cor'
      }
    },

    barbearia: {
      nome: 'Barbearia / Salão de beleza',
      cliente: 'Cliente',
      servico: 'Serviço',
      servicos: 'Serviços',
      novoServico: 'Novo serviço',
      extra1: {
        label:'Profissional',
        placeholder:'Quem vai atender'
      },
      extra2:null
    },

    clinica: {
      nome: 'Clínica / Consultório',
      cliente: 'Paciente',
      servico: 'Procedimento',
      servicos: 'Procedimentos',
      novoServico: 'Novo procedimento',
      extra1: {
        label:'Convênio',
        placeholder:'Particular, Unimed...'
      },
      extra2: {
        label:'Profissional',
        placeholder:'Médico / dentista'
      }
    },

    pet: {
      nome:'Pet shop / Veterinária',
      cliente:'Tutor',
      servico:'Serviço',
      servicos:'Serviços',
      novoServico:'Novo serviço',
      extra1:{
        label:'Nome do pet',
        placeholder:'Ex: Thor'
      },
      extra2:{
        label:'Raça / porte',
        placeholder:'Ex: Golden, grande'
      }
    },

    oficina: {
      nome:'Oficina mecânica',
      cliente:'Cliente',
      servico:'Serviço',
      servicos:'Serviços',
      novoServico:'Novo serviço',
      extra1:{
        label:'Placa',
        placeholder:'ABC1D23',
        upper:true
      },
      extra2:{
        label:'Veículo',
        placeholder:'Modelo / ano'
      }
    },

    personal: {
      nome:'Personal / Aulas / Consultoria',
      cliente:'Aluno / Cliente',
      servico:'Aula / Sessão',
      servicos:'Aulas e sessões',
      novoServico:'Nova aula / sessão',
      extra1:null,
      extra2:null
    },

    generico: {
      nome:'Outro',
      cliente:'Cliente',
      servico:'Serviço',
      servicos:'Serviços',
      novoServico:'Novo serviço',
      extra1:null,
      extra2:null
    }

  };


  function normalizarNicho(valor){

    const chave =
      String(valor || '')
        .trim()
        .toLowerCase();

    return NICHOS[chave]
      ? chave
      : NICHO_PADRAO;
  }


  function getNicho(){

    const chave =
      empresaLogada?.nicho ||
      window.nichoAtual ||
      NICHO_PADRAO;

    return (
      NICHOS[
        normalizarNicho(chave)
      ] ||
      NICHOS[NICHO_PADRAO]
    );
  }


  function aplicarNicho(chave){

    if(!chave){

      chave =
        window.nichoAtual ||
        empresaLogada?.nicho ||
        NICHO_PADRAO;
    }

    const chaveValida =
      NICHOS[chave]
        ? chave
        : NICHO_PADRAO;

    const n = NICHOS[chaveValida];

    window.nichoAtual = chaveValida;

    if(empresaLogada){
      empresaLogada.nicho = chaveValida;
    }

    const lblServico =
      $('ap-service-label');

    if(lblServico){
      lblServico.textContent = n.servico;
    }

    const lblCliente =
      $('ap-client-label');

    if(lblCliente){
      lblCliente.textContent = n.cliente;
    }

    [
      ['extra1','ap-plate'],
      ['extra2','ap-vehicle']
    ].forEach(
      ([chaveExtra,inputId]) => {

        const cfg = n[chaveExtra];

        const campo =
          $(`ap-${chaveExtra}-field`);

        const input =
          $(inputId);

        const label =
          $(`ap-${chaveExtra}-label`);

        if(!campo || !input){
          return;
        }

        if(cfg){

          campo.style.display = '';

          if(label){
            label.textContent = cfg.label;
          }

          input.placeholder =
            cfg.placeholder;

          if(
            cfg.upper &&
            input.dataset.upperListener !== 'true'
          ){

            input.dataset.upperListener =
              'true';

            input.addEventListener(
              'input',
              () => {
                input.value =
                  input.value.toUpperCase();
              }
            );
          }

        }else{

          campo.style.display = 'none';
          input.value = '';
        }

      }
    );

    const navServicos =
      document.querySelector(
        '[data-tab="servicos"] .nav-text'
      );

    if(navServicos){
      navServicos.textContent =
        n.servicos;
    }

    const h1Servicos =
      document.querySelector(
        '#panel-servicos h1'
      );

    if(h1Servicos){
      h1Servicos.textContent =
        n.servicos;
    }

    const btnNovoServico =
      $('btn-new-service');

    if(btnNovoServico){
      btnNovoServico.textContent =
        n.novoServico;
    }

    const buscaCli =
      $('cli-search-input');

    if(buscaCli){

      buscaCli.placeholder =
        n.extra1
          ? 'Nome, telefone ou ' +
            n.extra1.label.toLowerCase() +
            '...'
          : 'Nome ou telefone...';
    }

    const selConfig =
      $('config-empresa-nicho');

    if(selConfig){
      selConfig.value =
        chaveValida;
    }
  }


  function formatExtra(valor,cfg){

    const v =
      String(valor || '');

    return cfg && cfg.upper
      ? v.toUpperCase()
      : v;
  }


  function detalhesHtml(ap){

    const n = getNicho();

    let html = '';

    if(ap?.veiculo){

      html +=
        '<span title="' +
        escapeHtml(
          n.extra2
            ? n.extra2.label
            : 'Detalhe'
        ) +
        '">' +
        escapeHtml(ap.veiculo) +
        '</span>';
    }

    if(ap?.placa){

      html +=
        '<span title="' +
        escapeHtml(
          n.extra1
            ? n.extra1.label
            : 'Detalhe'
        ) +
        '">' +
        escapeHtml(
          formatExtra(
            ap.placa,
            n.extra1
          )
        ) +
        '</span>';
    }

    if(ap?.observacoes){

      html +=
        '<span title="Observações">' +
        escapeHtml(ap.observacoes) +
        '</span>';
    }

    return html;
  }


  // ============================================================
  // PRIVACIDADE
  // ============================================================

  function abrirPrivacidade(){

    if(
      usuarioLogado &&
      usuarioLogado.perfil === 'administrador'
    ){

      window.location.href =
        '/empresa/privacidade.html';

      return;
    }

    window.location.href =
      '/privacidade.html';
  }

  window.abrirPrivacidade =
    abrirPrivacidade;


  const btnPrivacidade =
    $('btn-privacidade');

  if(btnPrivacidade){

    btnPrivacidade.addEventListener(
      'click',
      function(event){

        event.preventDefault();
        event.stopPropagation();

        abrirPrivacidade();
      }
    );
  }


  // ============================================================
  // PERMISSÕES
  // ============================================================

  const PERMISSOES_DISPONIVEIS = [

    {
      chave:'agenda',
      label:'Agenda'
    },

    {
      chave:'faturamento',
      label:'Faturamento'
    },

    {
      chave:'financeiro',
      label:'Financeiro'
    },

    {
      chave:'servicos',
      label:'Serviços'
    },

    {
      chave:'clientes',
      label:'Clientes'
    },

    {
      chave:'despesas',
      label:'Despesas'
    }

  ];


  function temPermissao(chave){

    if(!usuarioLogado){
      return false;
    }

    if(
      usuarioLogado.perfil ===
      'administrador'
    ){
      return true;
    }

    const permissoes =
      Array.isArray(
        usuarioLogado.permissoes
      )
        ? usuarioLogado.permissoes
        : [];

    return permissoes.includes(chave);
  }


  // ============================================================
  // API
  // ============================================================

  async function api(path,options = {}){

    const token =
      localStorage.getItem(
        AUTH_TOKEN_KEY
      );

    const headers =
      Object.assign(
        {
          'Content-Type':
            'application/json'
        },
        options.headers || {}
      );

    if(token){

      headers.Authorization =
        `Bearer ${token}`;
    }

    const requestOptions =
      Object.assign(
        {},
        options,
        { headers }
      );

    const res =
      await fetch(
        API + path,
        requestOptions
      );

    if(res.status === 401){

      if(
        path !== '/auth/login' &&
        path !== '/auth/cadastro'
      ){

        localStorage.removeItem(
          AUTH_TOKEN_KEY
        );

        usuarioLogado = null;
        empresaLogada = null;

        showAuthScreen();

        const erroSessao =
          new Error(
            'Sessão expirada. Faça login novamente.'
          );

        erroSessao.status = 401;

        throw erroSessao;
      }
    }

    if(!res.ok){

      let msg =
        'Erro na requisição';

      let codigo = null;

      try{

        const j =
          await res.json();

        msg =
          j.erro || msg;

        codigo =
          j.codigo || null;

      }catch(e){}

      const erro =
        new Error(msg);

      erro.status =
        res.status;

      erro.codigo =
        codigo;

      throw erro;
    }

    if(res.status === 204){
      return null;
    }

    return res.json();
  }


  // ============================================================
  // AUTENTICAÇÃO
  // ============================================================

  const authScreen =
    $('auth-screen');

  const loginForm =
    $('login-form');

  const registerForm =
    $('register-form');

  const loginError =
    $('login-error');

  const registerError =
    $('register-error');

  const loginSubmit =
    $('login-submit');

  const registerSubmit =
    $('register-submit');

  const showRegisterBtn =
    $('show-register');

  const showLoginBtn =
    $('show-login');


  function showAuthScreen(){

    if(!authScreen){
      return;
    }

    authScreen.style.display =
      'flex';
  }


  function hideAuthScreen(){

    if(!authScreen){
      return;
    }

    authScreen.style.display =
      'none';
  }


  function showAuthError(
    element,
    message
  ){

    if(!element){
      return;
    }

    element.textContent =
      message;

    element.style.display =
      'block';
  }


  function clearAuthError(element){

    if(!element){
      return;
    }

    element.textContent =
      '';

    element.style.display =
      'none';
  }


  function ehRateLimit(error){

    return (
      error?.status === 429 ||
      error?.statusCode === 429 ||
      error?.response?.status === 429 ||
      error?.codigo ===
        'RATE_LIMIT_AUTENTICACAO'
    );
  }


  // ============================================================
  // SIDEBAR DO USUÁRIO
  // ============================================================

  function atualizarSidebarUsuario(){

    const nomeEl =
      $('sidebar-user-name');

    const perfilEl =
      $('sidebar-user-role');

    const avatarEl =
      $('sidebar-user-avatar');

    const empresaEl =
      $('sidebar-company');

    if(usuarioLogado){

      if(nomeEl){

        nomeEl.textContent =
          usuarioLogado.nome ||
          'Usuário';
      }

      if(perfilEl){

        perfilEl.textContent =
          usuarioLogado.perfil ===
          'administrador'
            ? 'Administrador'
            : 'Funcionário';
      }

      if(avatarEl){

        avatarEl.textContent =
          (
            usuarioLogado.nome ||
            'U'
          )
            .charAt(0)
            .toUpperCase();
      }
    }

    if(
      empresaEl &&
      empresaLogada
    ){

      empresaEl.textContent =
        empresaLogada.nome_exibicao ||
        empresaLogada.nome ||
        'Empresa';
    }

    atualizarAcessoUsuarios();

    try{

      aplicarNicho(
        empresaLogada?.nicho
      );

    }catch(e){

      console.warn(
        'Não foi possível aplicar o nicho:',
        e
      );
    }
  }


  // ============================================================
  // ACESSO A USUÁRIOS E LOGS
  // ============================================================

  function atualizarAcessoUsuarios(){

    const btn =
      $('nav-usuarios');

    if(btn){

      if(isAdministrador()){

        btn.style.display =
          '';

      }else{

        btn.style.display =
          'none';

        if(
          activeTab ===
          'usuarios'
        ){

          goToTab('agenda');
        }
      }
    }


    // ----------------------------------------------------------
    // LOGS
    // ----------------------------------------------------------

    const btnLogs =
      $('nav-logs');

    if(btnLogs){

      if(isAdministrador()){

        btnLogs.style.display =
          '';

      }else{

        btnLogs.style.display =
          'none';

        if(
          activeTab === 'logs'
        ){

          goToTab('agenda');
        }
      }
    }


    // ----------------------------------------------------------
    // OUTROS MÓDULOS
    // ----------------------------------------------------------

    document
      .querySelectorAll(
        '.nav-btn, .bn-btn'
      )
      .forEach(navBtn => {

        const tab =
          navBtn.dataset.tab;

        if(
          !tab ||
          tab === 'usuarios' ||
          tab === 'logs'
        ){
          return;
        }

        navBtn.style.display =
          temPermissao(tab)
            ? ''
            : 'none';
      });


    if(
      activeTab !== 'usuarios' &&
      activeTab !== 'logs' &&
      !temPermissao(activeTab)
    ){

      const proxima =
        PERMISSOES_DISPONIVEIS.find(
          p =>
            temPermissao(p.chave)
        );

      goToTab(
        proxima
          ? proxima.chave
          : 'agenda'
      );
    }
  }


  // ============================================================
  // MOSTRAR CADASTRO / LOGIN
  // ============================================================

  showRegisterBtn?.addEventListener(
    'click',
    () => {

      if(loginForm){
        loginForm.style.display =
          'none';
      }

      if(registerForm){
        registerForm.style.display =
          'flex';
      }

      clearAuthError(loginError);
      clearAuthError(registerError);

      const subtitle =
        $('auth-subtitle');

      if(subtitle){

        subtitle.textContent =
          'Crie sua conta e sua empresa para começar a usar o sistema';
      }
    }
  );


  showLoginBtn?.addEventListener(
    'click',
    () => {

      if(registerForm){
        registerForm.style.display =
          'none';
      }

      if(loginForm){
        loginForm.style.display =
          'flex';
      }

      clearAuthError(loginError);
      clearAuthError(registerError);

      const subtitle =
        $('auth-subtitle');

      if(subtitle){

        subtitle.textContent =
          'Entre na sua conta para continuar';
      }
    }
  );


  // ============================================================
  // LOGIN
  // ============================================================

  loginForm?.addEventListener(
    'submit',
    async event => {

      event.preventDefault();

      clearAuthError(loginError);

      if(loginSubmit){

        loginSubmit.disabled =
          true;

        loginSubmit.textContent =
          'Entrando...';
      }

      const email =
        $('login-email')?.value.trim();

      const senha =
        $('login-password')?.value;

      try{

        const resposta =
          await api(
            '/auth/login',
            {
              method:'POST',

              body:JSON.stringify({
                email,
                senha
              })
            }
          );

        localStorage.setItem(
          AUTH_TOKEN_KEY,
          resposta.token
        );

        usuarioLogado =
          resposta.usuario || null;

        empresaLogada =
          resposta.empresa || null;

        if(
          usuarioLogado?.perfil ===
          'dev'
        ){

          window.location.href =
            '/admin/dashboard.html';

          return;
        }

        atualizarSidebarUsuario();

        hideAuthScreen();

        await iniciarSistema();

      }catch(error){

        if(ehRateLimit(error)){

          window.location.replace(
            '/429.html'
          );

          return;
        }

        showAuthError(
          loginError,
          error.message ||
            'Não foi possível realizar o login.'
        );

      }finally{

        if(loginSubmit){

          loginSubmit.disabled =
            false;

          loginSubmit.textContent =
            'Entrar';
        }
      }
    }
  );


  // ============================================================
  // CADASTRO
  // ============================================================

  registerForm?.addEventListener(
    'submit',
    async event => {

      event.preventDefault();

      clearAuthError(
        registerError
      );

      if(registerSubmit){

        registerSubmit.disabled =
          true;

        registerSubmit.textContent =
          'Criando conta...';
      }

      const empresa =
        $('register-company')
          ?.value.trim();

      const email_empresa =
        $('register-company-email')
          ?.value.trim();

      const telefone =
        $('register-phone')
          ?.value.trim();

      const nicho =
        $('register-nicho')
          ?.value ||
        NICHO_PADRAO;

      const nome =
        $('register-name')
          ?.value.trim();

      const email =
        $('register-email')
          ?.value.trim();

      const senha =
        $('register-password')
          ?.value;

      try{

        const resposta =
          await api(
            '/auth/cadastro',
            {
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
            }
          );

        localStorage.setItem(
          AUTH_TOKEN_KEY,
          resposta.token
        );

        usuarioLogado =
          resposta.usuario || null;

        empresaLogada =
          resposta.empresa || null;

        atualizarSidebarUsuario();

        hideAuthScreen();

        await iniciarSistema();

      }catch(error){

        if(ehRateLimit(error)){

          window.location.replace(
            '/429.html'
          );

          return;
        }

        showAuthError(
          registerError,
          error.message ||
            'Não foi possível criar a conta.'
        );

      }finally{

        if(registerSubmit){

          registerSubmit.disabled =
            false;

          registerSubmit.textContent =
            'Criar conta';
        }
      }
    }
  );


  // ============================================================
  // VERIFICAR SESSÃO
  // ============================================================

  async function verificarSessao(){

    const token =
      localStorage.getItem(
        AUTH_TOKEN_KEY
      );

    if(!token){

      usuarioLogado =
        null;

      empresaLogada =
        null;

      atualizarAcessoUsuarios();

      showAuthScreen();

      return false;
    }

    try{

      const resposta =
        await api('/auth/me');

      usuarioLogado =
        resposta.usuario || null;

      empresaLogada =
        resposta.empresa || null;

      if(
        usuarioLogado?.perfil ===
        'dev'
      ){

        window.location.href =
          '/admin/dashboard.html';

        return false;
      }

      atualizarSidebarUsuario();

      hideAuthScreen();

      return true;

    }catch(error){

      if(
        error?.status === 401 ||
        error?.status === 403
      ){

        localStorage.removeItem(
          AUTH_TOKEN_KEY
        );
      }

      usuarioLogado =
        null;

      empresaLogada =
        null;

      atualizarAcessoUsuarios();

      showAuthScreen();

      return false;
    }
  }


  // ============================================================
  // CONEXÃO
  // ============================================================

  async function checkConnection(){

    const badge =
      $('conn-badge');

    if(!badge){
      return;
    }

    try{

      await api('/status');

      badge.textContent =
        'conectado';

      badge.className =
        'ok';

    }catch(e){

      badge.textContent =
        'sem conexão';

      badge.className =
        'fail';
    }
  }


  // ============================================================
  // TAB SWITCHING
  // ============================================================

  function goToTab(tab){

    // Usuários e Logs somente administrador
    if(
      (
        tab === 'usuarios' ||
        tab === 'logs'
      ) &&
      !isAdministrador()
    ){
      return;
    }

    // Demais módulos dependem de permissão
    if(
      tab !== 'usuarios' &&
      tab !== 'logs' &&
      !temPermissao(tab)
    ){
      return;
    }

    activeTab =
      tab;

    document
      .querySelectorAll('.nav-btn')
      .forEach(
        b =>
          b.classList.toggle(
            'active',
            b.dataset.tab === tab
          )
      );

    document
      .querySelectorAll('.bn-btn')
      .forEach(
        b =>
          b.classList.toggle(
            'active',
            b.dataset.tab === tab
          )
      );

    document
      .querySelectorAll('.panel')
      .forEach(
        p =>
          p.classList.remove(
            'active'
          )
      );

    const panel =
      $('panel-' + tab);

    if(panel){

      panel.classList.add(
        'active'
      );
    }

    loadTabData(tab);
  }


  document
    .querySelectorAll(
      '.nav-btn, .bn-btn'
    )
    .forEach(btn => {

      btn.addEventListener(
        'click',
        () => {

          if(btn.dataset.tab){

            goToTab(
              btn.dataset.tab
            );
          }
        }
      );
    });


  // ============================================================
  // CARREGAMENTO DAS ABAS
  // ============================================================

  async function loadTabData(tab){
    console.log('>>> LOAD TAB:', tab);

    if (tab === 'dashboard') {
      carregarDashboard();
    }

    if(tab === 'agenda'){
      await refreshAgenda();
    }

    if(tab === 'faturamento'){
      await refreshFaturamento();
    }

    if(tab === 'financeiro'){
      await refreshFinanceiro();
    }

    if(tab === 'servicos'){
      await refreshServicos();
    }

    if(tab === 'clientes'){

      $('cli-search-input')
        ?.focus();
    }

    if(tab === 'despesas'){
      await refreshDespesas();
    }

    if(tab === 'usuarios'){

      if(isAdministrador()){
        await refreshUsuarios();
      }
    }

    if(tab === 'configuracoes'){

      try{

        await window
          .OrvixConfiguracoes
          ?.carregarConfiguracoes
          ?.();

      }catch(e){

        console.warn(
          'Não foi possível carregar configurações:',
          e
        );
      }
    }

    // ==========================================================
    // LOGS
    // ==========================================================

    if(tab === 'logs'){

      if(isAdministrador()){

        await carregarLogs();

      }
    }

    if (tab === 'relatorios') {
  carregarRelatorios();
}

  }



  // ============================================================
  // SERVIÇOS — CARGA
  // ============================================================

  async function loadServices(){

    state.services =
      await api('/servicos');
  }


  function serviceName(id){

    const s =
      state.services.find(
        x =>
          mesmoId(
            x.id,
            id
          )
      );

    return s
      ? s.nome
      : getNicho().servico +
        ' removido';
  }


  // ============================================================
  // AGENDA
  // ============================================================

  const dateInput =
    $('agenda-date-input');

  if(dateInput){

    dateInput.value =
      selectedDate;

    dateInput.addEventListener(
      'change',
      () => {

        selectedDate =
          dateInput.value ||
          todayISO();

        refreshAgenda();
      }
    );
  }


  $('btn-today')?.addEventListener(
    'click',
    () => {

      selectedDate =
        todayISO();

      if(dateInput){
        dateInput.value =
          selectedDate;
      }

      refreshAgenda();
    }
  );


  async function refreshAgenda(){

    const label =
      $('agenda-date-label');

    if(label){

      label.textContent =
        capitalize(
          fmtDatePretty(
            selectedDate
          )
        );
    }

    const list =
      $('agenda-list');

    if(!list){
      return;
    }

    list.innerHTML =
      '<div class="empty">Carregando…</div>';

    try{

      const items =
        await api(
          '/agendamentos?data=' +
          selectedDate
        );

      currentAgendaItems =
        items;

      renderAgendaList(
        items
      );

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

    const list =
      $('agenda-list');

    if(!list){
      return;
    }

    items =
      items
        .slice()
        .sort(
          (a,b) =>
            a.hora.localeCompare(
              b.hora
            )
        );

    if(items.length === 0){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Nenhum agendamento nesta data</strong>' +
          'Toque em "Novo agendamento" para adicionar o primeiro item do dia.' +
        '</div>';

    }else{

      list.innerHTML =
        items
          .map(ap => {

            const [h,m] =
              ap.hora
                .slice(0,5)
                .split(':');

            let actions =
              `<button class="btn btn-small btn-ghost" onclick="App.openEditAppointment('${ap.id}')">Editar</button>`;

            if(ap.status === 'agendado'){

              actions +=
                `<button class="btn btn-small btn-accent" onclick="App.setStatus('${ap.id}','em_andamento')">Iniciar</button>`;

              actions +=
                `<button class="btn btn-small btn-ghost" onclick="App.setStatus('${ap.id}','cancelado')">Cancelar</button>`;

            }else if(
              ap.status ===
              'em_andamento'
            ){

              actions +=
                `<button class="btn btn-small btn-primary" onclick="App.setStatus('${ap.id}','concluido')">Concluir</button>`;

              actions +=
                `<button class="btn btn-small btn-ghost" onclick="App.setStatus('${ap.id}','cancelado')">Cancelar</button>`;

            }else if(
              ap.status ===
              'cancelado'
            ){

              actions +=
                `<button class="btn btn-small btn-ghost" onclick="App.deleteAppointment('${ap.id}')">Remover</button>`;

            }else if(
              ap.status ===
              'concluido'
            ){

              actions +=
                `<span class="badge badge-${ap.status_pagamento}">` +
                `${
                  ap.status_pagamento ===
                  'pago'
                    ? 'Pago'
                    : 'A receber'
                }` +
                `</span>`;
            }

            const statusLabel = {

              agendado:'agendado',

              em_andamento:
                'em andamento',

              concluido:
                'concluído',

              cancelado:
                'cancelado'

            }[ap.status];

            return `

              <div class="ticket status-${ap.status}">

                <div class="ticket-time">

                  ${h}:${m}

                  <small>
                    ${statusLabel}
                  </small>

                </div>

                <div class="ticket-body">

                  <div class="client">
                    ${escapeHtml(ap.cliente)}
                  </div>

                  <div class="meta">

                    <span>
                      ${
                        escapeHtml(
                          ap.servico_nome ||
                          serviceName(
                            ap.servico_id
                          )
                        )
                      }
                    </span>

                    ${detalhesHtml(ap)}

                  </div>

                </div>

                <div class="ticket-actions">

                  <span class="price-tag">
                    ${money(ap.valor)}
                  </span>

                  ${actions}

                </div>

              </div>

            `;

          })
          .join('');
    }

    const navCount =
      $('nav-count-agenda');

    if(navCount){

      navCount.textContent =
        items.filter(
          a =>
            a.status !==
            'cancelado'
        ).length || '';
    }
  }


  // ============================================================
  // NOVO AGENDAMENTO
  // ============================================================

  const overlayAppointment =
    $('overlay-appointment');


  $('btn-new-appointment')
    ?.addEventListener(
      'click',
      async () => {

        editingAppointmentId =
          null;

        $('appointment-modal-title')
          .textContent =
          'Novo agendamento';

        $('appointment-submit-btn')
          .textContent =
          'Agendar';

        $('ap-date').value =
          selectedDate;

        $('ap-time').value =
          '';

        $('ap-client').value =
          '';

        $('ap-phone').value =
          '';

        $('ap-plate').value =
          '';

        $('ap-vehicle').value =
          '';

        const notes =
          $('ap-notes');

        if(notes){
          notes.value =
            '';
        }

        if(
          state.services.length === 0
        ){

          await loadServices();
        }

        fillServiceSelect();
        updatePriceFromService();

        overlayAppointment
          ?.classList
          .add('active');

        $('ap-client')
          ?.focus();
      }
    );


  $('btn-cancel-appointment')
    ?.addEventListener(
      'click',
      () => {

        overlayAppointment
          ?.classList
          .remove('active');
      }
    );


  overlayAppointment
    ?.addEventListener(
      'click',
      e => {

        if(
          e.target ===
          overlayAppointment
        ){

          overlayAppointment
            .classList
            .remove('active');
        }
      }
    );


  async function openEditAppointment(id){

    const ap =
      currentAgendaItems.find(
        a =>
          mesmoId(
            a.id,
            id
          )
      );

    if(!ap){
      return;
    }

    editingAppointmentId =
      id;

    $('appointment-modal-title')
      .textContent =
      'Editar agendamento';

    $('appointment-submit-btn')
      .textContent =
      'Salvar alterações';

    if(
      state.services.length === 0
    ){

      await loadServices();
    }

    fillServiceSelect();

    $('ap-date').value =
      ap.data;

    $('ap-time').value =
      ap.hora.slice(0,5);

    $('ap-client').value =
      ap.cliente;

    $('ap-phone').value =
      ap.telefone || '';

    $('ap-plate').value =
      ap.placa || '';

    $('ap-vehicle').value =
      ap.veiculo || '';

    $('ap-service').value =
      ap.servico_id;

    $('ap-price').value =
      ap.valor;

    const notes =
      $('ap-notes');

    if(notes){
      notes.value =
        ap.observacoes || '';
    }

    overlayAppointment
      ?.classList
      .add('active');
  }


  function fillServiceSelect(){

    const sel =
      $('ap-service');

    if(!sel){
      return;
    }

    sel.innerHTML =
      state.services
        .map(
          s =>
            `<option value="${s.id}">` +
            `${escapeHtml(s.nome)} — ${money(s.preco)}` +
            `</option>`
        )
        .join('');
  }


  $('ap-service')
    ?.addEventListener(
      'change',
      updatePriceFromService
    );


  function updatePriceFromService(){

    const sel =
      $('ap-service');

    if(!sel){
      return;
    }

    const s =
      state.services.find(
        x =>
          mesmoId(
            x.id,
            sel.value
          )
      );

    if(s){

      const price =
        $('ap-price');

      if(price){
        price.value =
          s.preco;
      }
    }
  }


  // ============================================================
  // ESTATÍSTICAS
  // ============================================================

  async function refreshSideStats(){

    try{

      const range =
        await fetchWideRange();

      allDoneCache =
        range.filter(
          a =>
            a.status ===
            'concluido'
        );

      updateSideStats();

    }catch(e){}
  }


  // ============================================================
  // CONFLITO DE HORÁRIO
  // ============================================================

  function timeToMinutes(t){

    const [h,m] =
      t.split(':')
       .map(Number);

    return h * 60 + m;
  }


  function serviceDuration(servico_id){

    const s =
      state.services.find(
        x =>
          mesmoId(
            x.id,
            servico_id
          )
      );

    return s
      ? Number(s.duracao_min) || 30
      : 30;
  }


  async function findConflict(
    data,
    hora,
    servico_id,
    excludeId
  ){

    let items;

    try{

      items =
        await api(
          '/agendamentos?data=' +
          data
        );

    }catch(e){

      return null;
    }

    const novoInicio =
      timeToMinutes(hora);

    const novoFim =
      novoInicio +
      serviceDuration(
        servico_id
      );

    for(const ap of items){

      if(
        ap.status ===
        'cancelado'
      ){
        continue;
      }

      if(
        excludeId &&
        mesmoId(
          ap.id,
          excludeId
        )
      ){
        continue;
      }

      const inicio =
        timeToMinutes(
          ap.hora.slice(0,5)
        );

      const fim =
        inicio +
        serviceDuration(
          ap.servico_id
        );

      if(
        novoInicio < fim &&
        inicio < novoFim
      ){

        return ap;
      }
    }

    return null;
  }


  // ============================================================
  // FORMULÁRIO AGENDAMENTO
  // ============================================================

  $('form-appointment')
    ?.addEventListener(
      'submit',
      async e => {

        e.preventDefault();

        const n =
          getNicho();

        const payload = {

          data:
            $('ap-date').value,

          hora:
            $('ap-time').value,

          cliente:
            $('ap-client')
              .value.trim(),

          telefone:
            $('ap-phone')
              .value.trim(),

          placa:
            n.extra1
              ? $('ap-plate')
                  .value.trim()
              : '',

          veiculo:
            n.extra2
              ? $('ap-vehicle')
                  .value.trim()
              : '',

          observacoes:
            (
              $('ap-notes')
                ?.value || ''
            ).trim(),

          servico_id:
            $('ap-service').value,

          valor:
            parseFloat(
              $('ap-price').value
            ) || 0
        };

        const conflito =
          await findConflict(
            payload.data,
            payload.hora,
            payload.servico_id,
            editingAppointmentId
          );

        if(conflito){

          const nomeServico =
            conflito.servico_nome ||
            serviceName(
              conflito.servico_id
            );

          const seguir =
            confirm(
              `Esse horário conflita com o agendamento de ${conflito.cliente} às ${conflito.hora.slice(0,5)} (${nomeServico}).\n\nAgendar mesmo assim?`
            );

          if(!seguir){
            return;
          }
        }

        try{

          if(editingAppointmentId){

            await api(
              '/agendamentos/' +
              editingAppointmentId,
              {
                method:'PATCH',

                body:
                  JSON.stringify(
                    payload
                  )
              }
            );

          }else{

            await api(
              '/agendamentos',
              {
                method:'POST',

                body:
                  JSON.stringify(
                    payload
                  )
              }
            );
          }

          overlayAppointment
            ?.classList
            .remove('active');

          selectedDate =
            payload.data;

          if(dateInput){
            dateInput.value =
              selectedDate;
          }

          await refreshAgenda();
          await refreshSideStats();

        }catch(err){

          alert(
            'Não foi possível salvar: ' +
            err.message
          );
        }
      }
    );


  // ============================================================
  // STATUS / PAGAMENTO
  // ============================================================

  async function setStatus(
    id,
    status
  ){

    try{

      await api(
        '/agendamentos/' + id,
        {
          method:'PATCH',

          body:
            JSON.stringify({
              status
            })
        }
      );

      await refreshCurrentTab();

    }catch(e){

      alert(
        'Erro ao atualizar status: ' +
        e.message
      );
    }
  }


  async function deleteAppointment(id){

    if(
      !confirm(
        'Remover este agendamento definitivamente?'
      )
    ){
      return;
    }

    try{

      await api(
        '/agendamentos/' + id,
        {
          method:'DELETE'
        }
      );

      await refreshCurrentTab();

    }catch(e){

      alert(
        'Erro ao remover: ' +
        e.message
      );
    }
  }


  async function setPayment(
    id,
    status_pagamento
  ){

    try{

      await api(
        '/agendamentos/' + id,
        {
          method:'PATCH',

          body:
            JSON.stringify({
              status_pagamento
            })
        }
      );

      await refreshCurrentTab();

    }catch(e){

      alert(
        'Erro ao atualizar pagamento: ' +
        e.message
      );
    }
  }


  async function setPaymentMethod(
    id,
    forma_pagamento
  ){

    try{

      await api(
        '/agendamentos/' + id,
        {
          method:'PATCH',

          body:
            JSON.stringify({
              forma_pagamento
            })
        }
      );

      const item =
        allDoneCache.find(
          a =>
            mesmoId(
              a.id,
              id
            )
        );

      if(item){
        item.forma_pagamento =
          forma_pagamento;
      }

    }catch(e){

      console.error(e);
    }
  }


  async function undoPayment(id){

    if(
      !confirm(
        'Desfazer a confirmação de pagamento? Você poderá trocar a forma de pagamento novamente depois.'
      )
    ){
      return;
    }

    try{

      await api(
        '/agendamentos/' + id,
        {
          method:'PATCH',

          body:
            JSON.stringify({
              status_pagamento:
                'pendente'
            })
        }
      );

      await refreshCurrentTab();

    }catch(e){

      alert(
        'Erro ao desfazer: ' +
        e.message
      );
    }
  }


  async function refreshCurrentTab(){

    await loadTabData(
      activeTab
    );

    await refreshSideStats();
  }


  // ============================================================
  // FATURAMENTO
  // ============================================================

  async function refreshFaturamento(){

    const container =
      $('fat-list');

    if(!container){
      return;
    }

    container.innerHTML =
      '<div class="empty">Carregando…</div>';

    try{

      const range =
        await fetchWideRange();

      allDoneCache =
        range.filter(
          a =>
            a.status ===
            'concluido'
        );

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

    const done =
      allDoneCache
        .slice()
        .sort(
          (a,b) =>
            (
              b.data +
              b.hora
            ).localeCompare(
              a.data +
              a.hora
            )
        );

    const total =
      done.reduce(
        (s,a) =>
          s + Number(a.valor),
        0
      );

    const pago =
      done
        .filter(
          a =>
            a.status_pagamento ===
            'pago'
        )
        .reduce(
          (s,a) =>
            s + Number(a.valor),
          0
        );

    const pendente =
      total - pago;

    $('fat-total').textContent =
      money(total);

    $('fat-pago').textContent =
      money(pago);

    $('fat-pendente').textContent =
      money(pendente);

    const navCount =
      $('nav-count-fat');

    if(navCount){

      navCount.textContent =
        done.filter(
          a =>
            a.status_pagamento ===
            'pendente'
        ).length || '';
    }

    const list =
      $('fat-list');

    if(!list){
      return;
    }

    if(done.length === 0){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Nenhum atendimento concluído ainda</strong>' +
          'Conclua um agendamento na Agenda para ele aparecer aqui.' +
        '</div>';

      return;
    }

    const n =
      getNicho();

    list.innerHTML =
      done
        .map(ap => {

          const extras = [];

          if(ap.veiculo){
            extras.push(
              escapeHtml(
                ap.veiculo
              )
            );
          }

          if(ap.placa){

            extras.push(
              escapeHtml(
                formatExtra(
                  ap.placa,
                  n.extra1
                )
              )
            );
          }

          return `

            <div
              class="invoice-row"
            >

              <div>

                <div class="client">
                  ${escapeHtml(ap.cliente)}
                </div>

                <div class="meta">

                  ${
                    new Date(
                      ap.data +
                      'T00:00:00'
                    ).toLocaleDateString(
                      'pt-BR'
                    )
                  }

                  ·

                  ${
                    escapeHtml(
                      ap.servico_nome ||
                      serviceName(
                        ap.servico_id
                      )
                    )
                  }

                  ${
                    extras.length
                      ? ' · ' +
                        extras.join(' · ')
                      : ''
                  }

                </div>

              </div>

              <span class="price-tag">
                ${money(ap.valor)}
              </span>

              ${
                ap.status_pagamento ===
                'pago'

                  ? `<div class="pay-method-locked">
                      ${
                        ap.forma_pagamento
                          ? escapeHtml(
                              ap.forma_pagamento
                            )
                          : 'Forma não informada'
                      }
                    </div>`

                  : `<select
                      class="pay-method"
                      onchange="App.setPaymentMethod('${ap.id}', this.value)"
                    >
                      <option value="" ${
                        !ap.forma_pagamento
                          ? 'selected'
                          : ''
                      }>
                        Forma de pagamento
                      </option>

                      <option value="Dinheiro" ${
                        ap.forma_pagamento ===
                        'Dinheiro'
                          ? 'selected'
                          : ''
                      }>
                        Dinheiro
                      </option>

                      <option value="Pix" ${
                        ap.forma_pagamento ===
                        'Pix'
                          ? 'selected'
                          : ''
                      }>
                        Pix
                      </option>

                      <option value="Cartão de débito" ${
                        ap.forma_pagamento ===
                        'Cartão de débito'
                          ? 'selected'
                          : ''
                      }>
                        Cartão de débito
                      </option>

                      <option value="Cartão de crédito" ${
                        ap.forma_pagamento ===
                        'Cartão de crédito'
                          ? 'selected'
                          : ''
                      }>
                        Cartão de crédito
                      </option>

                    </select>`
              }

              <div class="ticket-actions">

                ${
                  ap.status_pagamento ===
                  'pago'

                    ? `<span
                        class="badge badge-pago"
                        title="Toque para desfazer o pagamento"
                        onclick="App.undoPayment('${ap.id}')"
                      >
                        Pago
                      </span>`

                    : `<button
                        class="btn btn-small btn-primary"
                        onclick="App.setPayment('${ap.id}','pago')"
                      >
                        Marcar pago
                      </button>`
                }

                <button
                  class="btn btn-small btn-ghost"
                  onclick="App.printReceipt('${ap.id}')"
                >
                  Recibo
                </button>

              </div>

            </div>

          `;

        })
        .join('');
  }


  function nomeEmpresaDocumento(){

    return escapeHtml(
      (
        empresaLogada &&
        (
          empresaLogada.nome_exibicao ||
          empresaLogada.nome
        )
      ) ||
      'Orvix'
    );
  }


  function printReceipt(id){

    const ap =
      allDoneCache.find(
        a =>
          mesmoId(
            a.id,
            id
          )
      );

    if(!ap){
      return;
    }

    const n =
      getNicho();

    const dataHora =
      new Date(
        ap.data +
        'T00:00:00'
      ).toLocaleDateString(
        'pt-BR'
      ) +
      ' às ' +
      ap.hora.slice(0,5);

    const linhaExtra =
      (rotulo,valor) =>
        valor
          ? `<div class="recibo-row">
              <span>${escapeHtml(rotulo)}</span>
              <span>${escapeHtml(valor)}</span>
            </div>`
          : '';

    $('print-area').innerHTML = `

      <div class="recibo-header">

        <h2>
          ${nomeEmpresaDocumento()}
          — Recibo
        </h2>

        <div>
          ${dataHora}
        </div>

      </div>

      <div class="recibo-row">

        <span>
          ${escapeHtml(n.cliente)}
        </span>

        <span>
          ${escapeHtml(ap.cliente)}
        </span>

      </div>

      ${
        linhaExtra(
          n.extra2
            ? n.extra2.label
            : 'Detalhe',
          ap.veiculo
        )
      }

      ${
        linhaExtra(
          n.extra1
            ? n.extra1.label
            : 'Detalhe',
          ap.placa
            ? formatExtra(
                ap.placa,
                n.extra1
              )
            : ''
        )
      }

      <div class="recibo-row">

        <span>
          ${escapeHtml(n.servico)}
        </span>

        <span>
          ${
            escapeHtml(
              ap.servico_nome ||
              serviceName(
                ap.servico_id
              )
            )
          }
        </span>

      </div>

      <div class="recibo-row">

        <span>
          Forma de pagamento
        </span>

        <span>
          ${
            escapeHtml(
              ap.forma_pagamento ||
              '—'
            )
          }
        </span>

      </div>

      <div class="recibo-total">

        <span>Total</span>

        <span>
          ${money(ap.valor)}
        </span>

      </div>

    `;

    window.print();
  }


  // ============================================================
  // FECHAMENTO DO DIA
  // ============================================================

  $('btn-closing')
    ?.addEventListener(
      'click',
      printClosing
    );


  async function printClosing(){

    let items;

    try{

      items =
        await api(
          '/agendamentos?data=' +
          selectedDate
        );

    }catch(e){

      alert(
        'Não foi possível carregar os dados do fechamento.'
      );

      return;
    }

    const done =
      items
        .filter(
          a =>
            a.status ===
            'concluido'
        )
        .sort(
          (a,b) =>
            a.hora.localeCompare(
              b.hora
            )
        );

    const total =
      done.reduce(
        (s,a) =>
          s + Number(a.valor),
        0
      );

    const pago =
      done
        .filter(
          a =>
            a.status_pagamento ===
            'pago'
        )
        .reduce(
          (s,a) =>
            s + Number(a.valor),
          0
        );

    const pendente =
      total - pago;

    const porForma = {};

    done
      .filter(
        a =>
          a.status_pagamento ===
          'pago'
      )
      .forEach(
        a => {

          const f =
            a.forma_pagamento ||
            'Não informado';

          porForma[f] =
            (
              porForma[f] || 0
            ) +
            Number(a.valor);
        }
      );

    const formaLinhas =
      Object.entries(
        porForma
      )
        .map(
          ([f,v]) =>
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
      done
        .map(
          a =>
            `<div class="recibo-row">
              <span>
                ${a.hora.slice(0,5)}
                —
                ${escapeHtml(a.cliente)}
                (
                  ${escapeHtml(
                    a.servico_nome ||
                    serviceName(
                      a.servico_id
                    )
                  )}
                )
              </span>

              <span>
                ${money(a.valor)}
              </span>
            </div>`
        )
        .join('') ||

      '<div class="recibo-row">' +
        '<span>Nenhum item concluído nesta data.</span>' +
        '<span></span>' +
      '</div>';

    const pendentesQtd =
      items.filter(
        a =>
          a.status === 'agendado' ||
          a.status === 'em_andamento'
      ).length;

    $('print-area').innerHTML = `

      <div class="recibo-header">

        <h2>
          ${nomeEmpresaDocumento()}
          — Fechamento do dia
        </h2>

        <div>
          ${
            capitalize(
              fmtDatePretty(
                selectedDate
              )
            )
          }
        </div>

      </div>

      <div
        class="recibo-row"
        style="font-weight:600;"
      >

        <span>
          Itens concluídos
        </span>

        <span>
          ${done.length}
        </span>

      </div>

      ${linhas}

      <div class="recibo-total">

        <span>
          Total faturado
        </span>

        <span>
          ${money(total)}
        </span>

      </div>

      <div class="recibo-row">

        <span>
          Recebido
        </span>

        <span>
          ${money(pago)}
        </span>

      </div>

      <div class="recibo-row">

        <span>
          Pendente
        </span>

        <span>
          ${money(pendente)}
        </span>

      </div>

      <h3
        style="
          margin-top:18px;
          font-size:14px;
        "
      >
        Por forma de pagamento
      </h3>

      ${formaLinhas}

      ${
        pendentesQtd > 0

          ? `<div
              class="recibo-row"
              style="margin-top:12px;"
            >
              <span>
                Ainda agendados/em andamento hoje
              </span>

              <span>
                ${pendentesQtd}
              </span>
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

      const [
        range,
        despesas
      ] =
        await Promise.all([
          fetchWideRange(),
          fetchWideRangeExpenses()
        ]);

      allDoneCache =
        range.filter(
          a =>
            a.status ===
            'concluido'
        );

      allExpensesCache =
        despesas;

      renderFinanceiro();

    }catch(e){

      const bars =
        $('fin-bars');

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

    const now =
      new Date();

    const past =
      new Date(now);

    past.setDate(
      now.getDate() - 90
    );

    return {

      de:
        toLocalISO(past),

      ate:
        toLocalISO(now)
    };
  }


  async function fetchWideRange(){

    const {
      de,
      ate
    } =
      wideRangeDates();

    return api(
      `/agendamentos?de=${de}&ate=${ate}`
    );
  }


  async function fetchWideRangeExpenses(){

    const {
      de,
      ate
    } =
      wideRangeDates();

    return api(
      `/despesas?de=${de}&ate=${ate}`
    );
  }


  function renderBars(
    containerId,
    entries,
    emptyMsg
  ){

    const el =
      $(containerId);

    if(!el){
      return;
    }

    if(entries.length === 0){

      el.innerHTML =
        '<div class="empty">' +
        emptyMsg +
        '</div>';

      return;
    }

    const maxVal =
      entries[0][1];

    el.innerHTML =
      entries
        .map(
          ([name,val]) =>
            `<div class="bar-row">

              <div class="name">
                ${escapeHtml(name)}
              </div>

              <div class="bar-track">

                <div
                  class="bar-fill"
                  style="width:${
                    maxVal
                      ? val / maxVal * 100
                      : 0
                  }%"
                ></div>

              </div>

              <div class="amount">
                ${money(val)}
              </div>

            </div>`
        )
        .join('');
  }


  function renderFinanceiro(){

    const done =
      allDoneCache;

    const today =
      todayISO();

    const now =
      new Date();

    const sevenDaysAgo =
      new Date(now);

    sevenDaysAgo.setDate(
      now.getDate() - 6
    );

    const inicioSemana =
      toLocalISO(
        sevenDaysAgo
      );

    const monthStr =
      today.slice(0,7);

    const sumWhere =
      fn =>
        done
          .filter(fn)
          .reduce(
            (s,a) =>
              s + Number(a.valor),
            0
          );

    const hoje =
      sumWhere(
        a =>
          a.data ===
          today
      );

    const semana =
      sumWhere(
        a =>
          a.data >=
          inicioSemana
      );

    const mes =
      sumWhere(
        a =>
          a.data.slice(0,7) ===
          monthStr
      );

    const doneMes =
      done.filter(
        a =>
          a.data.slice(0,7) ===
          monthStr
      );

    $('fin-hoje').textContent =
      money(hoje);

    $('fin-semana').textContent =
      money(semana);

    $('fin-mes').textContent =
      money(mes);

    $('fin-count').textContent =
      doneMes.length;

    const despesasMes =
      allExpensesCache.filter(
        d =>
          d.data.slice(0,7) ===
          monthStr
      );

    const totalDespesasMes =
      despesasMes.reduce(
        (s,d) =>
          s + Number(d.valor),
        0
      );

    const lucroMes =
      mes - totalDespesasMes;

    $('fin-despesas-mes')
      .textContent =
      money(totalDespesasMes);

    const lucroEl =
      $('fin-lucro-mes');

    if(lucroEl){
      lucroEl.textContent =
        money(lucroMes);
    }

    $('fin-lucro-card')
      ?.classList
      .toggle(
        'negative',
        lucroMes < 0
      );

    const bySvc = {};

    doneMes.forEach(
      a => {

        const name =
          a.servico_nome ||
          serviceName(
            a.servico_id
          );

        bySvc[name] =
          (
            bySvc[name] || 0
          ) +
          Number(a.valor);
      }
    );

    renderBars(
      'fin-bars',
      Object.entries(bySvc)
        .sort(
          (a,b) =>
            b[1] - a[1]
        ),
      'Nenhum faturamento registrado este mês ainda.'
    );

    const byCat = {};

    despesasMes.forEach(
      d => {

        const cat =
          d.categoria ||
          'Outros';

        byCat[cat] =
          (
            byCat[cat] || 0
          ) +
          Number(d.valor);
      }
    );

    renderBars(
      'fin-despesas-bars',
      Object.entries(byCat)
        .sort(
          (a,b) =>
            b[1] - a[1]
        ),
      'Nenhuma despesa registrada este mês ainda.'
    );

    updateSideStats(hoje);
  }


  function updateSideStats(
    hojeVal
  ){

    if(
      hojeVal ===
      undefined
    ){

      const today =
        todayISO();

      hojeVal =
        allDoneCache
          .filter(
            a =>
              a.data ===
              today
          )
          .reduce(
            (s,a) =>
              s + Number(a.valor),
            0
          );
    }

    const todayEl =
      $('side-today');

    if(todayEl){

      todayEl.textContent =
        money(hojeVal);
    }

    const pendenteTotal =
      allDoneCache
        .filter(
          a =>
            a.status_pagamento ===
            'pendente'
        )
        .reduce(
          (s,a) =>
            s + Number(a.valor),
          0
        );

    const pendingEl =
      $('side-pending');

    if(pendingEl){

      pendingEl.textContent =
        money(pendenteTotal);
    }
  }


  // ============================================================
  // SERVIÇOS — CRUD
  // ============================================================

  const overlayService =
    $('overlay-service');


  $('btn-new-service')
    ?.addEventListener(
      'click',
      () => {

        editingServiceId =
          null;

        $('sv-name').value =
          '';

        $('sv-price').value =
          '';

        $('sv-duration').value =
          '';

        overlayService
          ?.classList
          .add('active');
      }
    );


  $('btn-cancel-service')
    ?.addEventListener(
      'click',
      () => {

        overlayService
          ?.classList
          .remove('active');
      }
    );


  overlayService
    ?.addEventListener(
      'click',
      e => {

        if(
          e.target ===
          overlayService
        ){

          overlayService
            .classList
            .remove('active');
        }
      }
    );


  $('form-service')
    ?.addEventListener(
      'submit',
      async e => {

        e.preventDefault();

        const nome =
          $('sv-name')
            .value.trim();

        const preco =
          parseFloat(
            $('sv-price').value
          ) || 0;

        const duracao_min =
          parseInt(
            $('sv-duration').value
          ) || 0;

        try{

          if(editingServiceId){

            await api(
              '/servicos/' +
              editingServiceId,
              {
                method:'PUT',

                body:
                  JSON.stringify({
                    nome,
                    preco,
                    duracao_min
                  })
              }
            );

          }else{

            await api(
              '/servicos',
              {
                method:'POST',

                body:
                  JSON.stringify({
                    nome,
                    preco,
                    duracao_min
                  })
              }
            );
          }

          overlayService
            ?.classList
            .remove('active');

          await loadServices();
          await refreshServicos();

        }catch(err){

          alert(
            'Não foi possível salvar: ' +
            err.message
          );
        }
      }
    );


  function editService(id){

    const s =
      state.services.find(
        x =>
          mesmoId(
            x.id,
            id
          )
      );

    if(!s){
      return;
    }

    editingServiceId =
      id;

    $('sv-name').value =
      s.nome;

    $('sv-price').value =
      s.preco;

    $('sv-duration').value =
      s.duracao_min;

    overlayService
      ?.classList
      .add('active');
  }


  async function removeService(id){

    if(
      !confirm(
        'Remover este item permanentemente? Agendamentos que já o usam continuam existindo, só perdem a referência ao nome.'
      )
    ){
      return;
    }

    try{

      await api(
        '/servicos/' + id,
        {
          method:'DELETE'
        }
      );

      await loadServices();
      await refreshServicos();

    }catch(e){

      alert(
        'Erro ao remover: ' +
        e.message
      );
    }
  }


  async function refreshServicos(){

    if(
      state.services.length === 0
    ){

      await loadServices();
    }

    const list =
      $('services-list');

    if(!list){
      return;
    }

    if(
      state.services.length === 0
    ){

      list.innerHTML =
        '<div class="empty">' +
        'Nenhum item cadastrado ainda.' +
        '</div>';

      return;
    }

    list.innerHTML =
      state.services
        .map(
          s =>
            `<div
              class="invoice-row"
              style="grid-template-columns:1fr auto auto;"
            >

              <div>

                <div class="client">
                  ${escapeHtml(s.nome)}
                </div>

                <div class="meta">
                  ${s.duracao_min} min
                </div>

              </div>

              <span class="price-tag">
                ${money(s.preco)}
              </span>

              <div class="ticket-actions">

                <button
                  class="btn btn-small btn-ghost"
                  onclick="App.editService('${s.id}')"
                >
                  Editar
                </button>

                <button
                  class="btn btn-small btn-ghost"
                  onclick="App.removeService('${s.id}')"
                >
                  Remover
                </button>

              </div>

            </div>`
        )
        .join('');
  }


  // ============================================================
  // CLIENTES
  // ============================================================

  function clientesEmptyHtml(){

    const n =
      getNicho();

    const dica =
      n.extra1
        ? 'nome, telefone ou ' +
          n.extra1.label.toLowerCase()
        : 'nome ou telefone';

    return `

      <div class="empty">

        <svg
          class="empty-icon"
          viewBox="0 0 20 20"
        >
          <circle
            cx="9"
            cy="9"
            r="6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
          />

          <path
            d="M17 17l-4-4"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
          />

        </svg>

        <strong>
          Busque um(a)
          ${escapeHtml(
            n.cliente.toLowerCase()
          )}
        </strong>

        Digite
        ${escapeHtml(dica)}
        e veja todo o histórico de atendimentos.

      </div>

    `;
  }


  $('btn-cli-search')
    ?.addEventListener(
      'click',
      runClientSearch
    );


  $('cli-search-input')
    ?.addEventListener(
      'keydown',
      e => {

        if(e.key === 'Enter'){

          e.preventDefault();

          runClientSearch();
        }
      }
    );


  $('cli-search-input')
    ?.addEventListener(
      'input',
      e => {

        $('btn-cli-clear')
          ?.classList
          .toggle(
            'visible',
            e.target.value.length > 0
          );
      }
    );


  $('btn-cli-clear')
    ?.addEventListener(
      'click',
      () => {

        const input =
          $('cli-search-input');

        if(!input){
          return;
        }

        input.value =
          '';

        $('btn-cli-clear')
          ?.classList
          .remove('visible');

        $('cli-summary')
          .innerHTML =
          '';

        $('cli-results')
          .innerHTML =
          clientesEmptyHtml();

        input.focus();
      }
    );


  async function runClientSearch(){

    const termo =
      $('cli-search-input')
        .value.trim();

    const resultsEl =
      $('cli-results');

    const summaryEl =
      $('cli-summary');

    if(!termo){

      resultsEl.innerHTML =
        clientesEmptyHtml();

      summaryEl.innerHTML =
        '';

      return;
    }

    resultsEl.innerHTML =
      '<div class="empty">Buscando…</div>';

    summaryEl.innerHTML =
      '';

    try{

      const items =
        await api(
          '/agendamentos?busca=' +
          encodeURIComponent(
            termo
          )
        );

      renderClientResults(
        items
      );

    }catch(e){

      resultsEl.innerHTML =
        '<div class="empty">' +
          '<strong>Não foi possível buscar</strong>' +
          'Verifique a conexão com o banco de dados.' +
        '</div>';
    }
  }


  function renderClientResults(items){

    const summaryEl =
      $('cli-summary');

    const resultsEl =
      $('cli-results');

    if(items.length === 0){

      summaryEl.innerHTML =
        '';

      resultsEl.innerHTML =
        '<div class="empty">' +
          '<strong>Nada encontrado</strong>' +
          'Confira se digitou corretamente.' +
        '</div>';

      return;
    }

    const concluidos =
      items.filter(
        a =>
          a.status ===
          'concluido'
      );

    const totalGasto =
      concluidos.reduce(
        (s,a) =>
          s + Number(a.valor),
        0
      );

    const ultima =
      items[0];

    summaryEl.innerHTML = `

      <div class="totals-strip">

        <div class="stat-card">

          <div class="label">
            Visitas encontradas
          </div>

          <div class="value">
            ${items.length}
          </div>

        </div>

        <div class="stat-card money">

          <div class="label">
            Total gasto (concluídos)
          </div>

          <div class="value">
            ${money(totalGasto)}
          </div>

        </div>

        <div class="stat-card">

          <div class="label">
            Última visita
          </div>

          <div
            class="value"
            style="font-size:16px;"
          >
            ${
              new Date(
                ultima.data +
                'T00:00:00'
              ).toLocaleDateString(
                'pt-BR'
              )
            }
          </div>

        </div>

      </div>

    `;

    resultsEl.innerHTML =
      items
        .map(
          ap => {

            const statusLabel = {

              agendado:
                'agendado',

              em_andamento:
                'em andamento',

              concluido:
                'concluído',

              cancelado:
                'cancelado'

            }[ap.status];

            const dataCurta =
              new Date(
                ap.data +
                'T00:00:00'
              ).toLocaleDateString(
                'pt-BR',
                {
                  day:'2-digit',
                  month:'2-digit'
                }
              );

            return `

              <div
                class="ticket status-${ap.status}"
              >

                <div class="ticket-time">

                  ${dataCurta}

                  <small>
                    ${statusLabel}
                  </small>

                </div>

                <div class="ticket-body">

                  <div class="client">
                    ${escapeHtml(ap.cliente)}
                  </div>

                  <div class="meta">

                    <span>
                      ${ap.hora.slice(0,5)}
                    </span>

                    <span>
                      ${
                        escapeHtml(
                          ap.servico_nome ||
                          serviceName(
                            ap.servico_id
                          )
                        )
                      }
                    </span>

                    ${detalhesHtml(ap)}

                  </div>

                </div>

                <div class="ticket-actions">

                  <span class="price-tag">
                    ${money(ap.valor)}
                  </span>

                </div>

              </div>

            `;
          }
        )
        .join('');
  }


  // ============================================================
  // DESPESAS
  // ============================================================

  const overlayExpense =
    $('overlay-expense');


  $('btn-new-expense')
    ?.addEventListener(
      'click',
      () => {

        $('ex-desc').value =
          '';

        $('ex-category').value =
          'Produtos de limpeza';

        $('ex-date').value =
          todayISO();

        $('ex-value').value =
          '';

        overlayExpense
          ?.classList
          .add('active');

        $('ex-desc')
          ?.focus();
      }
    );


  $('btn-cancel-expense')
    ?.addEventListener(
      'click',
      () => {

        overlayExpense
          ?.classList
          .remove('active');
      }
    );


  overlayExpense
    ?.addEventListener(
      'click',
      e => {

        if(
          e.target ===
          overlayExpense
        ){

          overlayExpense
            .classList
            .remove('active');
        }
      }
    );


  $('form-expense')
    ?.addEventListener(
      'submit',
      async e => {

        e.preventDefault();

        const payload = {

          descricao:
            $('ex-desc')
              .value.trim(),

          categoria:
            $('ex-category')
              .value,

          data:
            $('ex-date')
              .value,

          valor:
            parseFloat(
              $('ex-value').value
            ) || 0
        };

        try{

          await api(
            '/despesas',
            {
              method:'POST',

              body:
                JSON.stringify(
                  payload
                )
            }
          );

          overlayExpense
            ?.classList
            .remove('active');

          await refreshDespesas();

        }catch(err){

          alert(
            'Não foi possível salvar a despesa: ' +
            err.message
          );
        }
      }
    );


  async function removeExpense(id){

    if(
      !confirm(
        'Remover esta despesa?'
      )
    ){
      return;
    }

    try{

      await api(
        '/despesas/' + id,
        {
          method:'DELETE'
        }
      );

      await refreshDespesas();

    }catch(e){

      alert(
        'Erro ao remover: ' +
        e.message
      );
    }
  }


  async function refreshDespesas(){

    const listEl =
      $('desp-list');

    if(!listEl){
      return;
    }

    listEl.innerHTML =
      '<div class="empty">Carregando…</div>';

    let items;

    try{

      items =
        await fetchWideRangeExpenses();

    }catch(e){

      listEl.innerHTML =
        '<div class="empty">' +
          '<strong>Não foi possível carregar as despesas</strong>' +
          'Verifique a conexão com o banco de dados.' +
        '</div>';

      return;
    }

    allExpensesCache =
      items;

    const total =
      items.reduce(
        (s,d) =>
          s + Number(d.valor),
        0
      );

    $('desp-total').textContent =
      money(total);

    $('desp-count').textContent =
      items.length;

    if(items.length === 0){

      listEl.innerHTML =
        '<div class="empty">' +
          '<strong>Nenhuma despesa nos últimos 90 dias</strong>' +
          'Toque em "Nova despesa" para lançar produtos, água, luz, manutenção etc.' +
        '</div>';

      return;
    }

    listEl.innerHTML =
      items
        .map(
          d =>
            `<div
              class="invoice-row"
              style="grid-template-columns:1fr auto auto;"
            >

              <div>

                <div class="client">
                  ${escapeHtml(d.descricao)}
                </div>

                <div class="meta">

                  ${
                    new Date(
                      d.data +
                      'T00:00:00'
                    ).toLocaleDateString(
                      'pt-BR'
                    )
                  }

                  ·

                  ${escapeHtml(d.categoria)}

                </div>

              </div>

              <span
                class="price-tag"
                style="color:var(--warn);"
              >
                ${money(d.valor)}
              </span>

              <div class="ticket-actions">

                <button
                  class="btn btn-small btn-ghost"
                  onclick="App.removeExpense('${d.id}')"
                >
                  Remover
                </button>

              </div>

            </div>`
        )
        .join('');
  }


  // ============================================================
  // USUÁRIOS
  // ============================================================

  const overlayUser =
    $('overlay-user');

  const formUser =
    $('form-user');


  $('btn-new-user')
    ?.addEventListener(
      'click',
      openNewUser
    );


  function openNewUser(){

    if(!isAdministrador()){

      alert(
        'Apenas administradores podem gerenciar usuários.'
      );

      return;
    }

    editingUserId =
      null;

    const title =
      $('user-modal-title');

    if(title){
      title.textContent =
        'Novo usuário';
    }

    const submit =
      $('user-submit-btn');

    if(submit){
      submit.textContent =
        'Criar usuário';
    }

    const name =
      $('user-name');

    const email =
      $('user-email');

    const profile =
      $('user-profile');

    const password =
      $('user-password');

    const passwordField =
      $('user-password-field');

    const activeField =
      $('user-active-field');

    if(name){
      name.value =
        '';
    }

    if(email){
      email.value =
        '';
    }

    if(profile){
      profile.value =
        'funcionario';
    }

    if(password){

      password.value =
        '';

      password.required =
        true;

      password.placeholder =
        '';
    }

    if(passwordField){
      passwordField.style.display =
        '';
    }

    if(activeField){
      activeField.style.display =
        'none';
    }

    marcarPermissoesNoFormulario(
      []
    );

    atualizarVisibilidadePermissoes();

    overlayUser
      ?.classList
      .add('active');

    name?.focus();
  }


  $('btn-cancel-user')
    ?.addEventListener(
      'click',
      closeUserModal
    );


  overlayUser
    ?.addEventListener(
      'click',
      e => {

        if(
          e.target ===
          overlayUser
        ){

          closeUserModal();
        }
      }
    );


  function closeUserModal(){

    overlayUser
      ?.classList
      .remove('active');

    editingUserId =
      null;
  }


  function marcarPermissoesNoFormulario(
    selecionadas
  ){

    const checkboxes =
      document.querySelectorAll(
        '#form-user .user-permissao-checkbox, #form-user [data-permission]'
      );

    const lista =
      Array.isArray(selecionadas)
        ? selecionadas.map(String)
        : [];

    checkboxes.forEach(
      cb => {

        const codigo =
          cb.value ||
          cb.dataset.permission ||
          cb.dataset.permissao ||
          '';

        cb.checked =
          lista.includes(
            String(codigo)
          );
      }
    );
  }


  function lerPermissoesDoFormulario(){

    const checkboxes =
      document.querySelectorAll(
        '#form-user .user-permissao-checkbox, #form-user [data-permission]'
      );

    const permissoes = [];

    checkboxes.forEach(
      cb => {

        if(!cb.checked){
          return;
        }

        const codigo =
          cb.value ||
          cb.dataset.permission ||
          cb.dataset.permissao ||
          '';

        if(
          codigo &&
          !permissoes.includes(codigo)
        ){

          permissoes.push(codigo);
        }
      }
    );

    return permissoes;
  }


  function atualizarVisibilidadePermissoes(){

    const profileEl =
      $('user-profile');

    const grid =
      $('permissions-grid') ||
      $('user-permissions-field');

    const aviso =
      $('admin-permission-notice');

    if(!profileEl){
      return;
    }

    const admin =
      profileEl.value ===
      'administrador';

    if(grid){
      grid.style.display =
        admin
          ? 'none'
          : '';
    }

    if(aviso){
      aviso.style.display =
        admin
          ? ''
          : 'none';
    }
  }


  $('user-profile')
    ?.addEventListener(
      'change',
      atualizarVisibilidadePermissoes
    );


  formUser?.addEventListener(
    'submit',
    async e => {

      e.preventDefault();

      if(!isAdministrador()){

        alert(
          'Apenas administradores podem realizar esta operação.'
        );

        return;
      }

      const nome =
        $('user-name')
          ?.value.trim();

      const email =
        $('user-email')
          ?.value.trim();

      const perfil =
        $('user-profile')
          ?.value;

      const senha =
        $('user-password')
          ?.value;

      if(!nome || !email){

        alert(
          'Informe nome e e-mail.'
        );

        return;
      }

      if(
        !editingUserId &&
        !senha
      ){

        alert(
          'Informe uma senha para o novo usuário.'
        );

        return;
      }

      const submit =
        $('user-submit-btn');

      const editando =
        Boolean(
          editingUserId
        );

      if(submit){

        submit.disabled =
          true;

        submit.textContent =
          editando
            ? 'Salvando...'
            : 'Criando...';
      }

      const permissoes =
        perfil === 'administrador'
          ? []
          : lerPermissoesDoFormulario();

      try{

        if(editando){

          const ativoSelect =
            $('user-active');

          const ativo =
            ativoSelect
              ? ativoSelect.value === 'true'
              : true;

          await api(
            '/usuarios/' +
            editingUserId,
            {
              method:'PUT',

              body:
                JSON.stringify({
                  nome,
                  email,
                  perfil,
                  ativo,
                  permissoes
                })
            }
          );

          if(
            senha &&
            senha.trim().length > 0
          ){

            await api(
              '/usuarios/' +
              editingUserId +
              '/senha',
              {
                method:'PATCH',

                body:
                  JSON.stringify({
                    senha
                  })
              }
            );
          }

        }else{

          await api(
            '/usuarios',
            {
              method:'POST',

              body:
                JSON.stringify({
                  nome,
                  email,
                  senha,
                  perfil,
                  permissoes
                })
            }
          );
        }

        closeUserModal();

        await refreshUsuarios();

      }catch(err){

        alert(
          'Não foi possível salvar o usuário: ' +
          err.message
        );

      }finally{

        if(submit){

          submit.disabled =
            false;

          submit.textContent =
            editando
              ? 'Salvar alterações'
              : 'Criar usuário';
        }
      }
    }
  );


  async function refreshUsuarios(){

    if(!isAdministrador()){

      atualizarAcessoUsuarios();

      return;
    }

    const list =
      $('usuarios-list');

    if(!list){
      return;
    }

    list.innerHTML =
      '<div class="empty">Carregando usuários…</div>';

    try{

      const usuarios =
        await api('/usuarios');

      renderUsuarios(
        usuarios
      );

    }catch(error){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Não foi possível carregar os usuários</strong>' +
          escapeHtml(
            error.message
          ) +
        '</div>';
    }
  }


  function renderUsuarios(
    usuarios
  ){

    const list =
      $('usuarios-list');

    if(!list){
      return;
    }

    const total =
      $('usuarios-total');

    const admins =
      $('usuarios-admins');

    const funcionarios =
      $('usuarios-funcionarios');

    const qtdAdmins =
      usuarios.filter(
        u =>
          u.perfil ===
          'administrador'
      ).length;

    const qtdFuncionarios =
      usuarios.filter(
        u =>
          u.perfil ===
          'funcionario'
      ).length;

    if(total){
      total.textContent =
        usuarios.length;
    }

    if(admins){
      admins.textContent =
        qtdAdmins;
    }

    if(funcionarios){
      funcionarios.textContent =
        qtdFuncionarios;
    }

    if(usuarios.length === 0){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Nenhum usuário cadastrado</strong>' +
          'Clique em "Novo usuário" para adicionar alguém à sua empresa.' +
        '</div>';

      return;
    }

    list.innerHTML =
      usuarios
        .map(
          usuario =>
            renderUsuario(
              usuario,
              usuarios
            )
        )
        .join('');
  }


  function renderUsuario(
    usuario,
    todosUsuarios
  ){

    const nome =
      escapeHtml(
        usuario.nome
      );

    const email =
      escapeHtml(
        usuario.email
      );

    const inicial =
      (
        usuario.nome ||
        'U'
      )
        .charAt(0)
        .toUpperCase();

    const isCurrentUser =
      mesmoId(
        usuario.id,
        usuarioLogado?.id
      );

    const perfilLabel =
      usuario.perfil ===
      'administrador'
        ? 'Administrador'
        : 'Funcionário';

    const statusLabel =
      usuario.ativo
        ? 'Ativo'
        : 'Bloqueado';

    const adminCount =
      todosUsuarios.filter(
        u =>
          u.perfil ===
          'administrador'
      ).length;

    const isLastAdmin =
      usuario.perfil ===
        'administrador' &&
      adminCount <= 1;

    let actions =
      '';

    actions +=
      `<button
        class="btn btn-small btn-ghost"
        onclick="App.editUser('${usuario.id}')"
      >
        Editar
      </button>`;

    if(!isCurrentUser){

      if(
        usuario.perfil ===
        'funcionario'
      ){

        actions +=
          `<button
            class="btn btn-small btn-ghost"
            onclick="App.changeUserProfile('${usuario.id}','administrador')"
          >
            Tornar administrador
          </button>`;

      }else if(!isLastAdmin){

        actions +=
          `<button
            class="btn btn-small btn-ghost"
            onclick="App.changeUserProfile('${usuario.id}','funcionario')"
          >
            Rebaixar
          </button>`;
      }

      actions +=
        `<button
          class="btn btn-small btn-ghost"
          onclick="App.toggleUserStatus('${usuario.id}',${usuario.ativo ? 'false' : 'true'})"
        >
          ${
            usuario.ativo
              ? 'Bloquear'
              : 'Ativar'
          }
        </button>`;

      actions +=
        `<button
          class="btn btn-small btn-ghost"
          onclick="App.deleteUser('${usuario.id}')"
        >
          Excluir
        </button>`;
    }

    return `

      <div
        class="ticket"
        style="
          align-items:center;
          opacity:${usuario.ativo ? '1' : '.65'};
        "
      >

        <div
          class="sidebar-user-avatar"
          style="
            width:40px;
            height:40px;
            min-width:40px;
            font-size:14px;
            overflow-y:auto;
          "
        >
          ${escapeHtml(inicial)}
        </div>

        <div
          class="ticket-body"
          style="min-width:0;"
        >

          <div class="client">

            ${nome}

            ${
              isCurrentUser
                ? `<span
                    class="badge badge-pago"
                    style="margin-left:6px;"
                  >
                    Você
                  </span>`
                : ''
            }

          </div>

          <div class="meta">

            <span>
              ${email}
            </span>

            <span>
              ${perfilLabel}
            </span>

            <span>
              ${statusLabel}
            </span>

          </div>

        </div>

        <div
          class="ticket-actions"
          style="
            flex-wrap:wrap;
            justify-content:flex-end;
          "
        >
          ${actions}
        </div>

      </div>

    `;
  }


  async function editUser(id){

    if(!isAdministrador()){

      alert(
        'Apenas administradores podem editar usuários.'
      );

      return;
    }

    try{

      const usuarios =
        await api('/usuarios');

      const usuario =
        usuarios.find(
          u =>
            mesmoId(
              u.id,
              id
            )
        );

      if(!usuario){

        alert(
          'Usuário não encontrado.'
        );

        return;
      }

      editingUserId =
        id;

      const title =
        $('user-modal-title');

      if(title){
        title.textContent =
          'Editar usuário';
      }

      const submit =
        $('user-submit-btn');

      if(submit){
        submit.textContent =
          'Salvar alterações';
      }

      const name =
        $('user-name');

      const email =
        $('user-email');

      const profile =
        $('user-profile');

      const password =
        $('user-password');

      const passwordField =
        $('user-password-field');

      const activeField =
        $('user-active-field');

      const active =
        $('user-active');

      if(name){
        name.value =
          usuario.nome || '';
      }

      if(email){
        email.value =
          usuario.email || '';
      }

      if(profile){
        profile.value =
          usuario.perfil ||
          'funcionario';
      }

      if(password){

        password.value =
          '';

        password.required =
          false;

        password.placeholder =
          'Deixe vazio para manter a atual';
      }

      if(passwordField){
        passwordField.style.display =
          '';
      }

      if(activeField){
        activeField.style.display =
          '';
      }

      if(active){

        active.value =
          usuario.ativo
            ? 'true'
            : 'false';
      }

      marcarPermissoesNoFormulario(
        usuario.permissoes || []
      );

      atualizarVisibilidadePermissoes();

      overlayUser
        ?.classList
        .add('active');

      name?.focus();

    }catch(error){

      alert(
        'Não foi possível carregar o usuário: ' +
        error.message
      );
    }
  }


  async function changeUserProfile(
    id,
    novoPerfil
  ){

    if(!isAdministrador()){

      alert(
        'Apenas administradores podem alterar cargos.'
      );

      return;
    }

    const nomePerfil =
      novoPerfil ===
      'administrador'
        ? 'administrador'
        : 'funcionário';

    if(
      !confirm(
        `Deseja alterar este usuário para ${nomePerfil}?`
      )
    ){
      return;
    }

    try{

      await api(
        '/usuarios/' + id,
        {
          method:'PUT',

          body:
            JSON.stringify({
              perfil:
                novoPerfil
            })
        }
      );

      await refreshUsuarios();

    }catch(error){

      alert(
        'Não foi possível alterar o cargo: ' +
        error.message
      );
    }
  }


  async function toggleUserStatus(
    id,
    ativo
  ){

    if(!isAdministrador()){

      alert(
        'Apenas administradores podem bloquear usuários.'
      );

      return;
    }

    if(
      mesmoId(
        id,
        usuarioLogado?.id
      )
    ){

      alert(
        'Você não pode bloquear o próprio usuário.'
      );

      return;
    }

    const acao =
      ativo
        ? 'ativar'
        : 'bloquear';

    if(
      !confirm(
        `Deseja ${acao} este usuário?`
      )
    ){
      return;
    }

    try{

      await api(
        '/usuarios/' + id,
        {
          method:'PUT',

          body:
            JSON.stringify({
              ativo
            })
        }
      );

      await refreshUsuarios();

    }catch(error){

      alert(
        `Não foi possível ${acao} o usuário: ` +
        error.message
      );
    }
  }


  async function deleteUser(id){

    if(!isAdministrador()){

      alert(
        'Apenas administradores podem excluir usuários.'
      );

      return;
    }

    if(
      mesmoId(
        id,
        usuarioLogado?.id
      )
    ){

      alert(
        'Você não pode excluir o próprio usuário.'
      );

      return;
    }

    if(
      !confirm(
        'Deseja excluir este usuário definitivamente?'
      )
    ){
      return;
    }

    try{

      await api(
        '/usuarios/' + id,
        {
          method:'DELETE'
        }
      );

      await refreshUsuarios();

    }catch(error){

      alert(
        'Não foi possível excluir o usuário: ' +
        error.message
      );
    }
  }


  // ============================================================
  // MODAL OBRIGATÓRIO — PLANO
  // ============================================================

  function mostrarModalPlano(){

    const modal =
      $('modal-plano-obrigatorio');

    if(!modal){

      console.warn(
        'Modal obrigatório de plano não encontrado no HTML.'
      );

      return;
    }

    modal.style.display =
      'flex';

    document.body.style.overflow =
      'hidden';
  }


  function esconderModalPlano(){

    const modal =
      $('modal-plano-obrigatorio');

    if(!modal){
      return;
    }

    modal.style.display =
      'none';

    document.body.style.overflow =
      '';
  }


  async function carregarPlanosObrigatorios(){

    const loading =
      $('modal-plano-loading');

    const lista =
      $('modal-plano-lista');

    const erro =
      $('modal-plano-erro');

    if(!lista){
      return;
    }

    try{

      if(loading){
        loading.style.display =
          'block';
      }

      lista.innerHTML =
        '';

      if(erro){

        erro.style.display =
          'none';

        erro.textContent =
          '';
      }

      const planos =
        await api(
          '/planos/disponiveis'
        );

      if(loading){

        loading.style.display =
          'none';
      }

      if(
        !Array.isArray(planos) ||
        planos.length === 0
      ){

        if(erro){

          erro.textContent =
            'Nenhum plano está disponível no momento.';

          erro.style.display =
            'block';
        }

        return;
      }

      planos.forEach(
        plano => {

          const card =
            document.createElement(
              'div'
            );

          card.className =
            'modal-plano-card';

          const nome =
            document.createElement(
              'h3'
            );

          nome.textContent =
            plano.nome ||
            'Plano';

          const descricao =
            document.createElement(
              'div'
            );

          descricao.className =
            'modal-plano-card-descricao';

          descricao.textContent =
            plano.descricao ||
            'Plano para sua empresa.';

          const preco =
            document.createElement(
              'div'
            );

          preco.className =
            'modal-plano-card-preco';

          const valor =
            Number(
              plano.valor || 0
            );

          preco.textContent =
            'R$ ' +
            valor.toLocaleString(
              'pt-BR',
              {
                minimumFractionDigits:2,
                maximumFractionDigits:2
              }
            ) +
            ' ';

          const periodo =
            document.createElement(
              'small'
            );

          periodo.textContent =
            '/' +
            (
              plano.periodo ||
              'mês'
            );

          preco.appendChild(
            periodo
          );

          const botao =
            document.createElement(
              'button'
            );

          botao.type =
            'button';

          botao.className =
            'modal-plano-btn';

          botao.textContent =
            'Escolher plano';

          botao.addEventListener(
            'click',
            () => {

              selecionarPlanoObrigatorio(
                plano
              );
            }
          );

          card.appendChild(
            nome
          );

          card.appendChild(
            descricao
          );

          card.appendChild(
            preco
          );

          card.appendChild(
            botao
          );

          lista.appendChild(
            card
          );
        }
      );

    }catch(error){

      console.error(
        'Erro ao carregar planos:',
        error
      );

      if(loading){

        loading.style.display =
          'none';
      }

      if(erro){

        erro.textContent =
          error.message ||
          'Não foi possível carregar os planos.';

        erro.style.display =
          'block';
      }
    }
  }


  function selecionarPlanoObrigatorio(
    plano
  ){

    if(
      !plano ||
      !plano.id
    ){
      return;
    }

    sessionStorage.setItem(
      'orvix_plano_selecionado',
      JSON.stringify(plano)
    );

    window.location.href =
      '/assinaturas.html';
  }


  // ============================================================
  // ASSINATURA
  // ============================================================

  async function verificarAssinaturaObrigatoria(){

    if(
      !usuarioLogado ||
      usuarioLogado.perfil === 'dev' ||
      usuarioLogado.conta_teste === true
    ){

      assinaturaVerificada =
        true;

      esconderModalPlano();

      return true;
    }

    if(
      empresaLogada &&
      empresaLogada.conta_teste === true
    ){

      assinaturaVerificada =
        true;

      esconderModalPlano();

      return true;
    }

    if(
      !usuarioLogado.empresa_id
    ){

      assinaturaVerificada =
        false;

      mostrarModalPlano();

      await carregarPlanosObrigatorios();

      return false;
    }

    try{

      const resposta =
        await api(
          '/mercado-pago/minha-assinatura'
        );

      const possuiAssinatura =
        resposta?.possui_assinatura ===
        true;

      const status =
        resposta?.assinatura?.status;

      const assinaturaValida =
        possuiAssinatura &&
        [
          'ativa',
          'authorized',
          'active'
        ].includes(
          String(
            status || ''
          ).toLowerCase()
        );

      if(assinaturaValida){

        assinaturaVerificada =
          true;

        esconderModalPlano();

        return true;
      }

      assinaturaVerificada =
        false;

      mostrarModalPlano();

      await carregarPlanosObrigatorios();

      return false;

    }catch(error){

      console.warn(
        'Empresa sem assinatura válida:',
        error.message
      );

      assinaturaVerificada =
        false;

      mostrarModalPlano();

      await carregarPlanosObrigatorios();

      return false;
    }
  }


  // ============================================================
  // LOGS / AUDITORIA
  // ============================================================

  let logsPaginaAtual = 1;

  const LOGS_POR_PAGINA = 30;

  let logsCarregando = false;


  function escaparHtmlLogs(valor){

    if(
      valor === null ||
      valor === undefined
    ){
      return '';
    }

    return String(valor)
      .replace(
        /&/g,
        '&amp;'
      )
      .replace(
        /</g,
        '&lt;'
      )
      .replace(
        />/g,
        '&gt;'
      )
      .replace(
        /"/g,
        '&quot;'
      )
      .replace(
        /'/g,
        '&#039;'
      );
  }


  function formatarDataLog(data){

    if(!data){
      return '-';
    }

    const d =
      new Date(data);

    if(
      Number.isNaN(
        d.getTime()
      )
    ){

      return String(data);
    }

    return d.toLocaleString(
      'pt-BR',
      {
        dateStyle:'short',
        timeStyle:'short'
      }
    );
  }


  function formatarAcaoLog(acao){

    if(!acao){
      return '-';
    }

    const mapa = {

      criacao:
        'Criação',

      criação:
        'Criação',

      atualizacao:
        'Atualização',

      atualização:
        'Atualização',

      exclusao:
        'Exclusão',

      exclusão:
        'Exclusão',

      login:
        'Login',

      logout:
        'Logout'
    };

    return (
      mapa[
        String(acao)
          .toLowerCase()
      ] ||
      String(acao)
    );
  }


  function formatarEntidadeLog(
    entidade
  ){

    if(!entidade){
      return '-';
    }

    const mapa = {

      empresa:
        'Empresa',

      usuario:
        'Usuário',

      usuarios:
        'Usuários',

      servico:
        'Serviço',

      servicos:
        'Serviços',

      agendamento:
        'Agendamento',

      agendamentos:
        'Agendamentos',

      despesa:
        'Despesa',

      despesas:
        'Despesas',

      cliente:
        'Cliente',

      clientes:
        'Clientes',

      configuracoes:
        'Configurações'
    };

    return (
      mapa[
        String(entidade)
          .toLowerCase()
      ] ||
      String(entidade)
    );
  }


  function formatarDetalhesLog(
    detalhes
  ){

    if(!detalhes){
      return '-';
    }

    try{

      const objeto =
        typeof detalhes ===
        'string'
          ? JSON.parse(detalhes)
          : detalhes;

      return escaparHtmlLogs(
        JSON.stringify(
          objeto,
          null,
          2
        )
      );

    }catch(_){

      return escaparHtmlLogs(
        detalhes
      );
    }
  }


  function obterNomeUsuarioLog(
    log
  ){

    if(log.usuario_nome){
      return log.usuario_nome;
    }

    if(log.usuario_email){
      return log.usuario_email;
    }

    if(log.usuario_id){

      return (
        `Usuário #${log.usuario_id}`
      );
    }

    return 'Sistema';
  }


async function carregarLogs() {
  console.log('>>> CARREGAR LOGS FOI CHAMADO');

  const lista = $('logs-list');

  if (!lista) {
    console.error('>>> ERRO: #logs-list não encontrado');
    return;
  }

  console.log('>>> logs-list encontrado');

  if (logsCarregando) {
    return;
  }

  try {
    logsCarregando = true;

    lista.innerHTML = `
      <div class="empty">
        <strong>Carregando atividades...</strong>
        <span>Buscando as últimas alterações realizadas na empresa.</span>
      </div>
    `;

    const params = new URLSearchParams();

    params.set('pagina', String(logsPaginaAtual));
    params.set('limite', String(LOGS_POR_PAGINA));

    const busca = $('logs-busca')?.value?.trim() || '';
    const acao = $('logs-acao')?.value?.trim() || '';

    if (busca) {
      params.set('busca', busca);
    }

    if (acao) {
      params.set('acao', acao);
    }

    console.log(
      '>>> CHAMANDO API:',
      `/logs?${params.toString()}`
    );

    const resposta = await api(
      `/logs?${params.toString()}`
    );

    console.log('>>> RESPOSTA DA API:', resposta);

    const logs = Array.isArray(resposta)
      ? resposta
      : (resposta?.logs || []);

    console.log('>>> LOGS RECEBIDOS:', logs);

    if (!logs.length) {
      lista.innerHTML = `
        <div class="empty logs-empty-state">
          <div class="logs-empty-icon">✓</div>
          <strong>Nenhuma atividade encontrada</strong>
          <span>
            Não existem registros de auditoria para os filtros selecionados.
          </span>
        </div>
      `;

      atualizarPaginacaoLogs(resposta);
      return;
    }

    lista.innerHTML = logs.map(log => {

     const usuario = escaparHtmlLogs(
  log.usuario_nome ||
  obterNomeUsuarioLog(log)
);

      const acaoOriginal = String(
        log.acao || ''
      ).toLowerCase();

      const entidadeOriginal = String(
        log.entidade || ''
      ).toLowerCase();

      const acaoFormatada = formatarAcaoLog(
        log.acao
      );

      const entidade = formatarEntidadeLog(
        log.entidade
      );

      const data = formatarDataLog(
        log.criado_em
      );

      const detalhes = formatarDetalhesLog(
        log.detalhes
      );

      const entidadeId =
        log.entidade_id != null &&
        log.entidade_id !== ''
          ? String(log.entidade_id)
          : null;

      /*
       * ---------------------------------------------------------
       * TEXTO PRINCIPAL DA ATIVIDADE
       * ---------------------------------------------------------
       */

      let titulo = `${acaoFormatada} · ${entidade}`;

      if (acaoOriginal === 'criacao') {
        titulo = `${entidade} criado`;
      }

      if (
        acaoOriginal === 'atualizacao' ||
        acaoOriginal === 'atualização'
      ) {
        titulo = `${entidade} atualizado`;
      }

      if (acaoOriginal === 'exclusao' ||
          acaoOriginal === 'exclusão') {
        titulo = `${entidade} excluído`;
      }

      if (acaoOriginal === 'login') {
        titulo = 'Login realizado';
      }

      if (acaoOriginal === 'logout') {
        titulo = 'Logout realizado';
      }

      /*
       * ---------------------------------------------------------
       * ÍCONE / TIPO DA ATIVIDADE
       * ---------------------------------------------------------
       */

      let classeAcao = 'default';
      let iconeAcao = '•';

      if (acaoOriginal === 'criacao') {
        classeAcao = 'criacao';
        iconeAcao = '+';
      }

      if (
        acaoOriginal === 'atualizacao' ||
        acaoOriginal === 'atualização'
      ) {
        classeAcao = 'atualizacao';
        iconeAcao = '↻';
      }

      if (
        acaoOriginal === 'exclusao' ||
        acaoOriginal === 'exclusão'
      ) {
        classeAcao = 'exclusao';
        iconeAcao = '×';
      }

      if (acaoOriginal === 'login') {
        classeAcao = 'login';
        iconeAcao = '→';
      }

      if (acaoOriginal === 'logout') {
        classeAcao = 'logout';
        iconeAcao = '←';
      }

      /*
       * ---------------------------------------------------------
       * DESCRIÇÃO
       * ---------------------------------------------------------
       */

      let descricao = '';

      if (acaoOriginal === 'criacao') {
        descricao = `Criado por ${usuario}`;
      } else if (
        acaoOriginal === 'atualizacao' ||
        acaoOriginal === 'atualização'
      ) {
        descricao = `Alterado por ${usuario}`;
      } else if (
        acaoOriginal === 'exclusao' ||
        acaoOriginal === 'exclusão'
      ) {
        descricao = `Removido por ${usuario}`;
      } else if (acaoOriginal === 'login') {
        descricao = `${usuario} entrou no sistema`;
      } else if (acaoOriginal === 'logout') {
        descricao = `${usuario} saiu do sistema`;
      } else {
        descricao = `Realizado por ${usuario}`;
      }

      /*
       * ---------------------------------------------------------
       * BADGE DO REGISTRO
       * ---------------------------------------------------------
       */

      const badgeId = entidadeId
        ? `
          <span class="log-id">
            #${escaparHtmlLogs(entidadeId)}
          </span>
        `
        : '';

      /*
       * ---------------------------------------------------------
       * DETALHES
       * ---------------------------------------------------------
       */

      const detalhesHtml = detalhes
        ? `
          <div class="log-details">
            <div class="log-details-label">
              Detalhes
            </div>

            <div class="log-details-text">
              ${escaparHtmlLogs(detalhes)}
            </div>
          </div>
        `
        : '';

      /*
       * ---------------------------------------------------------
       * METADADOS TÉCNICOS
       * ---------------------------------------------------------
       */

      let dadosTecnicos = '';

      if (log.detalhes) {
        try {
          const dados =
            typeof log.detalhes === 'string'
              ? JSON.parse(log.detalhes)
              : log.detalhes;

          const rota = dados?.rota || '';
          const metodo = dados?.metodo || '';
          const status = dados?.status || '';

          if (rota || metodo || status) {
            dadosTecnicos = `
              <div class="log-technical">

                ${
                  metodo
                    ? `
                      <span class="log-method">
                        ${escaparHtmlLogs(metodo)}
                      </span>
                    `
                    : ''
                }

                ${
                  rota
                    ? `
                      <span class="log-route">
                        ${escaparHtmlLogs(rota)}
                      </span>
                    `
                    : ''
                }

                ${
                  status
                    ? `
                      <span class="log-status">
                        ${escaparHtmlLogs(status)}
                      </span>
                    `
                    : ''
                }

              </div>
            `;
          }

        } catch (_) {
          // Detalhes inválidos não impedem a exibição do log.
        }
      }

      /*
       * ---------------------------------------------------------
       * CARD
       * ---------------------------------------------------------
       */

      return `
        <article class="log-card">

          <div class="log-card-icon ${classeAcao}">
            ${iconeAcao}
          </div>

          <div class="log-card-content">

            <div class="log-card-header">

              <div class="log-card-title-area">

                <div class="log-card-title">
                  ${escaparHtmlLogs(titulo)}
                  ${badgeId}
                </div>

                <div class="log-card-description">
                  ${escaparHtmlLogs(descricao)}
                </div>

              </div>

              <div class="log-card-date">
                ${escaparHtmlLogs(data)}
              </div>

            </div>

            <div class="log-card-meta">

              <span class="log-meta-user">
                ${usuario}
              </span>

              <span class="log-meta-separator">·</span>

              <span>
                ${escaparHtmlLogs(entidade)}
              </span>

              ${
                entidadeId
                  ? `
                    <span class="log-meta-separator">·</span>
                    <span>
                      Registro #${escaparHtmlLogs(entidadeId)}
                    </span>
                  `
                  : ''
              }

            </div>

            ${dadosTecnicos}

            ${detalhesHtml}

          </div>

        </article>
      `;
    }).join('');

    atualizarPaginacaoLogs(resposta);

  } catch (erro) {

    console.error(
      '>>> ERRO AO CARREGAR LOGS:',
      erro
    );

    lista.innerHTML = `
      <div class="empty logs-empty-state">
        <div class="logs-empty-icon">!</div>

        <strong>
          Não foi possível carregar as atividades
        </strong>

        <span>
          Verifique sua conexão e tente novamente.
        </span>
      </div>
    `;

  } finally {

    logsCarregando = false;

  }
}

  function renderizarLogs(logs){

    const tbody =
      document.getElementById(
        'logs-tbody'
      );

    if(!tbody){
      return;
    }

    if(!logs.length){

      tbody.innerHTML = `

        <tr>

          <td
            colspan="6"
            class="empty-state"
          >
            Nenhum registro encontrado.
          </td>

        </tr>

      `;

      return;
    }

    tbody.innerHTML =
      logs
        .map(
          log => {

            const detalhes =
              formatarDetalhesLog(
                log.detalhes
              );

            return `

              <tr>

                <td>
                  ${
                    escaparHtmlLogs(
                      formatarDataLog(
                        log.criado_em
                      )
                    )
                  }
                </td>

                <td>
                  ${
                    escaparHtmlLogs(
                      obterNomeUsuarioLog(
                        log
                      )
                    )
                  }
                </td>

                <td>

                  <span
                    class="log-action"
                  >
                    ${
                      escaparHtmlLogs(
                        formatarAcaoLog(
                          log.acao
                        )
                      )
                    }
                  </span>

                </td>

                <td>
                  ${
                    escaparHtmlLogs(
                      formatarEntidadeLog(
                        log.entidade
                      )
                    )
                  }
                </td>

                <td>

                  ${
                    log.entidade_id
                      ? `#${escaparHtmlLogs(
                          log.entidade_id
                        )}`
                      : '-'
                  }

                </td>

                <td>

                  <details
                    class="log-details"
                  >

                    <summary>
                      Ver detalhes
                    </summary>

                    <pre>${detalhes}</pre>

                  </details>

                </td>

              </tr>

            `;
          }
        )
        .join('');
  }


  function atualizarPaginacaoLogs(
    totalPaginas
  ){

    const elementoPagina =
      document.getElementById(
        'logs-pagina'
      );

    const btnAnterior =
      document.getElementById(
        'logs-anterior'
      );

    const btnProximo =
      document.getElementById(
        'logs-proximo'
      );

    if(elementoPagina){

      elementoPagina.textContent =
        `Página ${logsPaginaAtual} de ${totalPaginas}`;
    }

    if(btnAnterior){

      btnAnterior.disabled =
        logsPaginaAtual <= 1;
    }

    if(btnProximo){

      btnProximo.disabled =
        logsPaginaAtual >=
        totalPaginas;
    }
  }


  function inicializarLogs(){

    const btnAtualizar =
      document.getElementById(
        'btn-atualizar-logs'
      );

    const btnAnterior =
      document.getElementById(
        'logs-anterior'
      );

    const btnProximo =
      document.getElementById(
        'logs-proximo'
      );

    const busca =
      document.getElementById(
        'logs-busca'
      );

    const acao =
      document.getElementById(
        'logs-acao'
      );


    if(btnAtualizar){

      btnAtualizar.addEventListener(
        'click',
        () => {

          carregarLogs();
        }
      );
    }


    if(btnAnterior){

      btnAnterior.addEventListener(
        'click',
        () => {

          if(
            logsPaginaAtual <= 1
          ){
            return;
          }

          logsPaginaAtual--;

          carregarLogs();
        }
      );
    }


    if(btnProximo){

      btnProximo.addEventListener(
        'click',
        () => {

          btnProximo.disabled =
            true;

          carregarLogs()
            .finally(
              () => {
                btnProximo.disabled =
                  false;
              }
            );
        }
      );
    }


    if(acao){

      acao.addEventListener(
        'change',
        () => {

          logsPaginaAtual =
            1;

          carregarLogs();
        }
      );
    }


    if(busca){

      let timeout;

      busca.addEventListener(
        'input',
        () => {

          clearTimeout(
            timeout
          );

          timeout =
            setTimeout(
              () => {

                logsPaginaAtual =
                  1;

                carregarLogs();

              },
              350
            );
        }
      );
    }
  }


  // Inicialização dos eventos dos Logs.
  // Não carrega os logs automaticamente aqui.
  // Eles são carregados quando a aba é aberta.

  if(
    document.readyState ===
    'loading'
  ){

    document.addEventListener(
      'DOMContentLoaded',
      inicializarLogs
    );

  }else{

    inicializarLogs();
  }


  // ============================================================
  // APP GLOBAL
  // ============================================================

  window.NICHOS =
    NICHOS;

  window.aplicarNicho =
    aplicarNicho;

  window.atualizarSidebarUsuario =
    atualizarSidebarUsuario;

  window.atualizarAcessoUsuarios =
    atualizarAcessoUsuarios;


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

  /* ============================================================
 * ORVIX — RELATÓRIOS
 * ============================================================ */

let relatoriosCarregando = false;

function formatarMoedaRelatorio(valor) {
  const numero = Number(valor || 0);

  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function escaparHtmlRelatorio(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatarDataRelatorio(data) {
  if (!data) return '-';

  const texto = String(data).slice(0, 10);

  const partes = texto.split('-');

  if (partes.length !== 3) {
    return texto;
  }

  return `${partes[2]}/${partes[1]}`;
}


function obterPeriodoRelatorios() {

  const periodo =
    $('relatorios-periodo')?.value || '30';

  const hoje = new Date();

  const formatarData = (data) => {
    const ano = data.getFullYear();

    const mes = String(
      data.getMonth() + 1
    ).padStart(2, '0');

    const dia = String(
      data.getDate()
    ).padStart(2, '0');

    return `${ano}-${mes}-${dia}`;
  };


  if (periodo === 'personalizado') {

    return {
      data_inicio:
        $('relatorios-data-inicio')?.value || '',

      data_fim:
        $('relatorios-data-fim')?.value || ''
    };
  }


  const dias = Number(periodo || 30);

  const inicio = new Date(hoje);

  inicio.setDate(
    inicio.getDate() - (dias - 1)
  );


  return {
    data_inicio: formatarData(inicio),
    data_fim: formatarData(hoje)
  };
}


function atualizarVisibilidadeDatasRelatorios() {

  const personalizado =
    $('relatorios-periodo')?.value === 'personalizado';

  const inicio =
    $('relatorios-data-inicio-container');

  const fim =
    $('relatorios-data-fim-container');


  if (inicio) {
    inicio.style.display =
      personalizado ? '' : 'none';
  }

  if (fim) {
    fim.style.display =
      personalizado ? '' : 'none';
  }
}


async function carregarRelatorios() {

  if (relatoriosCarregando) {
    return;
  }

  const loading =
    $('relatorios-loading');

  const message =
    $('relatorios-message');


  try {

    relatoriosCarregando = true;


    if (loading) {
      loading.style.display = '';
    }

    if (message) {
      message.style.display = 'none';
      message.textContent = '';
    }


    const periodo =
      obterPeriodoRelatorios();


    if (
      !periodo.data_inicio ||
      !periodo.data_fim
    ) {

      throw new Error(
        'Informe a data inicial e a data final.'
      );
    }


    if (
      periodo.data_inicio >
      periodo.data_fim
    ) {

      throw new Error(
        'A data inicial não pode ser maior que a data final.'
      );
    }


    const params =
      new URLSearchParams();

    params.set(
      'data_inicio',
      periodo.data_inicio
    );

    params.set(
      'data_fim',
      periodo.data_fim
    );


    const resumo =
      await api(
        `/relatorios/resumo?${params.toString()}`
      );


    const financeiro =
      await api(
        `/relatorios/financeiro?${params.toString()}`
      );


    const agendamentos =
      await api(
        `/relatorios/agendamentos?${params.toString()}`
      );


    const servicos =
      await api(
        `/relatorios/servicos?${params.toString()}`
      );


    const indicadores =
      resumo?.indicadores || {};


    if ($('relatorio-faturamento')) {
      $('relatorio-faturamento').textContent =
        formatarMoedaRelatorio(
          indicadores.faturamento
        );
    }


    if ($('relatorio-despesas')) {
      $('relatorio-despesas').textContent =
        formatarMoedaRelatorio(
          indicadores.despesas
        );
    }


    if ($('relatorio-lucro')) {
      $('relatorio-lucro').textContent =
        formatarMoedaRelatorio(
          indicadores.lucro
        );
    }


    if ($('relatorio-agendamentos')) {
      $('relatorio-agendamentos').textContent =
        Number(
          indicadores.total_agendamentos || 0
        ).toLocaleString('pt-BR');
    }


    if ($('relatorio-concluidos')) {
      $('relatorio-concluidos').textContent =
        Number(
          indicadores.agendamentos_concluidos || 0
        ).toLocaleString('pt-BR');
    }


    if ($('relatorio-cancelados')) {
      $('relatorio-cancelados').textContent =
        Number(
          indicadores.agendamentos_cancelados || 0
        ).toLocaleString('pt-BR');
    }


    if ($('relatorio-ticket-medio')) {
      $('relatorio-ticket-medio').textContent =
        formatarMoedaRelatorio(
          indicadores.ticket_medio
        );
    }


    if ($('relatorio-saldo')) {
      $('relatorio-saldo').textContent =
        formatarMoedaRelatorio(
          financeiro?.saldo
        );
    }


    renderizarGraficoRelatorios(
      agendamentos?.dados || []
    );


    renderizarServicosRelatorios(
      servicos?.dados || []
    );


  } catch (erro) {

    console.error(
      '[RELATORIOS] Erro:',
      erro
    );


    if (message) {

      message.textContent =
        erro?.message ||
        'Não foi possível carregar os relatórios.';

      message.style.display = '';
    }

  } finally {

    relatoriosCarregando = false;

    if (loading) {
      loading.style.display = 'none';
    }
  }
}


function renderizarGraficoRelatorios(dados) {

  const container =
    $('relatorio-grafico');


  if (!container) {
    return;
  }


  if (!Array.isArray(dados) || !dados.length) {

    container.innerHTML = `
      <div class="relatorio-grafico-vazio">
        Nenhum dado encontrado no período.
      </div>
    `;

    return;
  }


  const maiorValor =
    Math.max(
      ...dados.map(
        item => Number(item.valor || 0)
      )
    );


  if (maiorValor <= 0) {

    container.innerHTML = `
      <div class="relatorio-grafico-vazio">
        Nenhum faturamento registrado no período.
      </div>
    `;

    return;
  }


  container.innerHTML =
    dados.map(item => {

      const valor =
        Number(item.valor || 0);

      const altura =
        Math.max(
          3,
          (valor / maiorValor) * 170
        );


      const data =
        formatarDataRelatorio(
          item.data
        );


      return `
        <div
          class="relatorio-barra"
          title="${escaparHtmlRelatorio(
            formatarMoedaRelatorio(valor)
          )}"
        >

          <span class="relatorio-barra-valor">
            ${escaparHtmlRelatorio(
              formatarMoedaRelatorio(valor)
            )}
          </span>

          <div
            class="relatorio-barra-coluna"
            style="height:${altura}px"
          ></div>

          <span class="relatorio-barra-data">
            ${escaparHtmlRelatorio(data)}
          </span>

        </div>
      `;

    }).join('');
}


function renderizarServicosRelatorios(dados) {

  const container =
    $('relatorio-servicos');


  if (!container) {
    return;
  }


  if (!Array.isArray(dados) || !dados.length) {

    container.innerHTML = `
      <div class="relatorio-grafico-vazio">
        Nenhum serviço encontrado no período.
      </div>
    `;

    return;
  }


  container.innerHTML =
    dados.map(item => {

      const nome =
        escaparHtmlRelatorio(
          item.nome || 'Serviço'
        );


      const quantidade =
        Number(
          item.quantidade || 0
        );


      const faturamento =
        Number(
          item.faturamento || 0
        );


      return `
        <div class="relatorio-servico">

          <div class="relatorio-servico-nome">
            ${nome}
          </div>

          <div class="relatorio-servico-quantidade">
            ${quantidade.toLocaleString('pt-BR')}
            ${quantidade === 1 ? 'atendimento' : 'atendimentos'}
          </div>

          <div class="relatorio-servico-valor">
            ${formatarMoedaRelatorio(faturamento)}
          </div>

        </div>
      `;

    }).join('');
}

document.addEventListener('DOMContentLoaded', () => {

  const periodo =
    $('relatorios-periodo');

  const atualizar =
    $('btn-atualizar-relatorios');


  periodo?.addEventListener(
    'change',
    () => {

      atualizarVisibilidadeDatasRelatorios();

      if (
        periodo.value !== 'personalizado'
      ) {
        carregarRelatorios();
      }
    }
  );


  $('relatorios-data-inicio')
    ?.addEventListener(
      'change',
      carregarRelatorios
    );


  $('relatorios-data-fim')
    ?.addEventListener(
      'change',
      carregarRelatorios
    );


  atualizar?.addEventListener(
    'click',
    carregarRelatorios
  );


  atualizarVisibilidadeDatasRelatorios();

});

// ============================================================
// CARREGAR DASHBOARD
// ============================================================

async function carregarDashboard() {

  if (dashboardCarregando) {
    return;
  }

  dashboardCarregando = true;


  const loading =
    document.getElementById(
      'dashboard-loading'
    );

  const message =
    document.getElementById(
      'dashboard-message'
    );


  if (loading) {
    loading.style.display = 'block';
  }

  if (message) {

    message.style.display =
      'none';

    message.textContent =
      '';

  }


  try {

    const periodo =
      obterPeriodoDashboard();


    if (
      !periodo.data_inicio ||
      !periodo.data_fim
    ) {

      throw new Error(
        'Informe as duas datas do período.'
      );

    }


    const params =
      new URLSearchParams({

        data_inicio:
          periodo.data_inicio,

        data_fim:
          periodo.data_fim

      });


    const resposta =
      await api(
        `/dashboard?${params.toString()}`
      );


    if (!resposta || !resposta.resumo) {

      throw new Error(
        'Resposta inválida do dashboard.'
      );

    }


    const resumo =
      resposta.resumo;


    // ========================================================
    // CARDS
    // ========================================================

    const faturamento =
      document.getElementById(
        'dashboard-faturamento'
      );

    const despesas =
      document.getElementById(
        'dashboard-despesas'
      );

    const resultado =
      document.getElementById(
        'dashboard-resultado'
      );

    const agendamentos =
      document.getElementById(
        'dashboard-agendamentos'
      );

    const concluidos =
      document.getElementById(
        'dashboard-concluidos'
      );

    const cancelados =
      document.getElementById(
        'dashboard-cancelados'
      );

    const pendentes =
      document.getElementById(
        'dashboard-pendentes'
      );

    const ticket =
      document.getElementById(
        'dashboard-ticket-medio'
      );

    const pago =
      document.getElementById(
        'dashboard-pago'
      );

    const pendente =
      document.getElementById(
        'dashboard-pendente'
      );


    if (faturamento) {

      faturamento.textContent =
        formatarMoedaDashboard(
          resumo.faturamento
        );

    }


    if (despesas) {

      despesas.textContent =
        formatarMoedaDashboard(
          resumo.despesas
        );

    }


    if (resultado) {

      resultado.textContent =
        formatarMoedaDashboard(
          resumo.resultado
        );

    }


    if (agendamentos) {

      agendamentos.textContent =
        Number(
          resumo.agendamentos || 0
        ).toLocaleString('pt-BR');

    }


    if (concluidos) {

      concluidos.textContent =
        Number(
          resumo.concluidos || 0
        ).toLocaleString('pt-BR');

    }


    if (cancelados) {

      cancelados.textContent =
        Number(
          resumo.cancelados || 0
        ).toLocaleString('pt-BR');

    }


    if (pendentes) {

      pendentes.textContent =
        Number(
          resumo.pendentes || 0
        ).toLocaleString('pt-BR');

    }


    if (ticket) {

      ticket.textContent =
        formatarMoedaDashboard(
          resumo.ticket_medio
        );

    }


    if (pago) {

      pago.textContent =
        formatarMoedaDashboard(
          resumo.valor_pago
        );

    }


    if (pendente) {

      pendente.textContent =
        formatarMoedaDashboard(
          resumo.valor_pendente
        );

    }


    // ========================================================
    // GRÁFICO
    // ========================================================

    renderizarMovimentacaoDashboard(
      resposta.movimentacao || []
    );


    // ========================================================
    // SERVIÇOS
    // ========================================================

    renderizarServicosDashboard(
      resposta.servicos || []
    );


    // ========================================================
    // AGENDAMENTOS RECENTES
    // ========================================================

    renderizarRecentesDashboard(
      resposta.recentes || []
    );


  } catch (err) {

    console.error(
      'Erro ao carregar dashboard:',
      err
    );


    if (message) {

      message.textContent =
        err?.message ||
        'Não foi possível carregar o dashboard.';

      message.style.display =
        'block';

    }

  } finally {

    dashboardCarregando =
      false;

    if (loading) {
      loading.style.display =
        'none';
    }

  }

}


// ============================================================
// GRÁFICO
// ============================================================


function renderizarMovimentacaoDashboard(dados) {
  const container = document.getElementById('dashboard-grafico');
  if (!container) return;

  if (!Array.isArray(dados) || dados.length === 0) {
    container.innerHTML = `
      <div class="dashboard-grafico-vazio">
        Nenhuma movimentação encontrada para o período.
      </div>
    `;
    return;
  }

  const valores = dados.flatMap(item => [
    Number(item.faturamento || 0),
    Number(item.despesas || 0),
    Number(item.resultado || 0)
  ]);

  const maximo = Math.max(0, ...valores);
  const minimo = Math.min(0, ...valores);
  const amplitude = maximo - minimo || 1;

  const largura = 900;
  const altura = 300;
  const margem = { top: 20, right: 24, bottom: 42, left: 70 };

  const areaLargura = largura - margem.left - margem.right;
  const areaAltura = altura - margem.top - margem.bottom;

  const x = i => margem.left +
    (dados.length === 1 ? areaLargura / 2 : i * areaLargura / (dados.length - 1));

  const y = valor => margem.top +
    ((maximo - valor) / amplitude) * areaAltura;

  const formatarMoeda = valor =>
    Number(valor).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0
    });

  const formatarDia = data => {
    const partes = String(data).slice(0, 10).split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}` : data;
  };

  const series = [
    { chave: 'faturamento', nome: 'Faturamento', classe: 'faturamento' },
    { chave: 'despesas', nome: 'Despesas', classe: 'despesas' },
    { chave: 'resultado', nome: 'Resultado', classe: 'resultado' }
  ];

  const linha = chave => dados.map((item, i) =>
    `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(Number(item[chave] || 0))}`
  ).join(' ');

  const grade = Array.from({ length: 5 }, (_, i) => {
    const valor = maximo - (amplitude * i / 4);
    const posY = margem.top + (areaAltura * i / 4);

    return `
      <line x1="${margem.left}" y1="${posY}"
        x2="${largura - margem.right}" y2="${posY}"
        class="mov-grade" />
      <text x="${margem.left - 10}" y="${posY + 4}"
        text-anchor="end" class="mov-eixo">
        ${formatarMoeda(valor)}
      </text>
    `;
  }).join('');

  const passoRotulo = Math.max(1, Math.ceil(dados.length / 8));

  const rotulos = dados.map((item, i) => {
    if (i % passoRotulo !== 0 && i !== dados.length - 1) return '';

    return `
      <text x="${x(i)}" y="${altura - 12}"
        text-anchor="middle" class="mov-eixo">
        ${formatarDia(item.data)}
      </text>
    `;
  }).join('');

  const caminhos = series.map(serie => `
    <path
      d="${linha(serie.chave)}"
      class="mov-linha mov-${serie.classe}"
    />
    ${dados.map((item, i) => `
      <circle
        cx="${x(i)}"
        cy="${y(Number(item[serie.chave] || 0))}"
        r="3"
        class="mov-ponto mov-${serie.classe}"
      >
        <title>${formatarDia(item.data)} — ${serie.nome}: ${formatarMoeda(item[serie.chave] || 0)}</title>
      </circle>
    `).join('')}
  `).join('');

  const totais = series.map(serie => {
    const total = dados.reduce(
      (soma, item) => soma + Number(item[serie.chave] || 0),
      0
    );

    return `
      <div class="mov-resumo-item">
        <span class="mov-legenda mov-${serie.classe}"></span>
        <span>${serie.nome}</span>
        <strong>${formatarMoeda(total)}</strong>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="movimentacao-dashboard">
      <div class="mov-resumo">
        ${totais}
      </div>

      <div class="mov-grafico-scroll">
        <svg
          class="mov-svg"
          viewBox="0 0 ${largura} ${altura}"
          role="img"
          aria-label="Gráfico diário de faturamento, despesas e resultado"
        >
          ${grade}
          ${caminhos}
          ${rotulos}
        </svg>
      </div>
    </div>
  `;
}


// ============================================================
// SERVIÇOS
// ============================================================

function renderizarServicosDashboard(
  dados
) {

  const container =
    document.getElementById(
      'dashboard-servicos'
    );

  if (!container) {
    return;
  }


  if (!dados.length) {

    container.innerHTML = `
      <div class="dashboard-empty">
        Nenhum serviço encontrado.
      </div>
    `;

    return;
  }


  const maior =
    Math.max(
      ...dados.map(
        item =>
          Number(
            item.faturamento || 0
          )
      ),
      1
    );


  container.innerHTML =
    dados.map(item => {

      const valor =
        Number(
          item.faturamento || 0
        );

      const largura =
        Math.max(
          (valor / maior) * 100,
          valor > 0 ? 2 : 0
        );


      return `
        <div class="dashboard-ranking-item">

          <div class="dashboard-ranking-top">

            <strong>
              ${escaparHtmlDashboard(item.nome)}
            </strong>

            <span>
              ${formatarMoedaDashboard(valor)}
            </span>

          </div>

          <div class="dashboard-ranking-bar">

            <div
              style="width:${largura}%"
            ></div>

          </div>

          <small>
            ${Number(item.quantidade || 0)}
            atendimento(s)
          </small>

        </div>
      `;

    }).join('');

}


// ============================================================
// AGENDAMENTOS RECENTES
// ============================================================

function renderizarRecentesDashboard(
  dados
) {

  const container =
    document.getElementById(
      'dashboard-recentes'
    );

  if (!container) {
    return;
  }


  if (!dados.length) {

    container.innerHTML = `
      <div class="dashboard-empty">
        Nenhum agendamento encontrado.
      </div>
    `;

    return;
  }


  container.innerHTML =
    dados.map(item => {

      const cliente =
        escaparHtmlDashboard(
          item.cliente || 'Cliente'
        );

      const servico =
        escaparHtmlDashboard(
          item.servico_nome ||
          'Serviço'
        );

      const status =
        escaparHtmlDashboard(
          item.status ||
          'Pendente'
        );


      return `
        <div class="dashboard-recent-item">

          <div class="dashboard-recent-main">

            <strong>
              ${cliente}
            </strong>

            <span>
              ${servico}
            </span>

          </div>

          <div class="dashboard-recent-side">

            <strong>
              ${formatarMoedaDashboard(item.valor)}
            </strong>

            <span>
              ${formatarDataDashboard(item.data)}
              ${item.hora ? ` · ${escaparHtmlDashboard(item.hora)}` : ''}
            </span>

          </div>

          <span class="dashboard-status">
            ${status}
          </span>

        </div>
      `;

    }).join('');

}


// ============================================================
// EVENTOS
// ============================================================

document.addEventListener(
  'DOMContentLoaded',
  () => {

    const periodo =
      document.getElementById(
        'dashboard-periodo'
      );

    const atualizar =
      document.getElementById(
        'btn-atualizar-dashboard'
      );


    if (periodo) {

      periodo.addEventListener(
        'change',
        () => {

          atualizarDatasDashboard();

          carregarDashboard();

          renderizarMovimentacaoDashboard(dados.movimentacao);
        }
      );

    }


    if (atualizar) {

      atualizar.addEventListener(
        'click',
        () => {

          carregarDashboard();

          renderizarMovimentacaoDashboard(dados.movimentacao);

        }
      );

    }


    atualizarDatasDashboard();

    

  }
);


  // ============================================================
  // INICIALIZAÇÃO DO SISTEMA
  // ============================================================

  async function iniciarSistema(){

    const assinaturaLiberada =
      await verificarAssinaturaObrigatoria();

    if(!connectionInterval){

      connectionInterval =
        setInterval(
          checkConnection,
          30000
        );
    }

    if(!assinaturaLiberada){
      return;
    }

    checkConnection();

    atualizarSidebarUsuario();

    try{

      await loadServices();

      await refreshAgenda();

      await refreshSideStats();

    }catch(error){

      console.error(
        'Erro ao iniciar o sistema:',
        error
      );
    }

    try{

      await window
        .OrvixConfiguracoes
        ?.carregarConfiguracoes
        ?.();

    }catch(error){

      console.warn(
        'Não foi possível carregar as configurações:',
        error
      );
    }
  }


  // ============================================================
  // INICIALIZAÇÃO COM AUTENTICAÇÃO
  // ============================================================

  (async function initAuth(){

    const autenticado =
      await verificarSessao();

    if(autenticado){

      await iniciarSistema();
    }

  })();


  // ============================================================
  // LOGOUT
  // ============================================================

  $('btn-logout')
    ?.addEventListener(
      'click',
      () => {

        if(
          !confirm(
            'Deseja sair da sua conta?'
          )
        ){
          return;
        }

        localStorage.removeItem(
          AUTH_TOKEN_KEY
        );
        
        window.dispatchEvent(new Event('orvix:sessao-alterada'));

        usuarioLogado =
          null;

        empresaLogada =
          null;

        window.location.reload();
      }
    );


  // ============================================================
  // SIDEBAR / MENU
  // ============================================================

  const sidebar =
    $('sidebar');

  const sidebarToggle =
    $('sidebar-toggle');

  const mobileMenuBtn =
    $('mobile-menu-btn');

  const sidebarOverlay =
    $('sidebar-overlay');


  if(
    sidebar &&
    sidebarToggle
  ){

    sidebarToggle.addEventListener(
      'click',
      () => {

        if(
          window.innerWidth <= 760
        ){

          sidebar.classList.remove(
            'mobile-open'
          );

          sidebarOverlay
            ?.classList
            .remove('active');

          return;
        }

        sidebar.classList.toggle(
          'collapsed'
        );

        localStorage.setItem(
          'lavajato-sidebar-collapsed',
          sidebar.classList.contains(
            'collapsed'
          )
        );
      }
    );
  }


  if(
    mobileMenuBtn &&
    sidebar
  ){

    mobileMenuBtn.addEventListener(
      'click',
      () => {

        sidebar.classList.add(
          'mobile-open'
        );

        sidebarOverlay
          ?.classList
          .add('active');
      }
    );
  }


  if(
    sidebarOverlay &&
    sidebar
  ){

    sidebarOverlay.addEventListener(
      'click',
      () => {

        sidebar.classList.remove(
          'mobile-open'
        );

        sidebarOverlay.classList.remove(
          'active'
        );
      }
    );
  }


  document
    .querySelectorAll(
      '.sidebar .nav-btn'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            if(
              window.innerWidth <= 760
            ){

              sidebar
                ?.classList
                .remove(
                  'mobile-open'
                );

              sidebarOverlay
                ?.classList
                .remove(
                  'active'
                );
            }
          }
        );
      }
    );


  if(
    sidebar &&
    window.innerWidth > 760 &&
    localStorage.getItem(
      'lavajato-sidebar-collapsed'
    ) === 'true'
  ){

    sidebar.classList.add(
      'collapsed'
    );
  }


  window.addEventListener(
    'resize',
    () => {

      if(
        window.innerWidth > 760
      ){

        sidebar
          ?.classList
          .remove(
            'mobile-open'
          );

        sidebarOverlay
          ?.classList
          .remove(
            'active'
          );
      }
    }
  );

  // ============================================================
// DASHBOARD
// ============================================================

let dashboardCarregando = false;


// ============================================================
// FORMATAÇÃO
// ============================================================

function formatarMoedaDashboard(valor) {

  const numero =
    Number(valor || 0);

  return numero.toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  );
}


function escaparHtmlDashboard(valor) {

  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

}


function formatarDataDashboard(valor) {

  if (!valor) {
    return '-';
  }

  const partes =
    String(valor)
      .slice(0, 10)
      .split('-');

  if (partes.length !== 3) {
    return valor;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;

}


// ============================================================
// PERÍODO
// ============================================================

function obterPeriodoDashboard() {

  const periodo =
    document.getElementById(
      'dashboard-periodo'
    )?.value || '30';

  if (periodo === 'personalizado') {

    return {

      data_inicio:
        document.getElementById(
          'dashboard-data-inicio'
        )?.value || '',

      data_fim:
        document.getElementById(
          'dashboard-data-fim'
        )?.value || ''

    };

  }


  const hoje =
    new Date();

  const inicio =
    new Date(hoje);

  inicio.setDate(
    inicio.getDate() -
    (Number(periodo) - 1)
  );


  const formatar =
    data =>
      data.toISOString()
        .slice(0, 10);


  return {

    data_inicio:
      formatar(inicio),

    data_fim:
      formatar(hoje)

  };

}


// ============================================================
// VISIBILIDADE DAS DATAS
// ============================================================

function atualizarDatasDashboard() {

  const periodo =
    document.getElementById(
      'dashboard-periodo'
    )?.value;

  const container =
    document.getElementById(
      'dashboard-datas'
    );

  if (!container) {
    return;
  }

  container.style.display =
    periodo === 'personalizado'
      ? 'grid'
      : 'none';

}




/* =========================================================
   ORVIX — CENTRAL DE NOTIFICAÇÕES
   Compatível com lavajato_auth_token
   ========================================================= */

(() => {
    'use strict';

    const TOKEN_KEY = 'lavajato_auth_token';
    const API_BASE = '/api';
    const INTERVALO_ATUALIZACAO = 60000;

    const container = document.getElementById('notificacoes-container');
    const btn = document.getElementById('btn-notificacoes');
    const painel = document.getElementById('painel-notificacoes');
    const contador = document.getElementById('notificacoes-contador');
    const resumo = document.getElementById('notificacoes-resumo');
    const lista = document.getElementById('notificacoes-lista');
    const btnFechar = document.getElementById('btn-notificacoes-fechar');
    const btnTodasLidas = document.getElementById('btn-notificacoes-lidas');

    if (!container || !btn || !painel || !lista) {
        console.warn(
            '[Orvix] Central de notificações: elementos HTML não encontrados.'
        );
        return;
    }

    let notificacoes = [];
    let carregando = false;
    let atualizacaoPendente = false;
    let intervalo = null;
    let sessaoAnterior = null;
    let requisicaoAtual = 0;

    /* =====================================================
       SESSÃO
       ===================================================== */

    function obterToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function telaAutenticacaoVisivel() {
        const tela = document.getElementById('auth-screen');

        if (!tela) return false;

        return window.getComputedStyle(tela).display !== 'none';
    }

    function usuarioAutenticado() {
        return Boolean(obterToken()) && !telaAutenticacaoVisivel();
    }

    function ocultarCentral() {
        container.hidden = true;
        container.style.display = 'none';

        painel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');

        notificacoes = [];

        if (contador) {
            contador.textContent = '0';
            contador.hidden = true;
        }

        if (resumo) {
            resumo.textContent = 'Entre na sua conta para ver notificações';
        }

        lista.innerHTML = '';
    }

    function mostrarCentral() {
        container.hidden = false;
        container.style.display = '';
    }

    function sincronizarSessao() {
        const autenticado = usuarioAutenticado();

        if (!autenticado) {
            if (sessaoAnterior !== false) {
                requisicaoAtual++;
                carregando = false;
                atualizacaoPendente = false;
                notificacoes = [];
            }

            sessaoAnterior = false;
            ocultarCentral();
            return false;
        }

        mostrarCentral();

        if (sessaoAnterior !== true) {
            sessaoAnterior = true;
            carregarNotificacoes();
        }

        return true;
    }

    /* =====================================================
       REQUISIÇÕES
       ===================================================== */

    async function requisitar(path, options = {}, tokenEsperado = obterToken()) {
        if (!tokenEsperado || !usuarioAutenticado()) {
            throw new Error('Sessão não autenticada.');
        }

        const headers = {
            Accept: 'application/json',
            ...(options.headers || {}),
            Authorization: `Bearer ${tokenEsperado}`
        };

        if (options.body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }

        const resposta = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers,
            cache: 'no-store'
        });

        // Impede que uma resposta de outra sessão seja exibida.
        if (obterToken() !== tokenEsperado) {
            throw new Error('A sessão foi alterada.');
        }

        if (resposta.status === 401) {
            localStorage.removeItem(TOKEN_KEY);

            window.dispatchEvent(
                new Event('orvix:sessao-alterada')
            );

            throw new Error('Sessão expirada. Entre novamente.');
        }

        if (resposta.status === 403) {
            throw new Error('Acesso às notificações não autorizado.');
        }

        if (!resposta.ok) {
            let mensagem = 'Não foi possível concluir a requisição.';

            try {
                const dados = await resposta.clone().json();
                mensagem = dados.erro || mensagem;
            } catch (_) {}

            const erro = new Error(mensagem);
            erro.status = resposta.status;
            throw erro;
        }

        if (resposta.status === 204) {
            return null;
        }

        return resposta.json();
    }

    /* =====================================================
       FORMATAÇÃO E SEGURANÇA HTML
       ===================================================== */

    function escaparHTML(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[caractere]);
    }

    function formatarData(valor) {
        if (!valor) return '';

        const data = new Date(valor);

        if (Number.isNaN(data.getTime())) return '';

        return data.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function mostrarMensagem(mensagem) {
        lista.innerHTML =
            `<p class="notificacoes-vazio">${escaparHTML(mensagem)}</p>`;
    }

    function atualizarContador(total) {
        const quantidade = Math.max(0, Number(total) || 0);

        if (contador) {
            contador.textContent = quantidade > 99
                ? '99+'
                : String(quantidade);

            contador.hidden = quantidade === 0;
        }

        if (resumo) {
            resumo.textContent = quantidade === 0
                ? 'Nenhuma notificação pendente'
                : `${quantidade} não lida${quantidade === 1 ? '' : 's'}`;
        }
    }

    function renderizarNotificacoes() {
        if (!notificacoes.length) {
            mostrarMensagem('Nenhuma notificação por enquanto.');
            return;
        }

        lista.innerHTML = notificacoes.map(notificacao => {
            const naoLida = !notificacao.lida_em;

            return `
                <article
                    class="notificacao-item ${naoLida ? 'nao-lida' : ''}"
                    data-notificacao-id="${escaparHTML(notificacao.id)}"
                    data-notificacao-link="${escaparHTML(notificacao.link || '')}"
                    role="button"
                    tabindex="0"
                    aria-label="${escaparHTML(notificacao.titulo)}"
                >
                    <h4 class="notificacao-titulo">
                        ${escaparHTML(notificacao.titulo)}
                    </h4>

                    <p class="notificacao-mensagem">
                        ${escaparHTML(notificacao.mensagem)}
                    </p>

                    <time class="notificacao-data">
                        ${escaparHTML(formatarData(notificacao.criado_em))}
                    </time>
                </article>
            `;
        }).join('');
    }

    /* =====================================================
       CARREGAR NOTIFICAÇÕES
       ===================================================== */

    async function carregarNotificacoes() {
        if (!sincronizarSessao()) return;

        if (carregando) {
            atualizacaoPendente = true;
            return;
        }

        const token = obterToken();
        const idRequisicao = ++requisicaoAtual;

        carregando = true;
        mostrarMensagem('Carregando notificações...');

        try {
            const [dados, contagem] = await Promise.all([
                requisitar(
                    '/notificacoes?pagina=1&limite=20',
                    {},
                    token
                ),
                requisitar(
                    '/notificacoes/contador',
                    {},
                    token
                )
            ]);

            if (
                idRequisicao !== requisicaoAtual ||
                obterToken() !== token ||
                !usuarioAutenticado()
            ) {
                return;
            }

            notificacoes = Array.isArray(dados?.notificacoes)
                ? dados.notificacoes
                : [];

            atualizarContador(contagem?.nao_lidas);
            renderizarNotificacoes();

        } catch (erro) {
            if (
                idRequisicao !== requisicaoAtual ||
                obterToken() !== token
            ) {
                return;
            }

            if (!usuarioAutenticado()) {
                sincronizarSessao();
                return;
            }

            console.error(
                '[Orvix] Erro ao carregar notificações:',
                erro
            );

            mostrarMensagem(
                erro.status === 403
                    ? 'Você não tem autorização para consultar as notificações.'
                    : 'Não foi possível carregar as notificações. Tente novamente.'
            );

        } finally {
            if (idRequisicao === requisicaoAtual) {
                carregando = false;

                if (atualizacaoPendente) {
                    atualizacaoPendente = false;

                    if (usuarioAutenticado()) {
                        carregarNotificacoes();
                    }
                }
            }
        }
    }

    /* =====================================================
       MARCAR COMO LIDA
       ===================================================== */

    async function marcarComoLida(id) {
        if (!sincronizarSessao()) return;

        const token = obterToken();

        try {
            await requisitar(
                `/notificacoes/${encodeURIComponent(id)}/lida`,
                { method: 'PATCH' },
                token
            );

            if (
                obterToken() === token &&
                usuarioAutenticado()
            ) {
                await carregarNotificacoes();
            }
        } catch (erro) {
            console.error(
                '[Orvix] Erro ao marcar notificação como lida:',
                erro
            );
        }
    }

    async function marcarTodasComoLidas() {
        if (!sincronizarSessao()) return;

        const token = obterToken();

        if (btnTodasLidas) {
            btnTodasLidas.disabled = true;
        }

        try {
            await requisitar(
                '/notificacoes/lidas/todas',
                { method: 'PATCH' },
                token
            );

            if (
                obterToken() === token &&
                usuarioAutenticado()
            ) {
                await carregarNotificacoes();
            }
        } catch (erro) {
            console.error(
                '[Orvix] Erro ao marcar todas como lidas:',
                erro
            );
        } finally {
            if (btnTodasLidas) {
                btnTodasLidas.disabled = false;
            }
        }
    }

    /* =====================================================
       ABRIR NOTIFICAÇÃO
       ===================================================== */

    async function abrirNotificacao(elemento) {
        if (!sincronizarSessao()) return;

        const id = elemento.dataset.notificacaoId;
        const link = elemento.dataset.notificacaoLink;

        const notificacao = notificacoes.find(
            item => String(item.id) === String(id)
        );

        if (notificacao && !notificacao.lida_em) {
            await marcarComoLida(id);
        }

        if (!usuarioAutenticado()) return;

        if (link) {
            // Somente caminhos internos; evita redirecionamento externo.
            if (link.startsWith('/') && !link.startsWith('//')) {
                window.location.assign(link);
            } else {
                console.warn(
                    '[Orvix] Link inválido ignorado:',
                    link
                );
            }
        }
    }

    /* =====================================================
       EVENTOS DA INTERFACE
       ===================================================== */

    btn.addEventListener('click', async () => {
        if (!sincronizarSessao()) return;

        const abrir = painel.hidden;

        painel.hidden = !abrir;
        btn.setAttribute('aria-expanded', String(abrir));

        if (abrir) {
            await carregarNotificacoes();
        }
    });

    btnFechar?.addEventListener('click', () => {
        painel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
    });

    lista.addEventListener('click', async evento => {
        const item = evento.target.closest('.notificacao-item');

        if (item) {
            await abrirNotificacao(item);
        }
    });

    lista.addEventListener('keydown', async evento => {
        if (evento.key !== 'Enter' && evento.key !== ' ') return;

        const item = evento.target.closest('.notificacao-item');
        if (!item) return;

        evento.preventDefault();
        await abrirNotificacao(item);
    });

    btnTodasLidas?.addEventListener(
        'click',
        marcarTodasComoLidas
    );

    document.addEventListener('click', evento => {
        if (
            !painel.hidden &&
            !evento.target.closest('#notificacoes-container')
        ) {
            painel.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
        }
    });

    /* =====================================================
       LOGIN, LOGOUT E TROCA DE CONTA
       ===================================================== */

    window.addEventListener('orvix:sessao-alterada', () => {
        sessaoAnterior = null;
        sincronizarSessao();
    });

    window.addEventListener('storage', evento => {
        if (evento.key === TOKEN_KEY || evento.key === null) {
            sessaoAnterior = null;
            sincronizarSessao();
        }
    });

    /*
     * Ao voltar para a aba, verifica a sessão e atualiza a lista.
     */
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && sincronizarSessao()) {
            carregarNotificacoes();
        }
    });

    /*
     * Observa a tela de login. Isso cobre os casos em que
     * showAuthScreen() / hideAuthScreen() alteram sua exibição.
     */
    const telaAuth = document.getElementById('auth-screen');

    if (telaAuth && typeof MutationObserver !== 'undefined') {
        const observador = new MutationObserver(() => {
            sincronizarSessao();
        });

        observador.observe(telaAuth, {
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden']
        });
    }

    /*
     * Inicialização e atualização periódica.
     */
    sincronizarSessao();

    intervalo = window.setInterval(() => {
        if (sincronizarSessao()) {
            carregarNotificacoes();
        }
    }, INTERVALO_ATUALIZACAO);

    /*
     * Não deixa o intervalo continuar após a página ser encerrada.
     */
    window.addEventListener('pagehide', () => {
        if (intervalo !== null) {
            window.clearInterval(intervalo);
            intervalo = null;
        }
    });
})();
})();