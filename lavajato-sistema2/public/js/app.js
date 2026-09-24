(function(){
  "use strict";

  const API = '/api';
  const AUTH_TOKEN_KEY = 'lavajato_auth_token';

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


  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  function $(selector){
    return document.querySelector(selector);
  }


  function $$(selector){
    return Array.from(
      document.querySelectorAll(selector)
    );
  }


  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }


  function money(value){
    return Number(value || 0).toLocaleString(
      'pt-BR',
      {
        style:'currency',
        currency:'BRL'
      }
    );
  }


  function todayISO(){

    const now =
      new Date();

    const year =
      now.getFullYear();

    const month =
      String(
        now.getMonth() + 1
      ).padStart(2,'0');

    const day =
      String(
        now.getDate()
      ).padStart(2,'0');

    return `${year}-${month}-${day}`;
  }


  function formatDateBR(value){

    if(!value){
      return '';
    }

    const parts =
      String(value).slice(0,10).split('-');

    if(parts.length !== 3){
      return value;
    }

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }


  function formatTime(value){

    if(!value){
      return '';
    }

    return String(value).slice(0,5);
  }


  function isAdministrador(){

    return (
      usuarioLogado?.perfil ===
      'administrador'
    );

  }


  function isFuncionario(){

    return (
      usuarioLogado?.perfil ===
      'funcionario'
    );

  }


  // ============================================================
  // API
  // ============================================================

  async function api(
    endpoint,
    options = {}
  ){

    const headers = {
      'Content-Type':'application/json',
      ...(options.headers || {})
    };


    const token =
      localStorage.getItem(
        AUTH_TOKEN_KEY
      );


    if(token){

      headers.Authorization =
        'Bearer ' + token;

    }


    const response =
      await fetch(
        API + endpoint,
        {
          ...options,
          headers
        }
      );


    let data = null;

    const contentType =
      response.headers.get(
        'content-type'
      ) || '';


    if(
      contentType.includes(
        'application/json'
      )
    ){

      data =
        await response.json();

    }else{

      const text =
        await response.text();

      data =
        text
          ? { mensagem:text }
          : null;

    }


    if(!response.ok){

      if(
        response.status === 401 &&
        endpoint !== '/auth/login' &&
        endpoint !== '/auth/register'
      ){

        localStorage.removeItem(
          AUTH_TOKEN_KEY
        );

        usuarioLogado = null;
        empresaLogada = null;

        showAuth();

      }


      const message =
        data?.erro ||
        data?.message ||
        data?.mensagem ||
        `Erro HTTP ${response.status}`;


      throw new Error(
        message
      );

    }


    return data;
  }


  // ============================================================
  // ELEMENTOS DE AUTENTICAÇÃO
  // ============================================================

  const authScreen =
    document.getElementById(
      'auth-screen'
    );


  const appScreen =
    document.getElementById(
      'app-screen'
    );


  const loginForm =
    document.getElementById(
      'login-form'
    );


  const registerForm =
    document.getElementById(
      'register-form'
    );


  const loginError =
    document.getElementById(
      'login-error'
    );


  const registerError =
    document.getElementById(
      'register-error'
    );


  const loginSubmit =
    document.getElementById(
      'login-submit'
    );


  const registerSubmit =
    document.getElementById(
      'register-submit'
    );


  const showRegisterBtn =
    document.getElementById(
      'show-register'
    );


  const showLoginBtn =
    document.getElementById(
      'show-login'
    );


  // ============================================================
  // AUTENTICAÇÃO
  // ============================================================

  function showAuth(){

    if(authScreen){
      authScreen.style.display =
        'flex';
    }

    if(appScreen){
      appScreen.style.display =
        'none';
    }

  }


  function showApp(){

    if(authScreen){
      authScreen.style.display =
        'none';
    }

    if(appScreen){
      appScreen.style.display =
        '';
    }

  }


  function clearAuthError(element){

    if(!element){
      return;
    }

    element.textContent = '';
    element.classList.remove(
      'active'
    );

  }


  function showAuthError(
    element,
    message
  ){

    if(!element){
      return;
    }

    element.textContent =
      message || '';

    element.classList.toggle(
      'active',
      Boolean(message)
    );

  }


  async function carregarSessao(){

    const token =
      localStorage.getItem(
        AUTH_TOKEN_KEY
      );


    if(!token){

      showAuth();

      return false;

    }


    try{

      const resposta =
        await api(
          '/auth/me'
        );


      usuarioLogado =
        resposta.usuario ||
        resposta;


      empresaLogada =
        resposta.empresa ||
        usuarioLogado?.empresa ||
        null;


      showApp();

      atualizarDadosUsuario();

      await inicializarAplicacao();

      return true;


    }catch(error){

      localStorage.removeItem(
        AUTH_TOKEN_KEY
      );

      usuarioLogado = null;
      empresaLogada = null;

      showAuth();

      return false;

    }

  }


  // ============================================================
  // DADOS DO USUÁRIO
  // ============================================================

  function atualizarDadosUsuario(){

    const empresaElement =
      document.getElementById(
        'sidebar-company'
      );


    const nomeElement =
      document.getElementById(
        'sidebar-user-name'
      );


    const perfilElement =
      document.getElementById(
        'sidebar-user-profile'
      );


    const avatarElement =
      document.getElementById(
        'sidebar-user-avatar'
      );


    if(
      empresaElement &&
      empresaLogada
    ){

      empresaElement.textContent =
        empresaLogada.nome ||
        'Minha empresa';

    }


    if(
      nomeElement &&
      usuarioLogado
    ){

      nomeElement.textContent =
        usuarioLogado.nome ||
        'Usuário';

    }


    if(
      perfilElement &&
      usuarioLogado
    ){

      perfilElement.textContent =
        usuarioLogado.perfil ===
        'administrador'
          ? 'Administrador'
          : 'Funcionário';

    }


    if(
      avatarElement &&
      usuarioLogado
    ){

      const nome =
        usuarioLogado.nome ||
        'U';


      avatarElement.textContent =
        nome
          .charAt(0)
          .toUpperCase();

    }


    atualizarAcessoUsuarios();

  }


  // ============================================================
  // ACESSO À ÁREA DE USUÁRIOS
  // ============================================================

  function atualizarAcessoUsuarios(){

    const btn =
      document.getElementById(
        'nav-usuarios'
      );


    if(!btn){
      return;
    }


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

        goToTab(
          'agenda'
        );

      }

    }

  }


  // ------------------------------------------------------------
  // MOSTRAR CADASTRO
  // ------------------------------------------------------------

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


      clearAuthError(
        loginError
      );


      clearAuthError(
        registerError
      );


      const subtitle =
        document.getElementById(
          'auth-subtitle'
        );


      if(subtitle){

        subtitle.textContent =
          'Crie sua conta e sua lavação';

      }

    }
  );


  // ------------------------------------------------------------
  // MOSTRAR LOGIN
  // ------------------------------------------------------------

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


      clearAuthError(
        loginError
      );


      clearAuthError(
        registerError
      );


      const subtitle =
        document.getElementById(
          'auth-subtitle'
        );


      if(subtitle){

        subtitle.textContent =
          'Entre na sua conta para continuar';

      }

    }
  );


  // ------------------------------------------------------------
  // LOGIN
  // ------------------------------------------------------------

  loginForm?.addEventListener(
    'submit',
    async event => {

      event.preventDefault();

      clearAuthError(
        loginError
      );


      if(loginSubmit){

        loginSubmit.disabled =
          true;

        loginSubmit.textContent =
          'Entrando...';

      }


      const email =
        document.getElementById(
          'login-email'
        )?.value.trim();


      const senha =
        document.getElementById(
          'login-password'
        )?.value;


      try{

        const resposta =
          await api(
            '/auth/login',
            {
              method:'POST',

              body:
                JSON.stringify({
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
          resposta.usuario ||
          null;


        empresaLogada =
          resposta.empresa ||
          usuarioLogado?.empresa ||
          null;


        showApp();

        atualizarDadosUsuario();

        await inicializarAplicacao();


      }catch(error){

        showAuthError(
          loginError,
          error.message
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


  // ------------------------------------------------------------
  // CADASTRO
  // ------------------------------------------------------------

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
          'Criando...';

      }


      const empresaNome =
        document.getElementById(
          'register-company'
        )?.value.trim();


      const nome =
        document.getElementById(
          'register-name'
        )?.value.trim();


      const email =
        document.getElementById(
          'register-email'
        )?.value.trim();


      const senha =
        document.getElementById(
          'register-password'
        )?.value;


      try{

        const resposta =
          await api(
            '/auth/register',
            {
              method:'POST',

              body:
                JSON.stringify({
                  empresaNome,
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
          resposta.usuario ||
          null;


        empresaLogada =
          resposta.empresa ||
          null;


        showApp();

        atualizarDadosUsuario();

        await inicializarAplicacao();


      }catch(error){

        showAuthError(
          registerError,
          error.message
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
  // LOGOUT
  // ============================================================

  document
    .getElementById(
      'btn-logout'
    )
    ?.addEventListener(
      'click',
      () => {

        localStorage.removeItem(
          AUTH_TOKEN_KEY
        );

        usuarioLogado = null;
        empresaLogada = null;

        showAuth();

      }
    );


  // ============================================================
  // SIDEBAR / NAVEGAÇÃO
  // ============================================================

  function goToTab(
    tab
  ){

    activeTab =
      tab;


    $$('.nav-item').forEach(
      item => {

        item.classList.toggle(
          'active',
          item.dataset.tab ===
          tab
        );

      }
    );


    $$('.tab-panel').forEach(
      panel => {

        panel.classList.toggle(
          'active',
          panel.id ===
          `tab-${tab}`
        );

      }
    );


    switch(tab){

      case 'agenda':
        refreshAgenda();
        break;

      case 'faturamento':
        refreshFaturamento();
        break;

      case 'financeiro':
        refreshFinanceiro();
        break;

      case 'servicos':
        refreshServices();
        break;

      case 'clientes':
        refreshClientes();
        break;

      case 'despesas':
        refreshDespesas();
        break;

      case 'usuarios':
        refreshUsuarios();
        break;

    }

  }


  $$('.nav-item').forEach(
    item => {

      item.addEventListener(
        'click',
        () => {

          const tab =
            item.dataset.tab;


          if(
            tab === 'usuarios' &&
            !isAdministrador()
          ){

            alert(
              'Apenas administradores podem acessar esta área.'
            );

            return;

          }


          goToTab(
            tab
          );

        }
      );

    }
  );


  // ============================================================
  // AGENDA
  // ============================================================

  async function refreshAgenda(){

    try{

      const items =
        await api(
          `/agendamentos?data=${selectedDate}`
        );


      currentAgendaItems =
        Array.isArray(items)
          ? items
          : [];


      renderAgenda(
        currentAgendaItems
      );


      atualizarResumoAgenda(
        currentAgendaItems
      );


    }catch(error){

      const list =
        document.getElementById(
          'agenda-list'
        );


      if(list){

        list.innerHTML =
          '<div class="empty">' +
            '<strong>Não foi possível carregar a agenda</strong>' +
            escapeHtml(error.message) +
          '</div>';

      }

    }

  }


  function renderAgenda(
    items
  ){

    const list =
      document.getElementById(
        'agenda-list'
      );


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
          'Toque em "Novo agendamento" para adicionar o primeiro carro do dia.' +
        '</div>';

    }else{

      list.innerHTML =
        items.map(ap => {

          const [h,m] =
            ap.hora
              .slice(0,5)
              .split(':');


          let actions =
            `<button class="btn btn-small btn-ghost" onclick="App.openEditAppointment('${ap.id}')">Editar</button>`;


          if(
            ap.status !==
            'concluido'
          ){

            actions +=
              `<button class="btn btn-small btn-primary" onclick="App.finishAppointment('${ap.id}')">Concluir</button>`;

          }


          return `
            <div class="appointment-row">

              <div class="appointment-time">
                ${h}:${m}
              </div>

              <div class="appointment-main">

                <div class="client">
                  ${escapeHtml(
                    ap.cliente_nome ||
                    ap.cliente ||
                    'Cliente'
                  )}
                </div>

                <div class="meta">

                  ${escapeHtml(
                    ap.veiculo ||
                    ''
                  )}

                  ${
                    ap.placa
                      ? ' · ' +
                        escapeHtml(
                          ap.placa
                        )
                      : ''
                  }

                  ${
                    ap.servico_nome
                      ? ' · ' +
                        escapeHtml(
                          ap.servico_nome
                        )
                      : ''
                  }

                </div>

              </div>

              <div class="appointment-value">
                ${money(ap.valor)}
              </div>

              <div class="ticket-actions">

                <span class="status-badge status-${escapeHtml(ap.status || '')}">
                  ${escapeHtml(
                    ap.status ||
                    'pendente'
                  )}
                </span>

                ${actions}

              </div>

            </div>
          `;

        }).join('');

    }

  }


  function atualizarResumoAgenda(
    items
  ){

    const total =
      items.length;


    const concluidos =
      items.filter(
        item =>
          item.status ===
          'concluido'
      ).length;


    const pendentes =
      total -
      concluidos;


    const faturado =
      items
        .filter(
          item =>
            item.status ===
            'concluido'
        )
        .reduce(
          (sum,item) =>
            sum +
            Number(
              item.valor || 0
            ),
          0
        );


    const totalElement =
      document.getElementById(
        'agenda-total'
      );


    const concluidosElement =
      document.getElementById(
        'agenda-concluidos'
      );


    const pendentesElement =
      document.getElementById(
        'agenda-pendentes'
      );


    const faturadoElement =
      document.getElementById(
        'agenda-faturado'
      );


    if(totalElement){
      totalElement.textContent =
        total;
    }


    if(concluidosElement){
      concluidosElement.textContent =
        concluidos;
    }


    if(pendentesElement){
      pendentesElement.textContent =
        pendentes;
    }


    if(faturadoElement){
      faturadoElement.textContent =
        money(faturado);
    }

  }


  // ------------------------------------------------------------
  // DATA DA AGENDA
  // ------------------------------------------------------------

  const agendaDate =
    document.getElementById(
      'agenda-date'
    );


  agendaDate?.addEventListener(
    'change',
    () => {

      selectedDate =
        agendaDate.value ||
        todayISO();


      refreshAgenda();

    }
  );


  document
    .getElementById(
      'agenda-prev'
    )
    ?.addEventListener(
      'click',
      () => {

        const date =
          new Date(
            selectedDate +
            'T00:00:00'
          );


        date.setDate(
          date.getDate() - 1
        );


        selectedDate =
          date
            .toISOString()
            .slice(0,10);


        if(agendaDate){

          agendaDate.value =
            selectedDate;

        }


        refreshAgenda();

      }
    );


  document
    .getElementById(
      'agenda-next'
    )
    ?.addEventListener(
      'click',
      () => {

        const date =
          new Date(
            selectedDate +
            'T00:00:00'
          );


        date.setDate(
          date.getDate() + 1
        );


        selectedDate =
          date
            .toISOString()
            .slice(0,10);


        if(agendaDate){

          agendaDate.value =
            selectedDate;

        }


        refreshAgenda();

      }
    );


  document
    .getElementById(
      'agenda-today'
    )
    ?.addEventListener(
      'click',
      () => {

        selectedDate =
          todayISO();


        if(agendaDate){

          agendaDate.value =
            selectedDate;

        }


        refreshAgenda();

      }
    );


  // ============================================================
  // MODAL DE AGENDAMENTO
  // ============================================================

  const overlayAppointment =
    document.getElementById(
      'overlay-appointment'
    );


  const formAppointment =
    document.getElementById(
      'form-appointment'
    );


  function closeAppointmentModal(){

    overlayAppointment?.classList.remove(
      'active'
    );

    editingAppointmentId =
      null;

  }


  document
    .getElementById(
      'btn-cancel-appointment'
    )
    ?.addEventListener(
      'click',
      closeAppointmentModal
    );


  overlayAppointment?.addEventListener(
    'click',
    event => {

      if(
        event.target ===
        overlayAppointment
      ){

        closeAppointmentModal();

      }

    }
  );


  document
    .getElementById(
      'btn-new-appointment'
    )
    ?.addEventListener(
      'click',
      openNewAppointment
    );


  function openNewAppointment(){

    editingAppointmentId =
      null;


    const title =
      document.getElementById(
        'appointment-modal-title'
      );


    if(title){

      title.textContent =
        'Novo agendamento';

    }


    const submit =
      document.getElementById(
        'appointment-submit-btn'
      );


    if(submit){

      submit.textContent =
        'Criar agendamento';

    }


    formAppointment?.reset();


    const date =
      document.getElementById(
        'appointment-date'
      );


    if(date){

      date.value =
        selectedDate;

    }


    overlayAppointment?.classList.add(
      'active'
    );

  }


  window.openEditAppointment =
    async function(id){

      editingAppointmentId =
        id;


      try{

        const appointments =
          await api(
            `/agendamentos?de=${selectedDate}&ate=${selectedDate}`
          );


        const appointment =
          appointments.find(
            item =>
              String(item.id) ===
              String(id)
          );


        if(!appointment){

          alert(
            'Agendamento não encontrado.'
          );

          return;

        }


        const title =
          document.getElementById(
            'appointment-modal-title'
          );


        if(title){

          title.textContent =
            'Editar agendamento';

        }


        const submit =
          document.getElementById(
            'appointment-submit-btn'
          );


        if(submit){

          submit.textContent =
            'Salvar alterações';

        }


        setValue(
          'appointment-client',
          appointment.cliente_nome ||
          appointment.cliente_id
        );


        setValue(
          'appointment-date',
          appointment.data
        );


        setValue(
          'appointment-time',
          formatTime(
            appointment.hora
          )
        );


        setValue(
          'appointment-vehicle',
          appointment.veiculo
        );


        setValue(
          'appointment-plate',
          appointment.placa
        );


        setValue(
          'appointment-service',
          appointment.servico_id
        );


        setValue(
          'appointment-value',
          appointment.valor
        );


        setValue(
          'appointment-status',
          appointment.status
        );


        overlayAppointment?.classList.add(
          'active'
        );


      }catch(error){

        alert(
          'Não foi possível carregar o agendamento: ' +
          error.message
        );

      }

    };


  function setValue(
    id,
    value
  ){

    const element =
      document.getElementById(
        id
      );


    if(element){

      element.value =
        value ?? '';

    }

  }


  formAppointment?.addEventListener(
    'submit',
    async event => {

      event.preventDefault();


      const clienteId =
        document.getElementById(
          'appointment-client'
        )?.value;


      const data =
        document.getElementById(
          'appointment-date'
        )?.value;


      const hora =
        document.getElementById(
          'appointment-time'
        )?.value;


      const veiculo =
        document.getElementById(
          'appointment-vehicle'
        )?.value.trim();


      const placa =
        document.getElementById(
          'appointment-plate'
        )?.value.trim();


      const servicoId =
        document.getElementById(
          'appointment-service'
        )?.value;


      const valor =
        document.getElementById(
          'appointment-value'
        )?.value;


      const status =
        document.getElementById(
          'appointment-status'
        )?.value ||
        'agendado';


      if(
        !clienteId ||
        !data ||
        !hora ||
        !servicoId
      ){

        alert(
          'Preencha os campos obrigatórios.'
        );

        return;

      }


      const payload = {
        cliente_id:
          clienteId,

        data,

        hora,

        veiculo,

        placa,

        servico_id:
          servicoId,

        valor:
          Number(valor || 0),

        status
      };


      const submit =
        document.getElementById(
          'appointment-submit-btn'
        );


      if(submit){

        submit.disabled =
          true;

        submit.textContent =
          editingAppointmentId
            ? 'Salvando...'
            : 'Criando...';

      }


      try{

        if(editingAppointmentId){

          await api(
            '/agendamentos/' +
            editingAppointmentId,
            {
              method:'PUT',

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


        closeAppointmentModal();

        await refreshAgenda();


      }catch(error){

        alert(
          'Não foi possível salvar o agendamento: ' +
          error.message
        );


      }finally{

        if(submit){

          submit.disabled =
            false;

          submit.textContent =
            editingAppointmentId
              ? 'Salvar alterações'
              : 'Criar agendamento';

        }

      }

    }
  );


  // ============================================================
  // CONCLUIR AGENDAMENTO
  // ============================================================

  window.finishAppointment =
    async function(id){

      if(
        !confirm(
          'Marcar este agendamento como concluído?'
        )
      ){

        return;

      }


      try{

        await api(
          '/agendamentos/' +
          id,
          {
            method:'PUT',

            body:
              JSON.stringify({
                status:'concluido'
              })
          }
        );


        await refreshAgenda();


      }catch(error){

        alert(
          'Não foi possível concluir: ' +
          error.message
        );

      }

    };


  // ============================================================
  // SERVIÇOS
  // ============================================================

  async function refreshServices(){

    const list =
      document.getElementById(
        'services-list'
      );


    if(!list){
      return;
    }


    list.innerHTML =
      '<div class="empty">Carregando…</div>';


    try{

      const services =
        await api(
          '/servicos'
        );


      state.services =
        Array.isArray(services)
          ? services
          : [];


      renderServices(
        state.services
      );


    }catch(error){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Não foi possível carregar os serviços</strong>' +
          escapeHtml(error.message) +
        '</div>';

    }

  }


  function renderServices(
    services
  ){

    const list =
      document.getElementById(
        'services-list'
      );


    if(!list){
      return;
    }


    if(services.length === 0){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Nenhum serviço cadastrado</strong>' +
          'Clique em "Novo serviço" para adicionar.' +
        '</div>';

      return;

    }


    list.innerHTML =
      services.map(
        service => `

          <div class="service-row">

            <div>

              <div class="client">
                ${escapeHtml(
                  service.nome
                )}
              </div>

              <div class="meta">
                ${escapeHtml(
                  service.descricao ||
                  ''
                )}
              </div>

            </div>

            <div class="price-tag">
              ${money(
                service.preco
              )}
            </div>

            <div class="ticket-actions">

              <button
                class="btn btn-small btn-ghost"
                onclick="App.editService('${service.id}')"
              >
                Editar
              </button>

              <button
                class="btn btn-small btn-ghost"
                onclick="App.removeService('${service.id}')"
              >
                Remover
              </button>

            </div>

          </div>

        `
      ).join('');

  }


  // ============================================================
  // MODAL SERVIÇO
  // ============================================================

  const overlayService =
    document.getElementById(
      'overlay-service'
    );


  const formService =
    document.getElementById(
      'form-service'
    );


  function closeServiceModal(){

    overlayService?.classList.remove(
      'active'
    );

    editingServiceId =
      null;

  }


  document
    .getElementById(
      'btn-cancel-service'
    )
    ?.addEventListener(
      'click',
      closeServiceModal
    );


  overlayService?.addEventListener(
    'click',
    event => {

      if(
        event.target ===
        overlayService
      ){

        closeServiceModal();

      }

    }
  );


  document
    .getElementById(
      'btn-new-service'
    )
    ?.addEventListener(
      'click',
      openNewService
    );


  function openNewService(){

    editingServiceId =
      null;


    const title =
      document.getElementById(
        'service-modal-title'
      );


    if(title){

      title.textContent =
        'Novo serviço';

    }


    const submit =
      document.getElementById(
        'service-submit-btn'
      );


    if(submit){

      submit.textContent =
        'Criar serviço';

    }


    formService?.reset();


    overlayService?.classList.add(
      'active'
    );

  }


  window.editService =
    async function(id){

      try{

        const services =
          await api(
            '/servicos'
          );


        const service =
          services.find(
            item =>
              String(item.id) ===
              String(id)
          );


        if(!service){

          alert(
            'Serviço não encontrado.'
          );

          return;

        }


        editingServiceId =
          id;


        const title =
          document.getElementById(
            'service-modal-title'
          );


        if(title){

          title.textContent =
            'Editar serviço';

        }


        const submit =
          document.getElementById(
            'service-submit-btn'
          );


        if(submit){

          submit.textContent =
            'Salvar alterações';

        }


        setValue(
          'service-name',
          service.nome
        );


        setValue(
          'service-description',
          service.descricao
        );


        setValue(
          'service-price',
          service.preco
        );


        overlayService?.classList.add(
          'active'
        );


      }catch(error){

        alert(
          'Não foi possível carregar o serviço: ' +
          error.message
        );

      }

    };


  formService?.addEventListener(
    'submit',
    async event => {

      event.preventDefault();


      const nome =
        document.getElementById(
          'service-name'
        )?.value.trim();


      const descricao =
        document.getElementById(
          'service-description'
        )?.value.trim();


      const preco =
        document.getElementById(
          'service-price'
        )?.value;


      if(!nome){

        alert(
          'Informe o nome do serviço.'
        );

        return;

      }


      const payload = {

        nome,

        descricao,

        preco:
          Number(preco || 0)

      };


      const submit =
        document.getElementById(
          'service-submit-btn'
        );


      if(submit){

        submit.disabled =
          true;

        submit.textContent =
          editingServiceId
            ? 'Salvando...'
            : 'Criando...';

      }


      try{

        if(editingServiceId){

          await api(
            '/servicos/' +
            editingServiceId,
            {
              method:'PUT',

              body:
                JSON.stringify(
                  payload
                )
            }
          );

        }else{

          await api(
            '/servicos',
            {
              method:'POST',

              body:
                JSON.stringify(
                  payload
                )
            }
          );

        }


        closeServiceModal();

        await refreshServices();


      }catch(error){

        alert(
          'Não foi possível salvar o serviço: ' +
          error.message
        );


      }finally{

        if(submit){

          submit.disabled =
            false;

          submit.textContent =
            editingServiceId
              ? 'Salvar alterações'
              : 'Criar serviço';

        }

      }

    }
  );


  window.removeService =
    async function(id){

      if(
        !confirm(
          'Remover este serviço?'
        )
      ){

        return;

      }


      try{

        await api(
          '/servicos/' +
          id,
          {
            method:'DELETE'
          }
        );


        await refreshServices();


      }catch(error){

        alert(
          'Não foi possível remover: ' +
          error.message
        );

      }

    };


  // ============================================================
  // CLIENTES
  // ============================================================

  async function refreshClientes(){

    const list =
      document.getElementById(
        'clientes-list'
      );


    if(!list){
      return;
    }


    list.innerHTML =
      '<div class="empty">Carregando…</div>';


    try{

      const clientes =
        await api(
          '/clientes'
        );


      renderClientes(
        clientes
      );


    }catch(error){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Não foi possível carregar os clientes</strong>' +
          escapeHtml(error.message) +
        '</div>';

    }

  }


  function renderClientes(
    clientes
  ){

    const list =
      document.getElementById(
        'clientes-list'
      );


    if(!list){
      return;
    }


    if(!clientes.length){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Nenhum cliente cadastrado</strong>' +
        '</div>';

      return;

    }


    list.innerHTML =
      clientes.map(
        cliente => `

          <div class="client-row">

            <div>

              <div class="client">
                ${escapeHtml(
                  cliente.nome
                )}
              </div>

              <div class="meta">

                ${
                  cliente.telefone
                    ? escapeHtml(
                        cliente.telefone
                      )
                    : ''
                }

                ${
                  cliente.email
                    ? ' · ' +
                      escapeHtml(
                        cliente.email
                      )
                    : ''
                }

              </div>

            </div>

          </div>

        `
      ).join('');

  }


  // ============================================================
  // FATURAMENTO
  // ============================================================

  async function refreshFaturamento(){

    try{

      const range =
        await fetchWideRange();


      const done =
        range.filter(
          item =>
            item.status ===
            'concluido'
        );


      const total =
        done.reduce(
          (sum,item) =>
            sum +
            Number(
              item.valor || 0
            ),
          0
        );


      const count =
        done.length;


      const totalElement =
        document.getElementById(
          'fat-total'
        );


      const countElement =
        document.getElementById(
          'fat-count'
        );


      if(totalElement){

        totalElement.textContent =
          money(total);

      }


      if(countElement){

        countElement.textContent =
          count;

      }


      renderFaturamento(
        done
      );


    }catch(error){

      const list =
        document.getElementById(
          'faturamento-list'
        );


      if(list){

        list.innerHTML =
          '<div class="empty">' +
            '<strong>Não foi possível carregar o faturamento</strong>' +
            escapeHtml(error.message) +
          '</div>';

      }

    }

  }


  function renderFaturamento(
    items
  ){

    const list =
      document.getElementById(
        'faturamento-list'
      );


    if(!list){
      return;
    }


    if(!items.length){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Nenhum faturamento encontrado</strong>' +
        '</div>';

      return;

    }


    list.innerHTML =
      items.map(
        item => `

          <div class="invoice-row">

            <div>

              <div class="client">
                ${escapeHtml(
                  item.cliente_nome ||
                  item.cliente ||
                  'Cliente'
                )}
              </div>

              <div class="meta">

                ${formatDateBR(
                  item.data
                )}

                ${
                  item.servico_nome
                    ? ' · ' +
                      escapeHtml(
                        item.servico_nome
                      )
                    : ''
                }

              </div>

            </div>

            <span class="price-tag">
              ${money(
                item.valor
              )}
            </span>

          </div>

        `
      ).join('');

  }


  // ============================================================
  // DESPESAS
  // ============================================================

  async function removeExpense(
    id
  ){

    if(
      !confirm(
        'Remover esta despesa?'
      )
    ){

      return;

    }


    try{

      await api(
        '/despesas/' +
        id,
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
      document.getElementById(
        'desp-list'
      );


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
          s +
          Number(d.valor),
        0
      );


    document.getElementById(
      'desp-total'
    ).textContent =
      money(total);


    document.getElementById(
      'desp-count'
    ).textContent =
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
      items.map(
        d =>

          `<div
            class="invoice-row"
            style="grid-template-columns:1fr auto auto;"
          >

            <div>

              <div class="client">
                ${escapeHtml(
                  d.descricao
                )}
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

                ${escapeHtml(
                  d.categoria
                )}

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

      ).join('');

  }


  // ============================================================
  // USUÁRIOS
  // ============================================================

  const overlayUser =
    document.getElementById(
      'overlay-user'
    );


  const formUser =
    document.getElementById(
      'form-user'
    );


  // ------------------------------------------------------------
  // ABRIR NOVO USUÁRIO
  // ------------------------------------------------------------

  document
    .getElementById(
      'btn-new-user'
    )
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
      document.getElementById(
        'user-modal-title'
      );


    if(title){

      title.textContent =
        'Novo usuário';

    }


    const submit =
      document.getElementById(
        'user-submit-btn'
      );


    if(submit){

      submit.textContent =
        'Criar usuário';

    }


    const name =
      document.getElementById(
        'user-name'
      );


    const email =
      document.getElementById(
        'user-email'
      );


    const profile =
      document.getElementById(
        'user-profile'
      );


    const password =
      document.getElementById(
        'user-password'
      );


    const passwordField =
      document.getElementById(
        'user-password-field'
      );


    const activeField =
      document.getElementById(
        'user-active-field'
      );


    if(name){

      name.value = '';

    }


    if(email){

      email.value = '';

    }


    if(profile){

      profile.value =
        'funcionario';

    }


    if(password){

      password.value = '';

      password.required =
        true;

    }


    if(passwordField){

      passwordField.style.display =
        '';

    }


    if(activeField){

      activeField.style.display =
        'none';

    }


    // ----------------------------------------------------------
    // LIMPAR PERMISSÕES DO MODAL
    // ----------------------------------------------------------

    setSelectedPermissions([]);

    updatePermissionsVisibility();


    overlayUser?.classList.add(
      'active'
    );


    name?.focus();

  }


  // ------------------------------------------------------------
  // CANCELAR USUÁRIO
  // ------------------------------------------------------------

  document
    .getElementById(
      'btn-cancel-user'
    )
    ?.addEventListener(
      'click',
      closeUserModal
    );


  overlayUser?.addEventListener(
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

    overlayUser?.classList.remove(
      'active'
    );

    editingUserId =
      null;

  }


  // ------------------------------------------------------------
  // PERMISSÕES DO USUÁRIO
  // ------------------------------------------------------------

  function getSelectedPermissions(){

    return Array.from(
      document.querySelectorAll(
        '#user-permissions-grid input[data-permission]:checked'
      )
    ).map(
      checkbox =>
        checkbox.dataset.permission
    );

  }


  function setSelectedPermissions(
    permissoes = []
  ){

    const permissoesSet =
      new Set(
        Array.isArray(permissoes)
          ? permissoes
          : []
      );


    document
      .querySelectorAll(
        '#user-permissions-grid input[data-permission]'
      )
      .forEach(
        checkbox => {

          checkbox.checked =
            permissoesSet.has(
              checkbox.dataset.permission
            );

        }
      );

  }


  async function loadUserPermissions(
    id
  ){

    const response =
      await api(
        '/usuarios/' +
        id +
        '/permissoes'
      );


    const permissoes =
      response?.permissoes ||
      [];


    setSelectedPermissions(
      permissoes
    );


    return permissoes;

  }


  function updatePermissionsVisibility(){

    const section =
      document.getElementById(
        'user-permissions-section'
      );


    const notice =
      document.getElementById(
        'admin-permission-notice'
      );


    const profile =
      document.getElementById(
        'user-profile'
      )?.value;


    if(!section){

      return;

    }


    const administrador =
      profile ===
      'administrador';


    if(notice){

      notice.style.display =
        administrador
          ? 'block'
          : 'none';

    }


    section.classList.toggle(
      'permissions-disabled',
      administrador
    );


    const checkboxes =
      section.querySelectorAll(
        'input[data-permission]'
      );


    checkboxes.forEach(
      checkbox => {

        checkbox.disabled =
          administrador;

      }
    );

  }


  document
    .getElementById(
      'user-profile'
    )
    ?.addEventListener(
      'change',
      updatePermissionsVisibility
    );


  // ------------------------------------------------------------
  // EDITAR USUÁRIO
  // ------------------------------------------------------------

  window.editUser =
    async function(id){

      if(!isAdministrador()){

        alert(
          'Apenas administradores podem editar usuários.'
        );

        return;

      }


      try{

        const usuarios =
          await api(
            '/usuarios'
          );


        const usuario =
          usuarios.find(
            u =>
              String(u.id) ===
              String(id)
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
          document.getElementById(
            'user-modal-title'
          );


        if(title){

          title.textContent =
            'Editar usuário';

        }


        const submit =
          document.getElementById(
            'user-submit-btn'
          );


        if(submit){

          submit.textContent =
            'Salvar alterações';

        }


        const name =
          document.getElementById(
            'user-name'
          );


        const email =
          document.getElementById(
            'user-email'
          );


        const profile =
          document.getElementById(
            'user-profile'
          );


        const password =
          document.getElementById(
            'user-password'
          );


        const passwordField =
          document.getElementById(
            'user-password-field'
          );


        const activeField =
          document.getElementById(
            'user-active-field'
          );


        const active =
          document.getElementById(
            'user-active'
          );


        if(name){

          name.value =
            usuario.nome ||
            '';

        }


        if(email){

          email.value =
            usuario.email ||
            '';

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


        // --------------------------------------------------------
        // CARREGAR PERMISSÕES DO BANCO
        // --------------------------------------------------------

        if(
          usuario.perfil ===
          'administrador'
        ){

          setSelectedPermissions([]);

        }else{

          await loadUserPermissions(
            id
          );

        }


        updatePermissionsVisibility();


        overlayUser?.classList.add(
          'active'
        );


        name?.focus();


      }catch(error){

        alert(
          'Não foi possível carregar o usuário: ' +
          error.message
        );

      }

    };


  // ------------------------------------------------------------
  // FORMULÁRIO USUÁRIO
  // ------------------------------------------------------------

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
        document.getElementById(
          'user-name'
        )?.value.trim();


      const email =
        document.getElementById(
          'user-email'
        )?.value.trim();


      const perfil =
        document.getElementById(
          'user-profile'
        )?.value;


      const senha =
        document.getElementById(
          'user-password'
        )?.value;


      if(!nome || !email){

        alert(
          'Informe nome e e-mail.'
        );

        return;

      }


      const submit =
        document.getElementById(
          'user-submit-btn'
        );


      if(submit){

        submit.disabled =
          true;

        submit.textContent =
          editingUserId
            ? 'Salvando...'
            : 'Criando...';

      }


      try{

        if(editingUserId){

          const ativoSelect =
            document.getElementById(
              'user-active'
            );


          const ativo =
            ativoSelect
              ? ativoSelect.value ===
                'true'
              : true;


          // ------------------------------------------------------
          // SALVAR DADOS DO USUÁRIO
          // ------------------------------------------------------

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
                  ativo
                })
            }
          );


          // ------------------------------------------------------
          // ALTERAR SENHA SE INFORMADA
          // ------------------------------------------------------

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


          // ------------------------------------------------------
          // SALVAR PERMISSÕES
          // ------------------------------------------------------

          const permissoes =
            perfil ===
            'administrador'
              ? []
              : getSelectedPermissions();


          await api(
            '/usuarios/' +
            editingUserId +
            '/permissoes',
            {
              method:'PATCH',

              body:
                JSON.stringify({
                  permissoes
                })
            }
          );


        }else{

          if(!senha){

            alert(
              'Informe uma senha para o novo usuário.'
            );

            return;

          }


          // ------------------------------------------------------
          // CRIAR USUÁRIO
          // ------------------------------------------------------

          const novoUsuario =
            await api(
              '/usuarios',
              {
                method:'POST',

                body:
                  JSON.stringify({
                    nome,
                    email,
                    senha,
                    perfil
                  })
              }
            );


          // ------------------------------------------------------
          // SALVAR PERMISSÕES DO NOVO FUNCIONÁRIO
          // ------------------------------------------------------

          if(
            perfil ===
            'funcionario'
          ){

            const novoId =
              novoUsuario?.id ||
              novoUsuario?.usuario?.id;


            if(novoId){

              const permissoes =
                getSelectedPermissions();


              await api(
                '/usuarios/' +
                novoId +
                '/permissoes',
                {
                  method:'PATCH',

                  body:
                    JSON.stringify({
                      permissoes
                    })
                }
              );

            }

          }

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
            editingUserId
              ? 'Salvar alterações'
              : 'Criar usuário';

        }

      }

    }
  );


  // ------------------------------------------------------------
  // LISTAR USUÁRIOS
  // ------------------------------------------------------------

  async function refreshUsuarios(){

    if(!isAdministrador()){

      atualizarAcessoUsuarios();

      return;

    }


    const list =
      document.getElementById(
        'usuarios-list'
      );


    if(!list){

      return;

    }


    list.innerHTML =
      '<div class="empty">Carregando usuários…</div>';


    try{

      const usuarios =
        await api(
          '/usuarios'
        );


      renderUsuarios(
        usuarios
      );


    }catch(error){

      list.innerHTML =
        '<div class="empty">' +
          '<strong>Não foi possível carregar os usuários</strong>' +
          escapeHtml(error.message) +
        '</div>';

    }

  }


  // ------------------------------------------------------------
  // RENDERIZAR USUÁRIOS
  // ------------------------------------------------------------

  function renderUsuarios(
    usuarios
  ){

    const list =
      document.getElementById(
        'usuarios-list'
      );


    if(!list){

      return;

    }


    const total =
      document.getElementById(
        'usuarios-total'
      );


    const admins =
      document.getElementById(
        'usuarios-admins'
      );


    const funcionarios =
      document.getElementById(
        'usuarios-funcionarios'
      );


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
      usuarios.map(
        usuario =>
          renderUsuario(
            usuario,
            usuarios
          )
      ).join('');

  }


  // ------------------------------------------------------------
  // RENDERIZAR UM USUÁRIO
  // ------------------------------------------------------------

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


    const perfil =
      usuario.perfil ===
      'administrador'
        ? 'Administrador'
        : 'Funcionário';


    const ativo =
      usuario.ativo === true;


    const status =
      ativo
        ? 'Ativo'
        : 'Bloqueado';


    const statusClass =
      ativo
        ? 'success'
        : 'warning';


    const isSelf =
      usuarioLogado &&
      String(
        usuarioLogado.id
      ) ===
      String(
        usuario.id
      );


    let permissionsText =
      'Sem permissões';


    if(
      usuario.perfil ===
      'administrador'
    ){

      permissionsText =
        'Acesso completo';

    }else if(
      Array.isArray(
        usuario.permissoes
      ) &&
      usuario.permissoes.length
    ){

      permissionsText =
        usuario.permissoes.length +
        ' permissões';

    }


    return `

      <div class="user-row">

        <div class="user-main">

          <div class="user-avatar">
            ${escapeHtml(
              nome.charAt(0)
            )}
          </div>

          <div>

            <div class="client">
              ${nome}
            </div>

            <div class="meta">
              ${email}
            </div>

            <div class="meta">
              ${perfil}
              ·
              ${escapeHtml(
                permissionsText
              )}
            </div>

          </div>

        </div>


        <div>

          <span
            class="status-badge status-${statusClass}"
          >
            ${status}
          </span>

        </div>


        <div class="ticket-actions">

          <button
            class="btn btn-small btn-ghost"
            onclick="App.editUser('${usuario.id}')"
          >
            Editar
          </button>

          ${
            !isSelf
              ? `
                <button
                  class="btn btn-small btn-ghost"
                  onclick="App.changeUserProfile('${usuario.id}', '${usuario.perfil === 'administrador' ? 'funcionario' : 'administrador'}')"
                >
                  ${
                    usuario.perfil ===
                    'administrador'
                      ? 'Tornar funcionário'
                      : 'Tornar administrador'
                  }
                </button>
              `
              : ''
          }

          ${
            !isSelf
              ? `
                <button
                  class="btn btn-small btn-ghost"
                  onclick="App.toggleUserStatus('${usuario.id}', ${!ativo})"
                >
                  ${
                    ativo
                      ? 'Bloquear'
                      : 'Desbloquear'
                  }
                </button>
              `
              : ''
          }

          ${
            !isSelf
              ? `
                <button
                  class="btn btn-small btn-ghost"
                  onclick="App.removeUser('${usuario.id}')"
                >
                  Excluir
                </button>
              `
              : ''
          }

        </div>

      </div>

    `;

  }


  // ------------------------------------------------------------
  // ALTERAR PERFIL
  // ------------------------------------------------------------

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
        '/usuarios/' +
        id,
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


  // ------------------------------------------------------------
  // ATIVAR / BLOQUEAR
  // ------------------------------------------------------------

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


    const mensagem =
      ativo
        ? 'Desbloquear este usuário?'
        : 'Bloquear este usuário?';


    if(!confirm(mensagem)){

      return;

    }


    try{

      await api(
        '/usuarios/' +
        id +
        '/status',
        {
          method:'PATCH',

          body:
            JSON.stringify({
              ativo
            })
        }
      );


      await refreshUsuarios();


    }catch(error){

      alert(
        'Não foi possível alterar o status: ' +
        error.message
      );

    }

  }


  // ------------------------------------------------------------
  // EXCLUIR USUÁRIO
  // ------------------------------------------------------------

  async function removeUser(
    id
  ){

    if(!isAdministrador()){

      alert(
        'Apenas administradores podem excluir usuários.'
      );

      return;

    }


    if(
      usuarioLogado &&
      String(
        usuarioLogado.id
      ) ===
      String(id)
    ){

      alert(
        'Você não pode excluir o próprio usuário.'
      );

      return;

    }


    if(
      !confirm(
        'Excluir este usuário? Esta ação não pode ser desfeita.'
      )
    ){

      return;

    }


    try{

      await api(
        '/usuarios/' +
        id,
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


  // ------------------------------------------------------------
  // EXPOR FUNÇÕES PARA OS BOTÕES INLINE
  // ------------------------------------------------------------

  window.App =
    window.App ||
    {};


  window.App.openEditAppointment =
    window.openEditAppointment;


  window.App.finishAppointment =
    window.finishAppointment;


  window.App.editService =
    window.editService;


  window.App.removeService =
    window.removeService;


  window.App.removeExpense =
    removeExpense;


  window.App.editUser =
    window.editUser;


  window.App.changeUserProfile =
    changeUserProfile;


  window.App.toggleUserStatus =
    toggleUserStatus;


  window.App.removeUser =
    removeUser;


  // ============================================================
  // FINANCEIRO
  // ============================================================

  async function refreshFinanceiro(){

    try{

      const [
        range,
        despesas
      ] = await Promise.all([
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
        document.getElementById(
          'fin-bars'
        );


      if(bars){

        bars.innerHTML =
          '<div class="empty">' +
            '<strong>Não foi possível carregar os dados</strong>' +
            'Verifique a conexão com o banco de dados.' +
          '</div>';

      }

    }

  }


  async function fetchWideRange(){

    const now =
      new Date();


    const past =
      new Date(now);


    past.setDate(
      now.getDate() - 90
    );


    const de =
      past
        .toISOString()
        .slice(0,10);


    const ate =
      now
        .toISOString()
        .slice(0,10);


    return api(
      `/agendamentos?de=${de}&ate=${ate}`
    );

  }


  async function fetchWideRangeExpenses(){

    const now =
      new Date();


    const past =
      new Date(now);


    past.setDate(
      now.getDate() - 90
    );


    const de =
      past
        .toISOString()
        .slice(0,10);


    const ate =
      now
        .toISOString()
        .slice(0,10);


    return api(
      `/despesas?de=${de}&ate=${ate}`
    );

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


    const monthStr =
      today.slice(0,7);


    const sumWhere =
      fn =>
        done
          .filter(fn)
          .reduce(
            (s,a) =>
              s +
              Number(
                a.valor
              ),
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
          sevenDaysAgo
            .toISOString()
            .slice(0,10)
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


    const despesasMes =
      allExpensesCache.filter(
        d =>
          d.data &&
          d.data.slice(0,7) ===
          monthStr
      );


    const totalDespesasMes =
      despesasMes.reduce(
        (s,d) =>
          s +
          Number(
            d.valor
          ),
        0
      );


    const lucroMes =
      mes -
      totalDespesasMes;


    const finHoje =
      document.getElementById(
        'fin-hoje'
      );


    const finSemana =
      document.getElementById(
        'fin-semana'
      );


    const finMes =
      document.getElementById(
        'fin-mes'
      );


    const finDespesas =
      document.getElementById(
        'fin-despesas'
      );


    const finLucro =
      document.getElementById(
        'fin-lucro'
      );


    if(finHoje){

      finHoje.textContent =
        money(hoje);

    }


    if(finSemana){

      finSemana.textContent =
        money(semana);

    }


    if(finMes){

      finMes.textContent =
        money(mes);

    }


    if(finDespesas){

      finDespesas.textContent =
        money(
          totalDespesasMes
        );

    }


    if(finLucro){

      finLucro.textContent =
        money(
          lucroMes
        );

    }


    renderFinanceiroBars(
      doneMes
    );

  }


  function renderFinanceiroBars(
    items
  ){

    const bars =
      document.getElementById(
        'fin-bars'
      );


    if(!bars){

      return;

    }


    const days = [];


    for(let i = 6; i >= 0; i--){

      const date =
        new Date();


      date.setDate(
        date.getDate() - i
      );


      days.push(
        date
          .toISOString()
          .slice(0,10)
      );

    }


    const values =
      days.map(
        day =>
          items
            .filter(
              item =>
                item.data ===
                day
            )
            .reduce(
              (sum,item) =>
                sum +
                Number(
                  item.valor ||
                  0
                ),
              0
            )
      );


    const max =
      Math.max(
        ...values,
        1
      );


    bars.innerHTML =
      values.map(
        (value,index) => {

          const height =
            Math.max(
              4,
              (
                value /
                max
              ) *
              100
            );


          const label =
            new Date(
              days[index] +
              'T00:00:00'
            ).toLocaleDateString(
              'pt-BR',
              {
                weekday:'short'
              }
            );


          return `

            <div class="fin-bar-item">

              <div
                class="fin-bar"
                style="height:${height}%"
                title="${money(value)}"
              ></div>

              <span>
                ${label}
              </span>

            </div>

          `;

        }
      ).join('');

  }


  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  async function inicializarAplicacao(){

    selectedDate =
      todayISO();


    if(agendaDate){

      agendaDate.value =
        selectedDate;

    }


    atualizarDadosUsuario();


    await Promise.allSettled([
      refreshServices(),
      refreshAgenda()
    ]);


    if(
      activeTab ===
      'financeiro'
    ){

      await refreshFinanceiro();

    }


    iniciarMonitoramentoConexao();

  }


  function iniciarMonitoramentoConexao(){

    if(connectionInterval){

      clearInterval(
        connectionInterval
      );

    }


    verificarConexao();


    connectionInterval =
      setInterval(
        verificarConexao,
        30000
      );

  }


  async function verificarConexao(){

    const indicator =
      document.getElementById(
        'connection-status'
      );


    if(!indicator){

      return;

    }


    try{

      await api(
        '/status'
      );


      indicator.textContent =
        'Conectado';


      indicator.classList.add(
        'online'
      );


      indicator.classList.remove(
        'offline'
      );


    }catch(error){

      indicator.textContent =
        'Desconectado';


      indicator.classList.remove(
        'online'
      );


      indicator.classList.add(
        'offline'
      );

    }

  }


  // ============================================================
  // INÍCIO
  // ============================================================

  if(agendaDate){

    agendaDate.value =
      selectedDate;

  }


  carregarSessao();

  


})();
    try{

      const all =
        await fetchWideRange();


      const normalized =
        termo
          .toLowerCase();


      const matches =
        all.filter(
          ap => {

            const cliente =
              String(
                ap.cliente || ''
              ).toLowerCase();


            const telefone =
              String(
                ap.telefone || ''
              ).toLowerCase();


            const placa =
              String(
                ap.placa || ''
              ).toLowerCase();


            const veiculo =
              String(
                ap.veiculo || ''
              ).toLowerCase();


            return (
              cliente.includes(
                normalized
              ) ||
              telefone.includes(
                normalized
              ) ||
              placa.includes(
                normalized
              ) ||
              veiculo.includes(
                normalized
              )
            );

          }
        );


      if(matches.length === 0){

        summaryEl.innerHTML =
          'Nenhum resultado encontrado.';


        resultsEl.innerHTML = `

          <div class="empty">

            <strong>
              Cliente não encontrado
            </strong>

            Nenhum agendamento corresponde à busca.

          </div>

        `;

        return;

      }


      const total =
        matches.reduce(
          (sum,ap) =>
            sum +
            Number(
              ap.valor || 0
            ),
          0
        );


      const concluidos =
        matches.filter(
          ap =>
            ap.status ===
            'concluido'
        );


      summaryEl.innerHTML = `

        <span>
          ${matches.length}
          ${
            matches.length === 1
              ? 'registro'
              : 'registros'
          }
        </span>

        <span>
          Total:
          ${money(total)}
        </span>

        <span>
          Concluídos:
          ${concluidos.length}
        </span>

      `;


      resultsEl.innerHTML =
        matches
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
          )
          .map(
            ap => `

              <div class="client-history-row">

                <div>

                  <div class="client">
                    ${escapeHtml(
                      ap.cliente ||
                      'Cliente'
                    )}
                  </div>

                  <div class="meta">

                    ${formatDateBR(
                      ap.data
                    )}

                    ·

                    ${escapeHtml(
                      ap.hora?.slice(0,5) ||
                      ''
                    )}

                    ${
                      ap.veiculo
                        ? ' · ' +
                          escapeHtml(
                            ap.veiculo
                          )
                        : ''
                    }

                    ${
                      ap.placa
                        ? ' · ' +
                          escapeHtml(
                            ap.placa
                          )
                        : ''
                    }

                  </div>

                </div>


                <div>

                  <div class="price-tag">
                    ${money(
                      ap.valor
                    )}
                  </div>

                  <span
                    class="status-badge status-${escapeHtml(
                      ap.status ||
                      ''
                    )}"
                  >
                    ${escapeHtml(
                      ap.status ||
                      ''
                    )}
                  </span>

                </div>

              </div>

            `
          )
          .join('');


    }catch(error){

      resultsEl.innerHTML = `

        <div class="empty">

          <strong>
            Não foi possível realizar a busca
          </strong>

          ${escapeHtml(
            error.message
          )}

        </div>

      `;

    }

  


  // ============================================================
  // DESPESAS
  // ============================================================

  


  document
    .getElementById(
      'btn-new-expense'
    )
    ?.addEventListener(
      'click',
      () => {

        document.getElementById(
          'ex-description'
        ).value = '';


        document.getElementById(
          'ex-value'
        ).value = '';


        document.getElementById(
          'ex-category'
        ).value = '';


        document.getElementById(
          'ex-date'
        ).value =
          todayISO();


        overlayExpense?.classList.add(
          'active'
        );

      }
    );


  document
    .getElementById(
      'btn-cancel-expense'
    )
    ?.addEventListener(
      'click',
      () => {

        overlayExpense?.classList.remove(
          'active'
        );

      }
    );


  overlayExpense?.addEventListener(
    'click',
    e => {

      if(
        e.target ===
        overlayExpense
      ){

        overlayExpense.classList.remove(
          'active'
        );

      }

    }
  );


  document
    .getElementById(
      'form-expense'
    )
    ?.addEventListener(
      'submit',
      async e => {

        e.preventDefault();


        const descricao =
          document.getElementById(
            'ex-description'
          ).value.trim();


        const valor =
          parseFloat(
            document.getElementById(
              'ex-value'
            ).value
          ) || 0;


        const categoria =
          document.getElementById(
            'ex-category'
          ).value.trim();


        const data =
          document.getElementById(
            'ex-date'
          ).value;


        if(!descricao){

          alert(
            'Informe a descrição da despesa.'
          );

          return;

        }


        if(valor <= 0){

          alert(
            'Informe um valor válido.'
          );

          return;

        }


        try{

          await api(
            '/despesas',
            {
              method:'POST',

              body:
                JSON.stringify({
                  descricao,
                  valor,
                  categoria,
                  data
                })
            }
          );


          overlayExpense?.classList.remove(
            'active'
          );


          await refreshDespesas();


        }catch(err){

          alert(
            'Não foi possível salvar a despesa: ' +
            err.message
          );

        }

      }
    );


  // ============================================================
  // AGENDA — FILTROS
  // ============================================================

  document
    .getElementById(
      'agenda-search'
    )
    ?.addEventListener(
      'input',
      e => {

        const termo =
          e.target.value
            .trim()
            .toLowerCase();


        if(!termo){

          renderAgenda(
            currentAgendaItems
          );

          return;

        }


        const filtrados =
          currentAgendaItems.filter(
            ap => {

              const cliente =
                String(
                  ap.cliente || ''
                ).toLowerCase();


              const placa =
                String(
                  ap.placa || ''
                ).toLowerCase();


              const veiculo =
                String(
                  ap.veiculo || ''
                ).toLowerCase();


              const servico =
                String(
                  ap.servico_nome ||
                  serviceName(
                    ap.servico_id
                  ) ||
                  ''
                ).toLowerCase();


              return (
                cliente.includes(
                  termo
                ) ||
                placa.includes(
                  termo
                ) ||
                veiculo.includes(
                  termo
                ) ||
                servico.includes(
                  termo
                )
              );

            }
          );


        renderAgenda(
          filtrados
        );

      }
    );


  // ============================================================
  // SELEÇÃO DE DATA
  // ============================================================

  document
    .getElementById(
      'agenda-date'
    )
    ?.addEventListener(
      'change',
      e => {

        selectedDate =
          e.target.value ||
          todayISO();


        refreshAgenda();

      }
    );


  // ============================================================
  // BOTÃO HOJE
  // ============================================================

  document
    .getElementById(
      'btn-agenda-today'
    )
    ?.addEventListener(
      'click',
      () => {

        selectedDate =
          todayISO();


        const date =
          document.getElementById(
            'agenda-date'
          );


        if(date){

          date.value =
            selectedDate;

        }


        refreshAgenda();

      }
    );


  // ============================================================
  // DIA ANTERIOR
  // ============================================================

  document
    .getElementById(
      'btn-agenda-prev'
    )
    ?.addEventListener(
      'click',
      () => {

        const date =
          new Date(
            selectedDate +
            'T00:00:00'
          );


        date.setDate(
          date.getDate() - 1
        );


        selectedDate =
          date
            .toISOString()
            .slice(0,10);


        const input =
          document.getElementById(
            'agenda-date'
          );


        if(input){

          input.value =
            selectedDate;

        }


        refreshAgenda();

      }
    );


  // ============================================================
  // PRÓXIMO DIA
  // ============================================================

  document
    .getElementById(
      'btn-agenda-next'
    )
    ?.addEventListener(
      'click',
      () => {

        const date =
          new Date(
            selectedDate +
            'T00:00:00'
          );


        date.setDate(
          date.getDate() + 1
        );


        selectedDate =
          date
            .toISOString()
            .slice(0,10);


        const input =
          document.getElementById(
            'agenda-date'
          );


        if(input){

          input.value =
            selectedDate;

        }


        refreshAgenda();

      }
    );


  // ============================================================
  // MODAL DE AGENDAMENTO
  // ============================================================

  const overlayAppointment =
    document.getElementById(
      'overlay-appointment'
    );


  const formAppointment =
    document.getElementById(
      'form-appointment'
    );


  document
    .getElementById(
      'btn-new-appointment'
    )
    ?.addEventListener(
      'click',
      openNewAppointment
    );


  function openNewAppointment(){

    editingAppointmentId =
      null;


    const form =
      document.getElementById(
        'form-appointment'
      );


    form?.reset();


    const title =
      document.getElementById(
        'appointment-modal-title'
      );


    if(title){

      title.textContent =
        'Novo agendamento';

    }


    const submit =
      document.getElementById(
        'appointment-submit'
      );


    if(submit){

      submit.textContent =
        'Criar agendamento';

    }


    const date =
      document.getElementById(
        'ap-date'
      );


    if(date){

      date.value =
        selectedDate;

    }


    const status =
      document.getElementById(
        'ap-status'
      );


    if(status){

      status.value =
        'agendado';

    }


    populateAppointmentServices();


    overlayAppointment?.classList.add(
      'active'
    );

  }


  document
    .getElementById(
      'btn-cancel-appointment'
    )
    ?.addEventListener(
      'click',
      () => {

        overlayAppointment?.classList.remove(
          'active'
        );

        editingAppointmentId =
          null;

      }
    );


  overlayAppointment?.addEventListener(
    'click',
    e => {

      if(
        e.target ===
        overlayAppointment
      ){

        overlayAppointment.classList.remove(
          'active'
        );

        editingAppointmentId =
          null;

      }

    }
  );


  function populateAppointmentServices(){

    const select =
      document.getElementById(
        'ap-service'
      );


    if(!select){

      return;

    }


    select.innerHTML =
      '<option value="">Selecione o serviço</option>' +
      state.services
        .map(
          service => `

            <option
              value="${service.id}"
            >
              ${escapeHtml(
                service.nome
              )}
              —
              ${money(
                service.preco
              )}
            </option>

          `
        )
        .join('');

  }


  function serviceName(
    id
  ){

    const service =
      state.services.find(
        s =>
          String(s.id) ===
          String(id)
      );


    return service
      ? service.nome
      : 'Serviço';

  }


  async function loadServices(){

    try{

      const services =
        await api(
          '/servicos'
        );


      state.services =
        Array.isArray(
          services
        )
          ? services
          : [];


      populateAppointmentServices();


    }catch(error){

      console.error(
        'Erro ao carregar serviços:',
        error
      );

    }

  }


  // ============================================================
  // AGENDAMENTOS
  // ============================================================

  async function loadAppointments(
    data
  ){

    try{

      const items =
        await api(
          '/agendamentos?data=' +
          encodeURIComponent(
            data
          )
        );


      state.appointments =
        Array.isArray(items)
          ? items
          : [];


      currentAgendaItems =
        state.appointments;


      return state.appointments;


    }catch(error){

      console.error(
        'Erro ao carregar agendamentos:',
        error
      );


      state.appointments =
        [];


      currentAgendaItems =
        [];


      return [];

    }

  }


  async function refreshAgenda(){

    const date =
      document.getElementById(
        'agenda-date'
      );


    if(date){

      selectedDate =
        date.value ||
        selectedDate ||
        todayISO();

    }


    await loadServices();


    const items =
      await loadAppointments(
        selectedDate
      );


    renderAgenda(
      items
    );


    updateAgendaSummary(
      items
    );

  }


  function updateAgendaSummary(
    items
  ){

    const total =
      items.length;


    const pendentes =
      items.filter(
        item =>
          item.status !==
          'concluido'
      ).length;


    const concluidos =
      items.filter(
        item =>
          item.status ===
          'concluido'
      ).length;


    const faturado =
      items.reduce(
        (sum,item) =>
          sum +
          Number(
            item.valor || 0
          ),
        0
      );


    const totalElement =
      document.getElementById(
        'agenda-total'
      );


    const pendingElement =
      document.getElementById(
        'agenda-pending'
      );


    const doneElement =
      document.getElementById(
        'agenda-done'
      );


    const valueElement =
      document.getElementById(
        'agenda-value'
      );


    if(totalElement){

      totalElement.textContent =
        total;

    }


    if(pendingElement){

      pendingElement.textContent =
        pendentes;

    }


    if(doneElement){

      doneElement.textContent =
        concluidos;

    }


    if(valueElement){

      valueElement.textContent =
        money(faturado);

    }

  }


  function renderAgenda(
    items
  ){

    const list =
      document.getElementById(
        'agenda-list'
      );


    if(!list){

      return;

    }


    const sorted =
      items
        .slice()
        .sort(
          (a,b) =>
            String(
              a.hora ||
              ''
            ).localeCompare(
              String(
                b.hora ||
                ''
              )
            )
        );


    if(sorted.length === 0){

      list.innerHTML = `

        <div class="empty">

          <strong>
            Nenhum agendamento para este dia
          </strong>

          Clique em
          "Novo agendamento"
          para cadastrar um atendimento.

        </div>

      `;

      return;

    }


    list.innerHTML =
      sorted
        .map(
          ap => {

            const status =
              ap.status ||
              'agendado';


            const statusLabel =
              status ===
              'concluido'
                ? 'Concluído'
                : status ===
                  'cancelado'
                    ? 'Cancelado'
                    : 'Agendado';


            return `

              <div class="agenda-row">

                <div class="agenda-time">

                  ${escapeHtml(
                    String(
                      ap.hora ||
                      ''
                    ).slice(
                      0,
                      5
                    )
                  )}

                </div>


                <div class="agenda-main">

                  <div class="client">

                    ${escapeHtml(
                      ap.cliente ||
                      'Cliente'
                    )}

                  </div>


                  <div class="meta">

                    ${
                      ap.veiculo
                        ? escapeHtml(
                            ap.veiculo
                          )
                        : ''
                    }

                    ${
                      ap.placa
                        ? ' · ' +
                          escapeHtml(
                            ap.placa
                          )
                        : ''
                    }

                    ${
                      ap.servico_nome
                        ? ' · ' +
                          escapeHtml(
                            ap.servico_nome
                          )
                        : ''
                    }

                  </div>

                </div>


                <div class="agenda-value">

                  ${money(
                    ap.valor
                  )}

                </div>


                <div class="agenda-status">

                  <span
                    class="status-badge status-${escapeHtml(status)}"
                  >
                    ${statusLabel}
                  </span>

                </div>


                <div class="ticket-actions">

                  <button
                    class="btn btn-small btn-ghost"
                    onclick="App.editAppointment('${ap.id}')"
                  >
                    Editar
                  </button>


                  ${
                    status !==
                    'concluido'
                      ? `
                        <button
                          class="btn btn-small btn-primary"
                          onclick="App.finishAppointment('${ap.id}')"
                        >
                          Concluir
                        </button>
                      `
                      : ''
                  }

                </div>

              </div>

            `;

          }
        )
        .join('');

  }


  // ============================================================
  // EDITAR AGENDAMENTO
  // ============================================================

  async function editAppointment(
    id
  ){

    try{

      const items =
        await api(
          '/agendamentos?data=' +
          encodeURIComponent(
            selectedDate
          )
        );


      const appointment =
        items.find(
          item =>
            String(item.id) ===
            String(id)
        );


      if(!appointment){

        alert(
          'Agendamento não encontrado.'
        );

        return;

      }


      editingAppointmentId =
        id;


      await loadServices();


      const title =
        document.getElementById(
          'appointment-modal-title'
        );


      if(title){

        title.textContent =
          'Editar agendamento';

      }


      const submit =
        document.getElementById(
          'appointment-submit'
        );


      if(submit){

        submit.textContent =
          'Salvar alterações';

      }


      setElementValue(
        'ap-client',
        appointment.cliente
      );


      setElementValue(
        'ap-date',
        appointment.data
      );


      setElementValue(
        'ap-time',
        String(
          appointment.hora ||
          ''
        ).slice(
          0,
          5
        )
      );


      setElementValue(
        'ap-vehicle',
        appointment.veiculo
      );


      setElementValue(
        'ap-plate',
        appointment.placa
      );


      setElementValue(
        'ap-service',
        appointment.servico_id
      );


      setElementValue(
        'ap-value',
        appointment.valor
      );


      setElementValue(
        'ap-status',
        appointment.status
      );


      overlayAppointment?.classList.add(
        'active'
      );


    }catch(error){

      alert(
        'Não foi possível carregar o agendamento: ' +
        error.message
      );

    }

  }


  function setElementValue(
    id,
    value
  ){

    const element =
      document.getElementById(
        id
      );


    if(element){

      element.value =
        value ?? '';

    }

  }


  window.App.editAppointment =
    editAppointment;


  // ============================================================
  // SALVAR AGENDAMENTO
  // ============================================================

  formAppointment?.addEventListener(
    'submit',
    async event => {

      event.preventDefault();


      const cliente =
        document.getElementById(
          'ap-client'
        )?.value.trim();


      const data =
        document.getElementById(
          'ap-date'
        )?.value;


      const hora =
        document.getElementById(
          'ap-time'
        )?.value;


      const veiculo =
        document.getElementById(
          'ap-vehicle'
        )?.value.trim();


      const placa =
        document.getElementById(
          'ap-plate'
        )?.value.trim();


      const servico_id =
        document.getElementById(
          'ap-service'
        )?.value;


      const valor =
        parseFloat(
          document.getElementById(
            'ap-value'
          )?.value
        ) || 0;


      const status =
        document.getElementById(
          'ap-status'
        )?.value ||
        'agendado';


      if(
        !cliente ||
        !data ||
        !hora ||
        !servico_id
      ){

        alert(
          'Preencha os campos obrigatórios.'
        );

        return;

      }


      const payload = {

        cliente,

        data,

        hora,

        veiculo,

        placa,

        servico_id:

          Number(
            servico_id
          ),

        valor,

        status

      };


      const submit =
        document.getElementById(
          'appointment-submit'
        );


      if(submit){

        submit.disabled =
          true;

        submit.textContent =
          editingAppointmentId
            ? 'Salvando...'
            : 'Criando...';

      }


      try{

        if(editingAppointmentId){

          await api(
            '/agendamentos/' +
            editingAppointmentId,
            {
              method:'PUT',

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


        overlayAppointment?.classList.remove(
          'active'
        );


        editingAppointmentId =
          null;


        await refreshAgenda();


      }catch(error){

        alert(
          'Não foi possível salvar o agendamento: ' +
          error.message
        );


      }finally{

        if(submit){

          submit.disabled =
            false;

          submit.textContent =
            'Salvar';

        }

      }

    }
  );


  // ============================================================
  // CONCLUIR AGENDAMENTO
  // ============================================================

  async function finishAppointment(
    id
  ){

    if(
      !confirm(
        'Deseja marcar este agendamento como concluído?'
      )
    ){

      return;

    }


    try{

      await api(
        '/agendamentos/' +
        id,
        {
          method:'PUT',

          body:
            JSON.stringify({
              status:
                'concluido'
            })
        }
      );


      await refreshAgenda();


    }catch(error){

      alert(
        'Não foi possível concluir o agendamento: ' +
        error.message
      );

    }

  }


  window.App.finishAppointment =
    finishAppointment;


  // ============================================================
  // PAGAMENTOS
  // ============================================================

  async function setPayment(
    id,
    status_pagamento
  ){

    try{

      await api(
        '/agendamentos/' +
        id,
        {
          method:'PATCH',

          body:
            JSON.stringify({
              status_pagamento
            })
        }
      );


      await refreshCurrentTab();


    }catch(error){

      alert(
        'Erro ao atualizar pagamento: ' +
        error.message
      );

    }

  }


  async function setPaymentMethod(
    id,
    forma_pagamento
  ){

    try{

      await api(
        '/agendamentos/' +
        id,
        {
          method:'PATCH',

          body:
            JSON.stringify({
              forma_pagamento
            })
        }
      );


    }catch(error){

      console.error(
        error
      );

    }

  }


  async function undoPayment(
    id
  ){

    if(
      !confirm(
        'Desfazer a confirmação de pagamento? Você poderá trocar a forma de pagamento novamente depois.'
      )
    ){

      return;

    }


    try{

      await api(
        '/agendamentos/' +
        id,
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


    }catch(error){

      alert(
        'Erro ao desfazer: ' +
        error.message
      );

    }

  }


  window.App.setPayment =
    setPayment;


  window.App.setPaymentMethod =
    setPaymentMethod;


  window.App.undoPayment =
    undoPayment;


  // ============================================================
  // RECIBO
  // ============================================================

  function printReceipt(
    id
  ){

    const appointment =
      allDoneCache.find(
        item =>
          String(item.id) ===
          String(id)
      );


    if(!appointment){

      alert(
        'Atendimento não encontrado.'
      );

      return;

    }


    const printArea =
      document.getElementById(
        'print-area'
      );


    if(!printArea){

      return;

    }


    const data =
      new Date(
        appointment.data +
        'T00:00:00'
      ).toLocaleDateString(
        'pt-BR'
      );


    printArea.innerHTML = `

      <div class="recibo-header">

        <h2>
          Recibo
        </h2>

        <div>
          ${data}
          às
          ${String(
            appointment.hora ||
            ''
          ).slice(0,5)}
        </div>

      </div>


      <div class="recibo-row">

        <span>
          Cliente
        </span>

        <span>
          ${escapeHtml(
            appointment.cliente
          )}
        </span>

      </div>


      ${
        appointment.veiculo
          ? `

            <div class="recibo-row">

              <span>
                Veículo
              </span>

              <span>
                ${escapeHtml(
                  appointment.veiculo
                )}
              </span>

            </div>

          `
          : ''
      }


      ${
        appointment.placa
          ? `

            <div class="recibo-row">

              <span>
                Placa
              </span>

              <span>
                ${escapeHtml(
                  appointment.placa
                    .toUpperCase()
                )}
              </span>

            </div>

          `
          : ''
      }


      <div class="recibo-row">

        <span>
          Serviço
        </span>

        <span>
          ${escapeHtml(
            appointment.servico_nome ||
            serviceName(
              appointment.servico_id
            )
          )}
        </span>

      </div>


      <div class="recibo-row">

        <span>
          Forma de pagamento
        </span>

        <span>
          ${escapeHtml(
            appointment.forma_pagamento ||
            'Não informado'
          )}
        </span>

      </div>


      <div class="recibo-total">

        <span>
          Total
        </span>

        <span>
          ${money(
            appointment.valor
          )}
        </span>

      </div>

    `;


    window.print();

  }


  window.App.printReceipt =
    printReceipt;


  // ============================================================
  // FECHAMENTO DO DIA
  // ============================================================

  async function printClosing(){

    try{

      const items =
        await api(
          '/agendamentos?data=' +
          encodeURIComponent(
            selectedDate
          )
        );


      const done =
        items
          .filter(
            item =>
              item.status ===
              'concluido'
          )
          .sort(
            (a,b) =>
              String(
                a.hora ||
                ''
              ).localeCompare(
                String(
                  b.hora ||
                  ''
                )
              )
          );


      const total =
        done.reduce(
          (sum,item) =>
            sum +
            Number(
              item.valor ||
              0
            ),
          0
        );


      const pago =
        done
          .filter(
            item =>
              item.status_pagamento ===
              'pago'
          )
          .reduce(
            (sum,item) =>
              sum +
              Number(
                item.valor ||
                0
              ),
            0
          );


      const pendente =
        total -
        pago;


      const formas = {};


      done
        .filter(
          item =>
            item.status_pagamento ===
            'pago'
        )
        .forEach(
          item => {

            const forma =
              item.forma_pagamento ||
              'Não informado';


            formas[forma] =
              (
                formas[forma] ||
                0
              ) +
              Number(
                item.valor ||
                0
              );

          }
        );


      const printArea =
        document.getElementById(
          'print-area'
        );


      if(!printArea){

        return;

      }


      printArea.innerHTML = `

        <div class="recibo-header">

          <h2>
            Fechamento do dia
          </h2>

          <div>
            ${formatDateBR(
              selectedDate
            )}
          </div>

        </div>


        <div class="recibo-row">

          <span>
            Atendimentos concluídos
          </span>

          <span>
            ${done.length}
          </span>

        </div>


        <div class="recibo-row">

          <span>
            Faturamento total
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


        <h3>
          Por forma de pagamento
        </h3>


        ${
          Object.keys(formas)
            .map(
              forma => `

                <div class="recibo-row">

                  <span>
                    ${escapeHtml(
                      forma
                    )}
                  </span>

                  <span>
                    ${money(
                      formas[forma]
                    )}
                  </span>

                </div>

              `
            )
            .join('')
        }

      `;


      window.print();


    }catch(error){

      alert(
        'Não foi possível gerar o fechamento: ' +
        error.message
      );

    }

  }


  document
    .getElementById(
      'btn-closing'
    )
    ?.addEventListener(
      'click',
      printClosing
    );


  // ============================================================
  // FINANCEIRO
  // ============================================================

  async function refreshFinanceiro(){

    const container =
      document.getElementById(
        'fin-content'
      );


    try{

      const [
        appointments,
        expenses
      ] =
        await Promise.all([
          fetchWideRange(),
          fetchWideRangeExpenses()
        ]);


      const done =
        appointments.filter(
          item =>
            item.status ===
            'concluido'
        );


      allDoneCache =
        done;


      allExpensesCache =
        expenses;


      renderFinanceiro();


    }catch(error){

      if(container){

        container.innerHTML =
          '<div class="empty">' +
            '<strong>Não foi possível carregar o financeiro</strong>' +
            escapeHtml(
              error.message
            ) +
          '</div>';

      }

    }

  }


  function renderFinanceiro(){

    const now =
      new Date();


    const month =
      String(
        now.getMonth() + 1
      ).padStart(
        2,
        '0'
      );


    const year =
      now.getFullYear();


    const prefix =
      `${year}-${month}`;


    const receita =
      allDoneCache
        .filter(
          item =>
            String(
              item.data
            ).startsWith(
              prefix
            )
        )
        .reduce(
          (sum,item) =>
            sum +
            Number(
              item.valor ||
              0
            ),
          0
        );


    const despesas =
      allExpensesCache
        .filter(
          item =>
            String(
              item.data
            ).startsWith(
              prefix
            )
        )
        .reduce(
          (sum,item) =>
            sum +
            Number(
              item.valor ||
              0
            ),
          0
        );


    const lucro =
      receita -
      despesas;


    const receitaElement =
      document.getElementById(
        'fin-receita'
      );


    const despesasElement =
      document.getElementById(
        'fin-despesas'
      );


    const lucroElement =
      document.getElementById(
        'fin-lucro'
      );


    if(receitaElement){

      receitaElement.textContent =
        money(receita);

    }


    if(despesasElement){

      despesasElement.textContent =
        money(despesas);

    }


    if(lucroElement){

      lucroElement.textContent =
        money(lucro);

    }


    renderFinanceiroChart();

  }


  function renderFinanceiroChart(){

    const chart =
      document.getElementById(
        'fin-chart'
      );


    if(!chart){

      return;

    }


    const days = [];


    const values = [];


    for(
      let i = 6;
      i >= 0;
      i--
    ){

      const date =
        new Date();


      date.setDate(
        date.getDate() -
        i
      );


      const iso =
        date
          .toISOString()
          .slice(
            0,
            10
          );


      days.push(
        iso
      );


      const value =
        allDoneCache
          .filter(
            item =>
              item.data ===
              iso
          )
          .reduce(
            (sum,item) =>
              sum +
              Number(
                item.valor ||
                0
              ),
            0
          );


      values.push(
        value
      );

    }


    const max =
      Math.max(
        ...values,
        1
      );


    chart.innerHTML =
      values
        .map(
          (value,index) => {

            const height =
              Math.max(
                4,
                (
                  value /
                  max
                ) *
                100
              );


            const label =
              new Date(
                days[index] +
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
                class="chart-column"
              >

                <div
                  class="chart-bar"
                  style="height:${height}%"
                  title="${money(value)}"
                ></div>

                <span>
                  ${label}
                </span>

              </div>

            `;

          }
        )
        .join('');

  }


  // ============================================================
  // CARREGAMENTO DE DADOS
  // ============================================================

  async function loadTabData(
    tab
  ){

    switch(tab){

      case 'agenda':

        await refreshAgenda();

        break;


      case 'faturamento':

        await refreshFaturamento();

        break;


      case 'financeiro':

        await refreshFinanceiro();

        break;


      case 'servicos':

        await loadServices();
        await refreshServicos();

        break;


      case 'clientes':

        await runClientSearch();

        break;


      case 'despesas':

        await refreshDespesas();

        break;


      case 'usuarios':

        await refreshUsuarios();

        break;

    }

  }


  async function refreshSideStats(){

    try{

      const today =
        todayISO();


      const appointments =
        await api(
          '/agendamentos?data=' +
          today
        );


      const completed =
        appointments.filter(
          item =>
            item.status ===
            'concluido'
        );


      const todayValue =
        completed.reduce(
          (sum,item) =>
            sum +
            Number(
              item.valor ||
              0
            ),
          0
        );


      const pendingValue =
        completed
          .filter(
            item =>
              item.status_pagamento !==
              'pago'
          )
          .reduce(
            (sum,item) =>
              sum +
              Number(
                item.valor ||
                0
              ),
            0
          );


      const todayElement =
        document.getElementById(
          'side-today'
        );


      const pendingElement =
        document.getElementById(
          'side-pending'
        );


      if(todayElement){

        todayElement.textContent =
          money(
            todayValue
          );

      }


      if(pendingElement){

        pendingElement.textContent =
          money(
            pendingValue
          );

      }


    }catch(error){

      console.error(
        'Erro ao atualizar estatísticas:',
        error
      );

    }

  }


  // ============================================================
  // NAVEGAÇÃO
  // ============================================================

  function activateTab(
    tab
  ){

    if(
      tab ===
      'usuarios' &&
      !isAdministrador()
    ){

      alert(
        'Apenas administradores podem acessar a área de usuários.'
      );

      return;

    }


    activeTab =
      tab;


    document
      .querySelectorAll(
        '[data-tab]'
      )
      .forEach(
        element => {

          element.classList.toggle(
            'active',
            element.dataset.tab ===
            tab
          );

        }
      );


    document
      .querySelectorAll(
        '.tab-panel'
      )
      .forEach(
        panel => {

          panel.classList.toggle(
            'active',
            panel.id ===
            'tab-' +
            tab
          );

        }
      );


    loadTabData(
      tab
    );

  }


  document
    .querySelectorAll(
      '[data-tab]'
    )
    .forEach(
      element => {

        element.addEventListener(
          'click',
          event => {

            event.preventDefault();


            activateTab(
              element.dataset.tab
            );

          }
        );

      }
    );


  // ============================================================
  // INICIALIZAÇÃO FINAL
  // ============================================================

  async function initialize(){

    selectedDate =
      todayISO();


    const date =
      document.getElementById(
        'agenda-date'
      );


    if(date){

      date.value =
        selectedDate;

    }


    await loadServices();


    await loadTabData(
      activeTab
    );


    await refreshSideStats();


    updatePermissionsVisibility();

  }


  // ============================================================
  // INICIALIZAÇÃO DA SESSÃO
  // ============================================================

  async function startApplication(){

    const token =
      localStorage.getItem(
        AUTH_TOKEN_KEY
      );


    if(!token){

      showAuth();

      return;

    }


    try{

      const response =
        await api(
          '/auth/me'
        );


      usuarioLogado =
        response.usuario ||
        response;


      empresaLogada =
        response.empresa ||
        null;


      showApp();


      atualizarDadosUsuario();


      await initialize();


    }catch(error){

      console.error(
        'Erro ao iniciar aplicação:',
        error
      );


      localStorage.removeItem(
        AUTH_TOKEN_KEY
      );


      usuarioLogado =
        null;


      empresaLogada =
        null;


      showAuth();

    }

  }


  startApplication();


  // ============================================================
  // EXPOSIÇÃO GLOBAL
  // ============================================================

  window.App =
    window.App ||
    {};


  window.App.refreshAgenda =
    refreshAgenda;


  window.App.refreshFaturamento =
    refreshFaturamento;


  window.App.refreshFinanceiro =
    refreshFinanceiro;


  window.App.refreshServicos =
    refreshServicos;


  window.App.refreshDespesas =
    refreshDespesas;


  window.App.refreshUsuarios =
    refreshUsuarios;


  window.App.openNewUser =
    openNewUser;


  window.App.closeUserModal =
    closeUserModal;


  window.App.getSelectedPermissions =
    getSelectedPermissions;


  window.App.setSelectedPermissions =
    setSelectedPermissions;


  window.App.updatePermissionsVisibility =
    updatePermissionsVisibility;


    summaryEl.innerHTML = '';


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
  


  function renderClientResults(items){

    const summaryEl =
      document.getElementById(
        'cli-summary'
      );


    const resultsEl =
      document.getElementById(
        'cli-results'
      );


    if(items.length === 0){

      summaryEl.innerHTML = '';

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
      items.map(ap => {

        const statusLabel = {
          agendado:'agendado',
          em_andamento:'em lavagem',
          concluido:'concluído',
          cancelado:'cancelado'
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

              ${escapeHtml(
                ap.cliente
              )}

            </div>


            <div class="meta">

              <span>
                ${ap.hora.slice(0,5)}
              </span>

              <span>
                ${escapeHtml(
                  ap.servico_nome ||
                  serviceName(
                    ap.servico_id
                  )
                )}
              </span>

              ${
                ap.veiculo
                  ? `<span>
                      ${escapeHtml(
                        ap.veiculo
                      )}
                    </span>`
                  : ''
              }

              ${
                ap.placa
                  ? `<span>
                      ${escapeHtml(
                        ap.placa.toUpperCase()
                      )}
                    </span>`
                  : ''
              }

            </div>

          </div>


          <div class="ticket-actions">

            <span class="price-tag">
              ${money(ap.valor)}
            </span>

          </div>

        </div>

        `;

      }).join('');
  }


  // ============================================================
  // DESPESAS
  // ============================================================

  const overlayExpense =
    document.getElementById(
      'overlay-expense'
    );


  document
    .getElementById(
      'btn-new-expense'
    )
    ?.addEventListener(
      'click',
      () => {

        document.getElementById(
          'ex-desc'
        ).value = '';


        document.getElementById(
          'ex-category'
        ).value =
          'Produtos de limpeza';


        document.getElementById(
          'ex-date'
        ).value =
          todayISO();


        document.getElementById(
          'ex-value'
        ).value = '';


        overlayExpense?.classList.add(
          'active'
        );


        document.getElementById(
          'ex-desc'
        )?.focus();
      }
    );


  document
    .getElementById(
      'btn-cancel-expense'
    )
    ?.addEventListener(
      'click',
      () =>
        overlayExpense?.classList.remove(
          'active'
        )
    );


  overlayExpense?.addEventListener(
    'click',
    e => {

      if(
        e.target ===
        overlayExpense
      ){

        overlayExpense.classList.remove(
          'active'
        );
      }

    }
  );


  document
    .getElementById(
      'form-expense'
    )
    ?.addEventListener(
      'submit',
      async e => {

        e.preventDefault();


        const payload = {

          descricao:
            document.getElementById(
              'ex-desc'
            ).value.trim(),

          categoria:
            document.getElementById(
              'ex-category'
            ).value,

          data:
            document.getElementById(
              'ex-date'
            ).value,

          valor:
            parseFloat(
              document.getElementById(
                'ex-value'
              ).value
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


          overlayExpense?.classList.remove(
            'active'
          );


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
      document.getElementById(
        'desp-list'
      );


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


    document.getElementById(
      'desp-total'
    ).textContent =
      money(total);


    document.getElementById(
      'desp-count'
    ).textContent =
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
      items.map(
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

                ${escapeHtml(
                  d.categoria
                )}

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
      ).join('');
  }


  // ============================================================
  // USUÁRIOS
  // ============================================================

  const overlayUser =
    document.getElementById(
      'overlay-user'
    );


  const formUser =
    document.getElementById(
      'form-user'
    );


  // ------------------------------------------------------------
  // PERMISSÕES DO USUÁRIO
  // ------------------------------------------------------------

  function getSelectedPermissions(){

    return Array.from(
      document.querySelectorAll(
        '#user-permissions-grid input[data-permission]:checked'
      )
    ).map(
      checkbox =>
        checkbox.dataset.permission
    );
  }


  function setSelectedPermissions(permissoes = []){

    const permissoesSet =
      new Set(
        Array.isArray(permissoes)
          ? permissoes
          : []
      );

    document
      .querySelectorAll(
        '#user-permissions-grid input[data-permission]'
      )
      .forEach(
        checkbox => {

          checkbox.checked =
            permissoesSet.has(
              checkbox.dataset.permission
            );

        }
      );
  }


  async function loadUserPermissions(id){

    const response =
      await api(
        '/usuarios/' +
        id +
        '/permissoes'
      );

    const permissoes =
      Array.isArray(response?.permissoes)
        ? response.permissoes
        : [];

    setSelectedPermissions(
      permissoes
    );

    return permissoes;
  }


  function updatePermissionsVisibility(){

    const section =
      document.getElementById(
        'user-permissions-section'
      );

    const notice =
      document.getElementById(
        'admin-permission-notice'
      );

    const profile =
      document.getElementById(
        'user-profile'
      )?.value;


    if(!section){
      return;
    }


    const administrador =
      profile === 'administrador';


    if(notice){

      notice.style.display =
        administrador
          ? 'block'
          : 'none';

    }


    section.classList.toggle(
      'permissions-disabled',
      administrador
    );


    const checkboxes =
      section.querySelectorAll(
        'input[data-permission]'
      );


    checkboxes.forEach(
      checkbox => {

        checkbox.disabled =
          administrador;

      }
    );
  }


  document
    .getElementById(
      'user-profile'
    )
    ?.addEventListener(
      'change',
      async () => {

        updatePermissionsVisibility();

        if(
          editingUserId &&
          document.getElementById(
            'user-profile'
          )?.value === 'funcionario'
        ){

          try{

            await loadUserPermissions(
              editingUserId
            );

          }catch(error){

            console.error(
              'Não foi possível carregar as permissões:',
              error
            );

          }
        }
      }
    );


  // ------------------------------------------------------------
  // ABRIR NOVO USUÁRIO
  // ------------------------------------------------------------

  document
    .getElementById(
      'btn-new-user'
    )
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


    editingUserId = null;


    const title =
      document.getElementById(
        'user-modal-title'
      );

    if(title){
      title.textContent =
        'Novo usuário';
    }


    const submit =
      document.getElementById(
        'user-submit-btn'
      );

    if(submit){
      submit.textContent =
        'Criar usuário';
    }


    const name =
      document.getElementById(
        'user-name'
      );

    const email =
      document.getElementById(
        'user-email'
      );

    const profile =
      document.getElementById(
        'user-profile'
      );

    const password =
      document.getElementById(
        'user-password'
      );

    const passwordField =
      document.getElementById(
        'user-password-field'
      );

    const activeField =
      document.getElementById(
        'user-active-field'
      );


    if(name){
      name.value = '';
    }


    if(email){
      email.value = '';
    }


    if(profile){
      profile.value =
        'funcionario';
    }


    setSelectedPermissions([]);

    updatePermissionsVisibility();


    if(password){
      password.value = '';
      password.required = true;
    }


    if(passwordField){
      passwordField.style.display = '';
    }


    if(activeField){
      activeField.style.display =
        'none';
    }


    overlayUser?.classList.add(
      'active'
    );


    name?.focus();
  }


  // ------------------------------------------------------------
  // CANCELAR USUÁRIO
  // ------------------------------------------------------------

  document
    .getElementById(
      'btn-cancel-user'
    )
    ?.addEventListener(
      'click',
      closeUserModal
    );


  overlayUser?.addEventListener(
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

    overlayUser?.classList.remove(
      'active'
    );

    editingUserId = null;

    setSelectedPermissions([]);

    const profile =
      document.getElementById(
        'user-profile'
      );

    if(profile){
      profile.value = 'funcionario';
    }

    updatePermissionsVisibility();
  }


  // ------------------------------------------------------------
  // FORMULÁRIO USUÁRIO
  // ------------------------------------------------------------

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
        document.getElementById(
          'user-name'
        )?.value.trim();


      const email =
        document.getElementById(
          'user-email'
        )?.value.trim();


      const perfil =
        document.getElementById(
          'user-profile'
        )?.value;


      const senha =
        document.getElementById(
          'user-password'
        )?.value;


      if(!nome || !email){

        alert(
          'Informe nome e e-mail.'
        );

        return;
      }


      const submit =
        document.getElementById(
          'user-submit-btn'
        );


      if(submit){

        submit.disabled = true;
        submit.textContent =
          editingUserId
            ? 'Salvando...'
            : 'Criando...';
      }


      try{

        if(editingUserId){

          const ativoSelect =
            document.getElementById(
              'user-active'
            );


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
                  ativo
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


          // ------------------------------------------------------
          // SALVAR PERMISSÕES
          // ------------------------------------------------------

          const permissoes =
            perfil === 'administrador'
              ? []
              : getSelectedPermissions();


          await api(
            '/usuarios/' +
            editingUserId +
            '/permissoes',
            {
              method:'PATCH',

              body:
                JSON.stringify({
                  permissoes
                })
            }
          );


        }else{

          if(!senha){

            alert(
              'Informe uma senha para o novo usuário.'
            );

            return;
          }


          const respostaUsuario =
            await api(
              '/usuarios',
              {
                method:'POST',

                body:
                  JSON.stringify({
                    nome,
                    email,
                    senha,
                    perfil
                  })
              }
            );


          // ------------------------------------------------------
          // SALVAR PERMISSÕES DO NOVO FUNCIONÁRIO
          // ------------------------------------------------------

          if(perfil !== 'administrador'){

            let novoUsuarioId =
              respostaUsuario?.usuario?.id ||
              respostaUsuario?.id;


            // Caso a API não devolva o ID no POST,
            // localizamos o usuário recém-criado pelo e-mail.
            if(!novoUsuarioId){

              const usuariosAtualizados =
                await api('/usuarios');

              const novoUsuario =
                usuariosAtualizados.find(
                  usuario =>
                    String(usuario.email).toLowerCase() ===
                    String(email).toLowerCase()
                );

              novoUsuarioId =
                novoUsuario?.id;
            }


            if(novoUsuarioId){

              const permissoes =
                getSelectedPermissions();


              await api(
                '/usuarios/' +
                novoUsuarioId +
                '/permissoes',
                {
                  method:'PATCH',

                  body:
                    JSON.stringify({
                      permissoes
                    })
                }
              );

            }else{

              throw new Error(
                'Usuário criado, mas não foi possível identificar o usuário para salvar as permissões.'
              );
            }
          }
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

          submit.disabled = false;

          submit.textContent =
            editingUserId
              ? 'Salvar alterações'
              : 'Criar usuário';
        }
      }

    }
  );


  // ------------------------------------------------------------
  // LISTAR USUÁRIOS
  // ------------------------------------------------------------

  async function refreshUsuarios(){

    if(!isAdministrador()){

      atualizarAcessoUsuarios();

      return;
    }


    const list =
      document.getElementById(
        'usuarios-list'
      );


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
          escapeHtml(error.message) +
        '</div>';
    }
  }


  // ------------------------------------------------------------
  // RENDERIZAR USUÁRIOS
  // ------------------------------------------------------------

  function renderUsuarios(usuarios){

    const list =
      document.getElementById(
        'usuarios-list'
      );


    if(!list){
      return;
    }


    const total =
      document.getElementById(
        'usuarios-total'
      );


    const admins =
      document.getElementById(
        'usuarios-admins'
      );


    const funcionarios =
      document.getElementById(
        'usuarios-funcionarios'
      );


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
      usuarios.map(
        usuario =>
          renderUsuario(usuario, usuarios)
      ).join('');
  }


  // ------------------------------------------------------------
  // RENDERIZAR UM USUÁRIO
  // ------------------------------------------------------------

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
      (usuario.nome || 'U')
        .charAt(0)
        .toUpperCase();


    const isCurrentUser =
      Number(usuario.id) ===
      Number(usuarioLogado?.id);


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


    let actions = '';


    // ----------------------------------------------------------
    // BOTÃO EDITAR
    // ----------------------------------------------------------

    actions +=
      `<button
        class="btn btn-small btn-ghost"
        onclick="App.editUser('${usuario.id}')"
      >
        Editar
      </button>`;


    // ----------------------------------------------------------
    // PROMOVER / REBAIXAR
    // ----------------------------------------------------------

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

      }else{

        if(!isLastAdmin){

          actions +=
            `<button
              class="btn btn-small btn-ghost"
              onclick="App.changeUserProfile('${usuario.id}','funcionario')"
            >
              Rebaixar
            </button>`;
        }
      }
    }


    // ----------------------------------------------------------
    // BLOQUEAR / ATIVAR
    // ----------------------------------------------------------

    if(!isCurrentUser){

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
    }


    // ----------------------------------------------------------
    // EXCLUIR
    // ----------------------------------------------------------

    if(!isCurrentUser){

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


  // ------------------------------------------------------------
  // EDITAR USUÁRIO
  // ------------------------------------------------------------

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
            String(u.id) ===
            String(id)
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
        document.getElementById(
          'user-modal-title'
        );


      if(title){

        title.textContent =
          'Editar usuário';
      }


      const submit =
        document.getElementById(
          'user-submit-btn'
        );


      if(submit){

        submit.textContent =
          'Salvar alterações';
      }


      const name =
        document.getElementById(
          'user-name'
        );


      const email =
        document.getElementById(
          'user-email'
        );


      const profile =
        document.getElementById(
          'user-profile'
        );


      const password =
        document.getElementById(
          'user-password'
        );


      const passwordField =
        document.getElementById(
          'user-password-field'
        );


      const activeField =
        document.getElementById(
          'user-active-field'
        );


      const active =
        document.getElementById(
          'user-active'
        );


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

        password.value = '';

        password.required = false;

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


      // ----------------------------------------------------------
      // CARREGAR PERMISSÕES ATUAIS
      // ----------------------------------------------------------

      if(
        usuario.perfil ===
        'administrador'
      ){

        setSelectedPermissions([]);

      }else{

        await loadUserPermissions(id);

      }


      updatePermissionsVisibility();


      overlayUser?.classList.add(
        'active'
      );


      name?.focus();


    }catch(error){

      alert(
        'Não foi possível carregar o usuário: ' +
        error.message
      );
    }
  }


  // ------------------------------------------------------------
  // ALTERAR PERFIL
  // ------------------------------------------------------------

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
        '/usuarios/' +
        id,
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
        'Não foi possível alterar o perfil: ' +
        error.message
      );

    }

  }


  // ------------------------------------------------------------
  // ATIVAR / BLOQUEAR
  // ------------------------------------------------------------

  async function toggleUserStatus(
    id,
    ativo
  ){

    if(!isAdministrador()){

      alert(
        'Apenas administradores podem alterar o status.'
      );

      return;
    }


    const texto =
      ativo
        ? 'ativar'
        : 'bloquear';


    if(
      !confirm(
        `Deseja ${texto} este usuário?`
      )
    ){

      return;
    }


    try{

      await api(
        '/usuarios/' +
        id +
        '/status',
        {
          method:'PATCH',

          body:
            JSON.stringify({
              ativo
            })
        }
      );


      await refreshUsuarios();


    }catch(error){

      alert(
        'Não foi possível alterar o status: ' +
        error.message
      );

    }

  }


  // ------------------------------------------------------------
  // EXCLUIR USUÁRIO
  // ------------------------------------------------------------

  async function deleteUser(
    id
  ){

    if(!isAdministrador()){

      alert(
        'Apenas administradores podem excluir usuários.'
      );

      return;
    }


    if(
      !confirm(
        'Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.'
      )
    ){

      return;
    }


    try{

      await api(
        '/usuarios/' +
        id,
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


  window.App =
    window.App ||
    {};


  window.App.removeExpense =
    removeExpense;


  window.App.editUser =
    editUser;


  window.App.changeUserProfile =
    changeUserProfile;


  window.App.toggleUserStatus =
    toggleUserStatus;


  window.App.deleteUser =
    deleteUser;


  // ============================================================
  // ATUALIZAR ACESSO DO MENU USUÁRIOS
  // ============================================================

  function atualizarAcessoUsuarios(){

    const nav =
      document.querySelector(
        '[data-tab="usuarios"]'
      );


    if(!nav){
      return;
    }


    nav.style.display =
      isAdministrador()
        ? ''
        : 'none';

  }


  function atualizarDadosUsuario(){

    const nome =
      document.getElementById(
        'sidebar-user-name'
      );


    const email =
      document.getElementById(
        'sidebar-user-email'
      );


    const avatar =
      document.getElementById(
        'sidebar-user-avatar'
      );


    if(nome){

      nome.textContent =
        usuarioLogado?.nome ||
        'Usuário';

    }


    if(email){

      email.textContent =
        usuarioLogado?.email ||
        '';

    }


    if(avatar){

      avatar.textContent =
        (
          usuarioLogado?.nome ||
          'U'
        )
          .charAt(0)
          .toUpperCase();

    }


    atualizarAcessoUsuarios();

  }


  // ============================================================
  // LOGOUT
  // ============================================================

  document
    .getElementById(
      'btn-logout'
    )
    ?.addEventListener(
      'click',
      () => {

        localStorage.removeItem(
          AUTH_TOKEN_KEY
        );


        usuarioLogado =
          null;


        empresaLogada =
          null;


        window.location.reload();

      }
    );


  // ============================================================
  // MENU MOBILE
  // ============================================================

  const sidebar =
    document.querySelector(
      '.sidebar'
    );


  const sidebarToggle =
    document.getElementById(
      'sidebar-toggle'
    );


  sidebarToggle?.addEventListener(
    'click',
    () => {

      sidebar?.classList.toggle(
        'open'
      );

    }
  );


  document
    .querySelectorAll(
      '[data-tab]'
    )
    .forEach(
      element => {

        element.addEventListener(
          'click',
          () => {

            sidebar?.classList.remove(
              'open'
            );

          }
        );

      }
  );


  // ============================================================
  // FECHAR MODAIS COM ESC
  // ============================================================

  document.addEventListener(
    'keydown',
    event => {

      if(
        event.key !==
        'Escape'
      ){

        return;

      }


      document
        .querySelectorAll(
          '.overlay.active'
        )
        .forEach(
          overlay => {

            overlay.classList.remove(
              'active'
            );

          }
        );


      editingUserId =
        null;


      editingAppointmentId =
        null;

    }
  );


  // ============================================================
  // REFRESH AUTOMÁTICO DA CONEXÃO
  // ============================================================

  async function checkConnection(){

    const indicator =
      document.getElementById(
        'connection-status'
      );


    if(!indicator){

      return;

    }


    try{

      await api(
        '/status',
        {
          skipAuth:true
        }
      );


      indicator.classList.add(
        'online'
      );


      indicator.classList.remove(
        'offline'
      );


      indicator.textContent =
        'Online';


    }catch(error){

      indicator.classList.add(
        'offline'
      );


      indicator.classList.remove(
        'online'
      );


      indicator.textContent =
        'Offline';

    }

  }


  checkConnection();


  connectionInterval =
    setInterval(
      checkConnection,
      30000
    );


  // ============================================================
  // EXPOSIÇÃO DE FUNÇÕES
  // ============================================================

  window.App =
    window.App ||
    {};


  window.App.refreshUsuarios =
    refreshUsuarios;


  window.App.refreshDespesas =
    refreshDespesas;


  window.App.activateTab =
    activateTab;


  window.App.checkConnection =
    checkConnection;


{};
