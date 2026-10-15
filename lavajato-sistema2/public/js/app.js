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
      label: 'Placa',
      placeholder: 'ABC1D23',
      upper: true
    },
    extra2: {
      label: 'Veículo',
      placeholder: 'Modelo / cor'
    }
  },

  barbearia: {
    nome: 'Barbearia / Salão de beleza',
    cliente: 'Cliente',
    servico: 'Serviço',
    servicos: 'Serviços',
    novoServico: 'Novo serviço',
    extra1: {
      label: 'Profissional',
      placeholder: 'Quem vai atender'
    },
    extra2: null
  },

  clinica: {
    nome: 'Clínica / Consultório',
    cliente: 'Paciente',
    servico: 'Procedimento',
    servicos: 'Procedimentos',
    novoServico: 'Novo procedimento',
    extra1: {
      label: 'Convênio',
      placeholder: 'Particular, Unimed...'
    },
    extra2: {
      label: 'Profissional',
      placeholder: 'Médico / dentista'
    }
  },

  pet: {
    nome: 'Pet shop / Veterinária',
    cliente: 'Tutor',
    servico: 'Serviço',
    servicos: 'Serviços',
    novoServico: 'Novo serviço',
    extra1: {
      label: 'Nome do pet',
      placeholder: 'Ex: Thor'
    },
    extra2: {
      label: 'Raça / porte',
      placeholder: 'Ex: Golden, grande'
    }
  },

  oficina: {
    nome: 'Oficina mecânica',
    cliente: 'Cliente',
    servico: 'Serviço',
    servicos: 'Serviços',
    novoServico: 'Novo serviço',
    extra1: {
      label: 'Placa',
      placeholder: 'ABC1D23',
      upper: true
    },
    extra2: {
      label: 'Veículo',
      placeholder: 'Modelo / ano'
    }
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

  personalizados: {
    nome: 'Produtos personalizados',
    cliente: 'Cliente',
    servico: 'Produto personalizado',
    servicos: 'Produtos personalizados',
    novoServico: 'Novo produto personalizado',
    extra1: {
      label: 'Personalização',
      placeholder: 'Nome, frase, logo, arte...'
    },
    extra2: {
      label: 'Material',
      placeholder: 'MDF, acrílico, tecido, metal...'
    }
  },

  moveis: {
    nome: 'Móveis / Marcenaria',
    cliente: 'Cliente',
    servico: 'Projeto / Móvel',
    servicos: 'Projetos e móveis',
    novoServico: 'Novo projeto / móvel',
    extra1: {
      label: 'Tipo de móvel',
      placeholder: 'Armário, mesa, painel...'
    },
    extra2: {
      label: 'Material',
      placeholder: 'MDF, madeira maciça...'
    }
  },

  grafica: {
    nome: 'Gráfica / Comunicação visual',
    cliente: 'Cliente',
    servico: 'Produto gráfico',
    servicos: 'Produtos gráficos',
    novoServico: 'Novo produto gráfico',
    extra1: {
      label: 'Tipo de material',
      placeholder: 'Banner, adesivo, cartão...'
    },
    extra2: {
      label: 'Formato / tamanho',
      placeholder: 'A4, 10x15 cm...'
    }
  },

  confeccao: {
    nome: 'Costura / Confecção / Ajustes',
    cliente: 'Cliente',
    servico: 'Peça / Serviço',
    servicos: 'Peças e serviços',
    novoServico: 'Nova peça / serviço',
    extra1: {
      label: 'Tipo de peça',
      placeholder: 'Calça, vestido, camisa...'
    },
    extra2: {
      label: 'Ajuste / medida',
      placeholder: 'Barra, cintura, comprimento...'
    }
  },

  eletronicos: {
    nome: 'Assistência técnica / Eletrônicos',
    cliente: 'Cliente',
    servico: 'Reparo',
    servicos: 'Reparos e serviços',
    novoServico: 'Novo reparo',
    extra1: {
      label: 'Equipamento',
      placeholder: 'Celular, notebook, TV...'
    },
    extra2: {
      label: 'Marca / modelo',
      placeholder: 'Marca e modelo do equipamento'
    }
  },

  construcao: {
    nome: 'Construção / Reformas',
    cliente: 'Cliente',
    servico: 'Serviço / Projeto',
    servicos: 'Serviços e projetos',
    novoServico: 'Novo serviço / projeto',
    extra1: {
      label: 'Local da obra',
      placeholder: 'Endereço ou identificação'
    },
    extra2: {
      label: 'Tipo de serviço',
      placeholder: 'Pintura, elétrica, reforma...'
    }
  },

  fotografia: {
    nome: 'Fotografia / Vídeo',
    cliente: 'Cliente',
    servico: 'Ensaio / Evento',
    servicos: 'Ensaios e eventos',
    novoServico: 'Novo ensaio / evento',
    extra1: {
      label: 'Tipo de trabalho',
      placeholder: 'Casamento, aniversário, ensaio...'
    },
    extra2: {
      label: 'Local',
      placeholder: 'Estúdio ou endereço'
    }
  },

  eventos: {
    nome: 'Eventos / Festas',
    cliente: 'Contratante',
    servico: 'Evento / Serviço',
    servicos: 'Eventos e serviços',
    novoServico: 'Novo evento / serviço',
    extra1: {
      label: 'Tipo de evento',
      placeholder: 'Casamento, aniversário, corporativo...'
    },
    extra2: {
      label: 'Local do evento',
      placeholder: 'Salão, endereço ou espaço'
    }
  },

  limpeza: {
    nome: 'Limpeza / Conservação',
    cliente: 'Cliente',
    servico: 'Serviço de limpeza',
    servicos: 'Serviços de limpeza',
    novoServico: 'Novo serviço de limpeza',
    extra1: {
      label: 'Local',
      placeholder: 'Casa, apartamento, empresa...'
    },
    extra2: {
      label: 'Tipo de limpeza',
      placeholder: 'Regular, pós-obra, pesada...'
    }
  },

  tecnologia: {
    nome: 'Tecnologia / Desenvolvimento de sistemas',
    cliente: 'Cliente',
    servico: 'Projeto / Serviço',
    servicos: 'Projetos e serviços',
    novoServico: 'Novo projeto / serviço',
    extra1: {
      label: 'Tipo de projeto',
      placeholder: 'Site, sistema, aplicativo...'
    },
    extra2: {
      label: 'Tecnologia / Plataforma',
      placeholder: 'Web, mobile, integração...'
    }
  },

  generico: {
    nome: 'Outro tipo de negócio',
    cliente: 'Cliente',
    servico: 'Serviço',
    servicos: 'Serviços',
    novoServico: 'Novo serviço',
    extra1: null,
    extra2: null
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
  // API
  // ============================================================

  async function api(path, options = {}) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    const headers = Object.assign(
      {
        'Content-Type': 'application/json'
      },
      options.headers || {}
    );

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const requestOptions = Object.assign(
      {},
      options,
      { headers }
    );

    const res = await fetch(API + path, requestOptions);

    if (res.status === 401) {
      if (
        path !== '/auth/login' &&
        path !== '/auth/cadastro'
      ) {
        localStorage.removeItem(AUTH_TOKEN_KEY);

        usuarioLogado = null;
        empresaLogada = null;

        showAuthScreen();

        const erroSessao = new Error(
          'Sessão expirada. Faça login novamente.'
        );

        erroSessao.status = 401;
        throw erroSessao;
      }
    }

    if (!res.ok) {
      let msg = 'Erro na requisição';
      let codigo = null;

      try {
        const resposta = await res.json();
        msg = resposta.erro || msg;
        codigo = resposta.codigo || null;
      } catch (e) {
        // A resposta pode não conter JSON.
      }

      const erro = new Error(msg);
      erro.status = res.status;
      erro.codigo = codigo;

      throw erro;
    }

    if (res.status === 204) {
      return null;
    }

    return res.json();
  }


  // ============================================================
  // MODAL DE CLIENTES — ABRIR E FECHAR
  // ============================================================

  (function configurarModalClientes() {
    document.addEventListener('click', function (event) {
      const origem = event.target;

      if (!(origem instanceof Element)) {
        return;
      }

      const botao = origem.closest(
        '#btn-ap-new-client, #btn-cli-new'
      );

      if (!botao) {
        return;
      }

      event.preventDefault();

      const modal = document.getElementById('cli-form-modal');
      const formulario = document.getElementById('cli-form');

      if (!modal || !formulario) {
        console.error(
          'Orvix: modal ou formulário de clientes não encontrado.',
          {
            modalEncontrado: Boolean(modal),
            formularioEncontrado: Boolean(formulario)
          }
        );

        return;
      }

      formulario.reset();

      const campoId = document.getElementById('cli-form-id');
      const titulo = document.getElementById('cli-form-title');
      const erro = document.getElementById('cli-form-error');
      const salvar = document.getElementById('btn-cli-save');

      if (campoId) {
        campoId.value = '';
      }

      if (titulo) {
        titulo.textContent = 'Novo cliente';
      }

      if (erro) {
        erro.textContent = '';
        erro.hidden = true;
      }

      if (salvar) {
        salvar.disabled = false;
        salvar.textContent = 'Salvar cliente';
      }

      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');

      requestAnimationFrame(function () {
        const estilo = getComputedStyle(modal);

        console.log('Orvix: modal de clientes aberto.', {
          display: estilo.display,
          visibility: estilo.visibility,
          classeIsOpen: modal.classList.contains('is-open')
        });

        document.getElementById('cli-form-nome')?.focus();
      });
    });

    document.addEventListener('click', function (event) {
      const origem = event.target;

      if (!(origem instanceof Element)) {
        return;
      }

      if (!origem.closest('[data-cli-form-close]')) {
        return;
      }

      event.preventDefault();

      const modal = document.getElementById('cli-form-modal');

      if (!modal) {
        return;
      }

      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    });
  })();


  
  // ============================================================
  // SALVAR CLIENTE — CADASTRO E EDIÇÃO
  // ============================================================

  document.addEventListener('submit', async function (event) {
    const formulario = event.target;

if (
  !(formulario instanceof HTMLFormElement) ||
  formulario.getAttribute('id') !== 'cli-form'
) {
  return;
}

    

    console.log('[CLIENTE 1] Listener executado.');

    event.preventDefault();
    event.stopImmediatePropagation();

    console.log('[CLIENTE 2] Envio nativo bloqueado:', {
      defaultPrevented: event.defaultPrevented
    });

    const modal = document.getElementById('cli-form-modal');
    const erro = document.getElementById('cli-form-error');
    const botao = document.getElementById('btn-cli-save');
    const campoId = document.getElementById('cli-form-id');

    if (!botao) {
      console.error('[CLIENTE ERRO] Botão de salvar não encontrado.');
      return;
    }

    if (botao.disabled) {
      console.warn('[CLIENTE] Botão já está desabilitado.');
      return;
    }

    const id = campoId?.value?.trim() || '';
    const dados = Object.fromEntries(
      new FormData(formulario).entries()
    );

    delete dados.id;

    console.log('[CLIENTE 3] Dados preparados.', {
      operacao: id ? 'editar' : 'cadastrar',
      nome: dados.nome,
      email: dados.email
    });

    if (erro) {
      erro.textContent = '';
      erro.hidden = true;
    }

    botao.disabled = true;
    botao.textContent = 'Salvando...';

    try {
      const endpoint = id
        ? `/clientes/${encodeURIComponent(id)}`
        : '/clientes';

      const metodo = id ? 'PATCH' : 'POST';

      console.log('[CLIENTE 4] Chamando API.', {
        endpoint,
        metodo,
        tipoApi: typeof api
      });

      const cliente = await api(endpoint, {
        method: metodo,
        body: JSON.stringify(dados)
      });

      console.log('[CLIENTE 5] Resposta da API recebida.', cliente);

      if (!cliente || cliente.id == null) {
        throw new Error(
          'A API não retornou os dados do cliente salvo.'
        );
      }

      if (modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
      }

      const overlay = document.getElementById('overlay-appointment');
      const estiloOverlay = overlay
        ? getComputedStyle(overlay)
        : null;

      const agendamentoAberto = Boolean(
        overlay &&
        estiloOverlay.display !== 'none' &&
        estiloOverlay.visibility !== 'hidden' &&
        overlay.getClientRects().length > 0
      );

      if (agendamentoAberto) {
        const campoCliente = document.getElementById('ap-client');
        const campoTelefone = document.getElementById('ap-phone');
        const campoClienteId = document.getElementById('ap-client-id');

        if (campoCliente) campoCliente.value = cliente.nome || '';
        if (campoTelefone) campoTelefone.value = cliente.telefone || '';
        if (campoClienteId) campoClienteId.value = cliente.id;

        console.log('[CLIENTE 6] Cliente selecionado no agendamento.');
        return;
      }

      const busca = document.getElementById('cli-search-input');
      const botaoBusca = document.getElementById('btn-cli-search');

      if (busca) {
        busca.value = cliente.nome || '';
        botaoBusca?.click();
      }

      console.log('[CLIENTE 6] Cadastro concluído.');

    } catch (e) {
      console.error('[CLIENTE ERRO] Falha no cadastro:', e);

      if (erro) {
        erro.textContent =
          e.message || 'Não foi possível salvar o cliente.';
        erro.hidden = false;
      }
    } finally {
      botao.disabled = false;
      botao.textContent = 'Salvar cliente';
    }
  }, true);

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
                senha,
                aceite_termos: $('register-terms')?.checked === true

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



/* =========================================================
   MODAL DE AGENDAMENTO
   Novo agendamento, edição e seleção de clientes
   ========================================================= */

const overlayAppointment = $('overlay-appointment');

let apClientSearchTimer = null;
let apClientSearchRequest = 0;

const apClientInput = $('ap-client');
const apClientIdInput = $('ap-client-id');
const apClientPhoneInput = $('ap-phone');
const apClientSuggestions = $('ap-client-suggestions');
const apClientHint = $('ap-client-hint');
const apAppointmentForm = $('form-appointment');

/* =========================================================
   REQUISIÇÕES
   ========================================================= */

async function requisicaoJSON(url, options = {}) {
  const resposta = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  if (resposta.status === 204) {
    return null;
  }

  const texto = await resposta.text();
  let dados = {};

  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = { erro: texto };
    }
  }

  if (!resposta.ok) {
    throw new Error(
      dados.erro ||
      dados.message ||
      `Erro na requisição (${resposta.status}).`
    );
  }

  return dados;
}

/* =========================================================
   CLIENTES: SUGESTÕES E SELEÇÃO
   ========================================================= */

function fecharSugestoesClientes() {
  if (!apClientSuggestions) return;

  apClientSuggestions.hidden = true;
  apClientSuggestions.replaceChildren();
}

function limparVinculoCliente() {
  if (apClientIdInput) {
    apClientIdInput.value = '';
  }

  if (apClientHint) {
    apClientHint.textContent =
      'Pesquise um cliente cadastrado ou digite um novo nome.';
  }
}

function selecionarClienteAgendamento(cliente) {
  if (!cliente || cliente.id == null) return;

  const nome = cliente.cliente || cliente.nome || '';

  apClientInput.value = nome;
  apClientIdInput.value = String(cliente.id);

  if (apClientPhoneInput) {
    apClientPhoneInput.value = cliente.telefone || '';
  }

  if (apClientHint) {
    apClientHint.textContent =
      'Cliente cadastrado selecionado.';
  }

  fecharSugestoesClientes();
}

function renderizarSugestoesClientes(clientes) {
  if (!apClientSuggestions) return;

  apClientSuggestions.replaceChildren();

  // A rota existente também pode devolver registros históricos
  // sem cadastro. Somente clientes com ID podem ser selecionados.
  const cadastrados = clientes.filter(
    cliente => cliente.id !== null && cliente.id !== undefined
  );

  if (cadastrados.length === 0) {
    const vazio = document.createElement('div');
    vazio.className = 'ap-client-empty';
    vazio.textContent = 'Nenhum cliente cadastrado encontrado.';

    apClientSuggestions.appendChild(vazio);
    apClientSuggestions.hidden = false;
    return;
  }

  cadastrados.forEach(cliente => {
    const botao = document.createElement('button');

    botao.type = 'button';
    botao.className = 'ap-client-option';
    botao.setAttribute('role', 'option');

    const nome = document.createElement('span');
    nome.className = 'ap-client-option-name';
    nome.textContent = cliente.cliente || cliente.nome || 'Sem nome';

    const telefone = document.createElement('span');
    telefone.className = 'ap-client-option-phone';
    telefone.textContent = cliente.telefone || 'Sem telefone';

    botao.append(nome, telefone);

    // Impede que o blur feche a lista antes da seleção.
    botao.addEventListener('mousedown', event => {
      event.preventDefault();
      selecionarClienteAgendamento(cliente);
    });

    apClientSuggestions.appendChild(botao);
  });

  apClientSuggestions.hidden = false;
}

async function buscarClientesAgendamento(termo) {
  const numeroRequisicao = ++apClientSearchRequest;

  if (!apClientSuggestions) return;

  if (termo.length < 2) {
    fecharSugestoesClientes();
    return;
  }

  const carregando = document.createElement('div');
  carregando.className = 'ap-client-empty';
  carregando.textContent = 'Buscando clientes...';

  apClientSuggestions.replaceChildren(carregando);
  apClientSuggestions.hidden = false;

  try {
const clientes = await api(
  '/clientes?busca=' + encodeURIComponent(termo)
);

    // Descarta resultados de pesquisas anteriores.
    if (numeroRequisicao !== apClientSearchRequest) return;

    renderizarSugestoesClientes(
      Array.isArray(clientes) ? clientes : []
    );
  } catch (erro) {
    if (numeroRequisicao !== apClientSearchRequest) return;

    console.error('Erro ao pesquisar clientes:', erro);

    apClientSuggestions.replaceChildren();

    const mensagem = document.createElement('div');
    mensagem.className = 'ap-client-empty';
    mensagem.textContent = 'Erro ao carregar clientes. Tente novamente.';

    apClientSuggestions.appendChild(mensagem);
    apClientSuggestions.hidden = false;
  }
}

function prepararClienteNovoAgendamento() {
  if (apClientInput) apClientInput.value = '';
  if (apClientIdInput) apClientIdInput.value = '';
  if (apClientPhoneInput) apClientPhoneInput.value = '';

  limparVinculoCliente();
  fecharSugestoesClientes();

  clearTimeout(apClientSearchTimer);
  apClientSearchRequest++;
}

apClientInput?.addEventListener('input', () => {

    waitlistSelecionadoId = null;
  if ($('ap-waitlist')) $('ap-waitlist').value = '';
  // Alterar o texto invalida a seleção anterior.
  limparVinculoCliente();

  clearTimeout(apClientSearchTimer);

  const termo = apClientInput.value.trim();

  apClientSearchTimer = setTimeout(() => {
    buscarClientesAgendamento(termo);
  }, 250);
});

apClientInput?.addEventListener('focus', () => {
  const termo = apClientInput.value.trim();

  if (termo.length >= 2 && !apClientIdInput?.value) {
    clearTimeout(apClientSearchTimer);

    apClientSearchTimer = setTimeout(() => {
      buscarClientesAgendamento(termo);
    }, 100);
  }
});

document.addEventListener('click', event => {
  const campo = document.querySelector('.ap-client-search');

  if (campo && !campo.contains(event.target)) {
    fecharSugestoesClientes();
  }
});

/* =========================================================
   LISTA DE ESPERA NO AGENDAMENTO
   ========================================================= */

let waitlistItens = [];
let waitlistSelecionadoId = null;

function esconderListaEsperaAgendamento() {
  waitlistSelecionadoId = null;
  const campo = $('ap-waitlist-field');
  const select = $('ap-waitlist');
  if (select) select.value = '';
  if (campo) campo.style.display = 'none';
}

async function carregarListaEsperaAgendamento() {
  const campo = $('ap-waitlist-field');
  const select = $('ap-waitlist');
  if (!campo || !select) return;

  waitlistSelecionadoId = null;
  select.replaceChildren(
    new Option('Selecionar da lista de espera (opcional)', '')
  );

  try {
    const resposta = await api('/lista-espera');
    waitlistItens = (resposta?.itens || []).filter(
      item => !['convertido', 'desistiu'].includes(item.status)
    );
  } catch (erro) {
    console.warn('Não foi possível carregar a lista de espera:', erro);
    waitlistItens = [];
  }

  waitlistItens.forEach(item => {
    const nome = item.nome_exibicao || item.cliente || 'Sem nome';
    select.appendChild(
      new Option(`${nome} — ${item.telefone || 'sem telefone'}`, String(item.id))
    );
  });

  campo.style.display = waitlistItens.length ? '' : 'none';
}

$('ap-waitlist')?.addEventListener('change', () => {
  const item = waitlistItens.find(
    i => String(i.id) === $('ap-waitlist').value
  );

  waitlistSelecionadoId = item ? item.id : null;
  if (!item) return;

  apClientInput.value = item.nome_exibicao || item.cliente || '';
  apClientPhoneInput.value = item.telefone || '';

  if (item.cliente_id) {
    apClientIdInput.value = String(item.cliente_id);
    if (apClientHint) apClientHint.textContent = 'Cliente cadastrado selecionado.';
  } else {
    limparVinculoCliente();
  }

  fecharSugestoesClientes();

  const data = String(item.data_desejada || '').slice(0, 10);
  if (data && data >= todayISO()) $('ap-date').value = data;

  if (item.hora_inicio) {
    $('ap-time').value = String(item.hora_inicio).slice(0, 5);
  }

  const servicoId = String(item.servico_id || '');
  if (servicoId && [...$('ap-service').options].some(o => o.value === servicoId)) {
    $('ap-service').value = servicoId;
    updatePriceFromService();
  }

  $('ap-notes').value = item.observacoes || '';
});

/* =========================================================
   ABRIR MODAL
   ========================================================= */

async function prepararFormularioAgendamento() {
  if (!state.services || state.services.length === 0) {
    await loadServices();
  }

  fillServiceSelect();
}

$('btn-new-appointment')?.addEventListener('click', async () => {
  editingAppointmentId = null;

  $('appointment-modal-title').textContent = 'Novo agendamento';
  $('appointment-submit-btn').textContent = 'Agendar';

  apAppointmentForm?.reset();
  prepararClienteNovoAgendamento();

  $('ap-date').value = selectedDate || '';
  $('ap-time').value = '';

  try {
    await prepararFormularioAgendamento();
    updatePriceFromService();

    overlayAppointment?.classList.add('active');
    apClientInput?.focus();
    carregarListaEsperaAgendamento();
  } catch (erro) {
    console.error('Erro ao preparar agendamento:', erro);
    alert(erro.message || 'Não foi possível abrir o formulário.');
  }
});

$('btn-cancel-appointment')?.addEventListener('click', () => {
  overlayAppointment?.classList.remove('active');
  fecharSugestoesClientes();
});

overlayAppointment?.addEventListener('click', event => {
  if (event.target === overlayAppointment) {
    overlayAppointment.classList.remove('active');
    fecharSugestoesClientes();
  }
});

/* =========================================================
   EDITAR AGENDAMENTO
   ========================================================= */

async function openEditAppointment(id) {
  const agendamento = (currentAgendaItems || []).find(
    item => mesmoId(item.id, id)
  );

  if (!agendamento) {
    alert('Agendamento não encontrado na agenda atual.');
    return;
  }

  editingAppointmentId = agendamento.id;
    esconderListaEsperaAgendamento();

  $('appointment-modal-title').textContent = 'Editar agendamento';
  $('appointment-submit-btn').textContent = 'Salvar alterações';

  try {
    await prepararFormularioAgendamento();

    $('ap-date').value = String(agendamento.data || '').slice(0, 10);
    $('ap-time').value = String(agendamento.hora || '').slice(0, 5);

    apClientInput.value = agendamento.cliente || '';
    apClientIdInput.value = agendamento.cliente_id
      ? String(agendamento.cliente_id)
      : '';

    apClientPhoneInput.value = agendamento.telefone || '';

    $('ap-plate').value = agendamento.placa || '';
    $('ap-vehicle').value = agendamento.veiculo || '';
    $('ap-service').value = String(agendamento.servico_id || '');
    $('ap-price').value = agendamento.valor ?? 0;
    $('ap-notes').value = agendamento.observacoes || '';

    if (apClientHint) {
      apClientHint.textContent = agendamento.cliente_id
        ? 'Cliente cadastrado vinculado a este agendamento.'
        : 'Agendamento antigo sem vínculo com cadastro.';
    }

    fecharSugestoesClientes();
    overlayAppointment?.classList.add('active');
  } catch (erro) {
    console.error('Erro ao abrir agendamento:', erro);
    alert(erro.message || 'Não foi possível abrir o agendamento.');
  }
}

/* =========================================================
   SERVIÇOS E PREÇO
   ========================================================= */

function fillServiceSelect() {
  const select = $('ap-service');

  if (!select) return;

  select.replaceChildren();

  if (!state.services || state.services.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Nenhum serviço disponível';
    select.appendChild(option);
    return;
  }

  state.services.forEach(servico => {
    const option = document.createElement('option');

    option.value = String(servico.id);
    option.textContent =
      `${servico.nome} — ${money(servico.preco)}`;

    select.appendChild(option);
  });
}

$('ap-service')?.addEventListener('change', updatePriceFromService);

function updatePriceFromService() {
  const select = $('ap-service');
  if (!select) return;

  const servico = (state.services || []).find(
    item => mesmoId(item.id, select.value)
  );

  if (servico) {
    $('ap-price').value = servico.preco ?? 0;
  }
}

/* =========================================================
   SALVAR NOVO AGENDAMENTO OU EDIÇÃO
   ========================================================= */

apAppointmentForm?.addEventListener('submit', async event => {
  event.preventDefault();

  const botaoSalvar = $('appointment-submit-btn');

  if (botaoSalvar?.disabled) return;

  const nomeCliente = apClientInput.value.trim();

  if (!nomeCliente) {
    alert('Informe o nome do cliente ou selecione um cadastro.');
    apClientInput.focus();
    return;
  }

  const clienteId = apClientIdInput.value.trim();

  const valor = Number($('ap-price').value);

  if (!Number.isFinite(valor) || valor < 0) {
    alert('Informe um valor válido para o agendamento.');
    $('ap-price').focus();
    return;
  }

  const dados = {
    cliente_id: clienteId || null,
    cliente: nomeCliente,
    telefone: apClientPhoneInput.value.trim() || null,
    data: $('ap-date').value,
    hora: $('ap-time').value,
    placa: $('ap-plate').value.trim() || null,
    veiculo: $('ap-vehicle').value.trim() || null,
    servico_id: $('ap-service').value,
    valor,
    observacoes: $('ap-notes').value.trim() || null
  };

  if (!dados.data || !dados.hora || !dados.servico_id) {
    alert('Preencha a data, o horário e o serviço.');
    return;
  }

  const editando = editingAppointmentId !== null &&
    editingAppointmentId !== undefined;

  const url = editando
    ? `/api/agendamentos/${encodeURIComponent(editingAppointmentId)}`
    : '/api/agendamentos';

  const metodo = editando ? 'PATCH' : 'POST';
  const textoOriginal = botaoSalvar?.textContent;

  try {
    if (botaoSalvar) {
      botaoSalvar.disabled = true;
      botaoSalvar.textContent = editando ? 'Salvando...' : 'Agendando...';
    }

    await requisicaoJSON(url, {
      method: metodo,
      body: JSON.stringify(dados)
    });

    overlayAppointment?.classList.remove('active');
    fecharSugestoesClientes();

    alert(editando
      ? 'Agendamento atualizado com sucesso.'
      : 'Agendamento criado com sucesso.');

    // A tela da agenda pode ouvir este evento para recarregar os dados.
    document.dispatchEvent(
      new CustomEvent('agendamentos:atualizado', {
        detail: {
          id: editingAppointmentId,
          data: dados.data,
          editando
        }
      })
    );

    // Recarrega a página para refletir a alteração na agenda.
    // Se seu app já tiver uma função de atualização da agenda,
    // substitua esta linha pela chamada dessa função.
    window.location.reload();
  } catch (erro) {
    console.error('Erro ao salvar agendamento:', erro);
    alert(erro.message || 'Não foi possível salvar o agendamento.');
  } finally {
    if (botaoSalvar) {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = textoOriginal ||
        (editando ? 'Salvar alterações' : 'Agendar');
    }
  }
});



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

  let salvandoAgendamento = false;

  $('form-appointment')?.addEventListener('submit', async e => {
    e.preventDefault();

    // Impede envios simultâneos.
    if (salvandoAgendamento) return;

    const botaoSalvar = $('appointment-submit-btn');

    salvandoAgendamento = true;

    if (botaoSalvar) {
      botaoSalvar.disabled = true;
    }

    try {
      const n = getNicho();

      const payload = {
        data: $('ap-date').value,
        hora: $('ap-time').value,
        cliente: $('ap-client').value.trim(),
        telefone: $('ap-phone').value.trim(),

        cliente_id: $('ap-client-id')?.value || null,

        placa: n.extra1
          ? $('ap-plate').value.trim()
          : '',

        veiculo: n.extra2
          ? $('ap-vehicle').value.trim()
          : '',

        observacoes: (
          $('ap-notes')?.value || ''
        ).trim(),

        servico_id: $('ap-service').value,

        valor: parseFloat($('ap-price').value) || 0
      };

      const edicao = Boolean(editingAppointmentId);

      // --------------------------------------------------------
      // FUNÇÃO DE GRAVAÇÃO
      // --------------------------------------------------------

      const salvar = async () => {
        return api(
          edicao
            ? '/agendamentos/' + editingAppointmentId
            : '/agendamentos',
          {
            method: edicao ? 'PATCH' : 'POST',
            body: JSON.stringify(payload)
          }
        );
      };

      // --------------------------------------------------------
      // VERIFICAÇÃO PRÉVIA DE CONFLITO
      // --------------------------------------------------------

      const conflito = await findConflict(
        payload.data,
        payload.hora,
        payload.servico_id,
        editingAppointmentId
      );

      if (conflito) {
        const nomeServico =
          conflito.servico_nome ||
          serviceName(conflito.servico_id);

        const horaExistente = String(
          conflito.hora || ''
        ).slice(0, 5);

        const duracaoExistente = Number(
          conflito.duracao_min || 30
        );

        const inicio = horaExistente
          .split(':')
          .map(Number);

        const fimMinutos =
          inicio[0] * 60 +
          inicio[1] +
          duracaoExistente;

        const horaFim =
          String(Math.floor(fimMinutos / 60) % 24)
            .padStart(2, '0') +
          ':' +
          String(fimMinutos % 60)
            .padStart(2, '0');

        const seguir = confirm(
          `CONFLITO DE HORÁRIO\n\n` +
          `Cliente: ${conflito.cliente || 'Não informado'}\n` +
          `Serviço: ${nomeServico}\n` +
          `Horário: ${horaExistente} às ${horaFim}\n\n` +
          `O período desse agendamento se sobrepõe ao horário escolhido.\n\n` +
          `Deseja agendar mesmo assim?`
        );

        if (!seguir) {
          return;
        }

        // O backend só permite a sobreposição
        // quando existe confirmação explícita.
        payload.forcar_conflito = true;
      }

      // --------------------------------------------------------
      // PRIMEIRA TENTATIVA DE GRAVAÇÃO
      // --------------------------------------------------------

      try {
        await salvar();
      } catch (err) {
        /*
         * Se o frontend não encontrou o conflito, mas o backend
         * encontrou, solicita confirmação usando os dados
         * retornados pela API.
         */
        const resposta = err.resposta || err.data || err.body;
        const status = err.status || err.statusCode;
        const codigo =
          resposta?.codigo ||
          err.codigo;

        if (
          status !== 409 &&
          codigo !== 'CONFLITO_HORARIO'
        ) {
          throw err;
        }

        // Evita repetir a confirmação se já houve confirmação.
        if (payload.forcar_conflito === true) {
          throw err;
        }

        const conflitoApi = resposta?.conflito;

        if (!conflitoApi) {
          alert(
            'O horário está ocupado, mas não foi possível ' +
            'obter os detalhes do agendamento conflitante. ' +
            'Atualize a agenda e tente novamente.'
          );
          return;
        }

        const nomeServico =
          conflitoApi.servico_nome ||
          serviceName(conflitoApi.servico_id);

        const seguir = confirm(
          `CONFLITO DE HORÁRIO\n\n` +
          `Cliente: ${conflitoApi.cliente || 'Não informado'}\n` +
          `Serviço: ${nomeServico}\n` +
          `Horário: ${String(conflitoApi.hora).slice(0, 5)}\n\n` +
          `${resposta?.erro || 'Esse período se sobrepõe a outro agendamento.'}\n\n` +
          `Deseja continuar mesmo assim?`
        );

        if (!seguir) {
          return;
        }

        // Segunda tentativa: agora com autorização explícita.
        payload.forcar_conflito = true;

        await salvar();
      }

            // Marca a pessoa da lista de espera como convertida
      if (!edicao && waitlistSelecionadoId) {
        try {
          await api(
            `/lista-espera/${encodeURIComponent(waitlistSelecionadoId)}/status`,
            {
              method: 'PATCH',
              body: JSON.stringify({ status: 'convertido' })
            }
          );
        } catch (e) {
          console.warn('Não foi possível atualizar a lista de espera:', e);
        }

        waitlistSelecionadoId = null;
      }

      // --------------------------------------------------------
      // SUCESSO
      // --------------------------------------------------------

      overlayAppointment?.classList.remove('active');

      selectedDate = payload.data;

      if (dateInput) {
        dateInput.value = selectedDate;
      }

      await refreshAgenda();
      await refreshSideStats();

    } catch (err) {
      console.error('Erro ao salvar agendamento:', err);

      alert(
        'Não foi possível salvar: ' +
        (err.message || 'Erro inesperado.')
      );

    } finally {
      salvandoAgendamento = false;

      if (botaoSalvar) {
        botaoSalvar.disabled = false;
      }
    }
  });




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

(async function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let clientesAtuais = [];

  // ==========================================================
  // UTILITÁRIOS
  // ==========================================================

  function formatarData(data) {
    if (!data) return '—';

    const valor = String(data).slice(0, 10);
    const partes = valor.split('-');

    if (partes.length !== 3) return valor;

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function formatarHora(hora) {
    return hora ? String(hora).slice(0, 5) : '—';
  }

  function formatarDinheiro(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function escapar(valor) {
    if (typeof escapeHtml === 'function') {
      return escapeHtml(String(valor ?? ''));
    }

    return String(valor ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function normalizarNome(valor) {
    return String(valor || '')
      .trim()
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function statusTexto(status) {
    const estados = {
      agendado: 'Agendado',
      pendente: 'Pendente',
      confirmado: 'Confirmado',
      em_andamento: 'Em andamento',
      concluido: 'Concluído',
      cancelado: 'Cancelado',
      nao_compareceu: 'Não compareceu',
      'não_compareceu': 'Não compareceu'
    };

    return estados[String(status || '').toLowerCase()]
      || status
      || 'Sem status';
  }

  // ==========================================================
  // MODAL DE HISTÓRICO
  // ==========================================================

  function criarModalClientes() {
    if ($('cli-history-modal')) return;

    const modal = document.createElement('div');

    modal.id = 'cli-history-modal';
    modal.className = 'cli-modal';
    modal.setAttribute('aria-hidden', 'true');

    modal.innerHTML = `
      <div class="cli-modal-backdrop" data-close-modal></div>

      <section
        class="cli-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cli-modal-title"
      >
        <header class="cli-modal-header">
          <div>
            <span class="cli-modal-eyebrow">
              CADASTRO DE CLIENTE
            </span>

            <h2 id="cli-modal-title">
              Histórico do cliente
            </h2>

            <p id="cli-modal-phone"></p>
          </div>

          <button
            type="button"
            class="cli-modal-close"
            data-close-modal
            aria-label="Fechar"
          >&times;</button>
        </header>

        <div
          id="cli-modal-summary"
          class="cli-modal-summary"
        ></div>

        <div class="cli-modal-section">
          <h3>Histórico de serviços</h3>

          <div id="cli-modal-history">
            <div class="cli-modal-loading">
              Carregando histórico...
            </div>
          </div>
        </div>
      </section>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-modal]')) {
        fecharModalCliente();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (
        event.key === 'Escape' &&
        modal.classList.contains('open')
      ) {
        fecharModalCliente();
      }
    });
  }

  function abrirModalCliente() {
    criarModalClientes();

    const modal = $('cli-history-modal');

    if (!modal) return;

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cli-modal-open');
  }

  function fecharModalCliente() {
    const modal = $('cli-history-modal');

    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cli-modal-open');
  }

  // ==========================================================
  // LISTAGEM DE CLIENTES
  // ==========================================================

  function renderizarClientes(clientes) {
    const resumo = $('cli-summary');
    const resultados = $('cli-results');

    if (!resumo || !resultados) return;

    clientesAtuais = clientes;

    if (!clientes.length) {
      resumo.innerHTML = '';

      resultados.innerHTML = `
        <div class="empty">
          <strong>Nenhum cliente encontrado</strong>
          Confira o nome ou telefone informado.
        </div>
      `;

      return;
    }

    resumo.innerHTML = `
      <div class="totals-strip">
        <div class="stat-card">
          <div class="label">Clientes encontrados</div>
          <div class="value">${clientes.length}</div>
        </div>

        <div class="stat-card">
          <div class="label">Atendimentos</div>
          <div class="value">
            ${clientes.reduce(
              (total, item) =>
                total + Number(item.total_atendimentos || 0),
              0
            )}
          </div>
        </div>

        <div class="stat-card money">
          <div class="label">Total gasto</div>
          <div class="value">
            ${formatarDinheiro(
              clientes.reduce(
                (total, item) =>
                  total + Number(item.total_gasto || 0),
                0
              )
            )}
          </div>
        </div>
      </div>
    `;

    resultados.innerHTML = clientes.map((cliente, indice) => `
      <button
        type="button"
        class="cli-client-card"
        data-client-index="${indice}"
      >
        <span class="cli-client-avatar" aria-hidden="true">
          ${escapar(
            String(cliente.cliente || cliente.nome || '?')
              .trim()
              .charAt(0)
              .toUpperCase()
          )}
        </span>

        <span class="cli-client-main">
          <strong>
            ${escapar(cliente.cliente || cliente.nome || 'Cliente')}
          </strong>

          <span>
            ${escapar(
              cliente.telefone || 'Sem telefone cadastrado'
            )}
          </span>

          <small>
            ${Number(cliente.total_atendimentos || 0)}
            atendimento(s)
            · Última visita:
            ${formatarData(cliente.ultima_visita)}
          </small>
        </span>

        <span class="cli-client-right">
          <strong>
            ${formatarDinheiro(cliente.total_gasto)}
          </strong>

          <span>Ver histórico &rarr;</span>
        </span>
      </button>
    `).join('');
  }

  // ==========================================================
  // PESQUISA DE CLIENTES
  // ==========================================================

  async function runClientSearch() {
    const input = $('cli-search-input');
    const resultados = $('cli-results');
    const resumo = $('cli-summary');

    if (!input || !resultados || !resumo) return;

    const termo = input.value.trim();

    if (!termo) {
      resumo.innerHTML = '';

      resultados.innerHTML = `
        <div class="empty">
          <strong>Busque um cliente</strong>
          Digite o nome ou telefone para consultar o histórico.
        </div>
      `;

      clientesAtuais = [];
      return;
    }

    resultados.innerHTML = `
      <div class="empty">Buscando clientes...</div>
    `;

    resumo.innerHTML = '';

    try {
      const clientes = await api(
        '/clientes?busca=' + encodeURIComponent(termo)
      );

      if (!Array.isArray(clientes)) {
        throw new Error('Resposta inválida do servidor.');
      }

      renderizarClientes(clientes);
    } catch (error) {
      console.error('Erro na busca de clientes:', error);

      resultados.innerHTML = `
        <div class="empty">
          <strong>Não foi possível buscar clientes</strong>
          Verifique a conexão e tente novamente.
        </div>
      `;
    }
  }

  // ==========================================================
  // HISTÓRICO DO CLIENTE
  // ==========================================================

  async function abrirHistoricoCliente(cliente) {
    if (!cliente) return;

    criarModalClientes();
    abrirModalCliente();

    const titulo = $('cli-modal-title');
    const telefoneElemento = $('cli-modal-phone');
    const resumo = $('cli-modal-summary');
    const historicoElemento = $('cli-modal-history');

    if (!titulo || !telefoneElemento || !resumo || !historicoElemento) {
      console.error('Elementos do modal de clientes não encontrados.');
      return;
    }

    const nomeCliente = String(
      cliente.cliente || cliente.nome || 'Cliente'
    ).trim();

    titulo.textContent = nomeCliente || 'Cliente';

    telefoneElemento.textContent =
      cliente.telefone || 'Telefone não cadastrado';

    resumo.innerHTML = '';

    historicoElemento.innerHTML = `
      <div class="cli-modal-loading">
        Carregando histórico...
      </div>
    `;

    try {
      const clienteId = Number(cliente.id);
      const clienteCadastrado =
        Number.isSafeInteger(clienteId) && clienteId > 0;

      let parametro;

      if (clienteCadastrado) {
        // Para clientes cadastrados, consulta pelo ID exato.
        parametro =
          'cliente_id=' + encodeURIComponent(clienteId);
      } else {
        // Para clientes antigos sem cadastro, prioriza o nome.
        // Não usa telefone compartilhado como identificação única.
        parametro =
          'cliente=' + encodeURIComponent(nomeCliente);
      }

      const historicoRecebido = await api(
        '/clientes/historico?' + parametro
      );

      if (!Array.isArray(historicoRecebido)) {
        throw new Error('Resposta inválida do servidor.');
      }

      let historicoCliente;

      if (clienteCadastrado) {
        // Segurança adicional: exige vínculo exato pelo ID.
        historicoCliente = historicoRecebido.filter(
          item => Number(item.cliente_id) === clienteId
        );
      } else {
        // Sem ID não existe vínculo confiável.
        // Mantém apenas registros sem cliente_id e com nome igual.
        historicoCliente = historicoRecebido.filter(item => {
          const semVinculo =
            item.cliente_id === null ||
            item.cliente_id === undefined ||
            item.cliente_id === '';

          return (
            semVinculo &&
            normalizarNome(item.cliente) ===
              normalizarNome(nomeCliente)
          );
        });
      }

      const nicho = String(
        historicoCliente[0]?.nicho_empresa ||
        cliente.nicho_empresa ||
        'generico'
      ).toLowerCase();

      const exibirVeiculo = [
        'lavajato',
        'oficina'
      ].includes(nicho);

      const rotuloServico = {
        lavajato: 'Serviço realizado',
        barbearia: 'Serviço realizado',
        clinica: 'Procedimento / consulta',
        pet: 'Serviço realizado',
        oficina: 'Serviço realizado',
        personal: 'Atendimento',
        generico: 'Serviço / atendimento'
      }[nicho] || 'Serviço / atendimento';

      const concluidos = historicoCliente.filter(
        item =>
          String(item.status || '').toLowerCase() === 'concluido'
      );

      const totalGasto = concluidos.reduce(
        (total, item) => total + Number(item.valor || 0),
        0
      );

      resumo.innerHTML = `
        <div class="totals-strip">
          <div class="stat-card">
            <div class="label">Atendimentos</div>
            <div class="value">${historicoCliente.length}</div>
          </div>

          <div class="stat-card">
            <div class="label">Concluídos</div>
            <div class="value">${concluidos.length}</div>
          </div>

          <div class="stat-card money">
            <div class="label">Total gasto</div>
            <div class="value">
              ${formatarDinheiro(totalGasto)}
            </div>
          </div>

          <div class="stat-card">
            <div class="label">Última visita</div>
            <div class="value">
              ${formatarData(historicoCliente[0]?.data)}
            </div>
          </div>
        </div>
      `;

      if (!historicoCliente.length) {
        historicoElemento.innerHTML = `
          <div class="empty">
            <strong>Nenhum atendimento encontrado</strong>
            Este cliente não possui atendimentos vinculados
            ao seu cadastro.
          </div>
        `;

        return;
      }

      historicoElemento.innerHTML = `
        <div class="cli-history-list">
          ${historicoCliente.map(item => `
            <article class="cli-history-item">
              <div class="cli-history-item-header">
                <div>
                  <strong>
                    ${escapar(item.servico_nome || rotuloServico)}
                  </strong>

                  <span>
                    ${formatarData(item.data)}
                    às ${formatarHora(item.hora)}
                  </span>
                </div>

                <span class="cli-history-status">
                  ${escapar(statusTexto(item.status))}
                </span>
              </div>

              <div class="cli-history-item-details">
                <div>
                  <span class="label">Valor</span>
                  <strong>
                    ${formatarDinheiro(item.valor)}
                  </strong>
                </div>

                ${item.status_pagamento ? `
                  <div>
                    <span class="label">Pagamento</span>
                    <strong>
                      ${escapar(item.status_pagamento)}
                    </strong>
                  </div>
                ` : ''}

                ${item.forma_pagamento ? `
                  <div>
                    <span class="label">Forma de pagamento</span>
                    <strong>
                      ${escapar(item.forma_pagamento)}
                    </strong>
                  </div>
                ` : ''}

                ${exibirVeiculo && item.veiculo ? `
                  <div>
                    <span class="label">Veículo</span>
                    <strong>${escapar(item.veiculo)}</strong>
                  </div>
                ` : ''}

                ${exibirVeiculo && item.placa ? `
                  <div>
                    <span class="label">Placa</span>
                    <strong>${escapar(item.placa)}</strong>
                  </div>
                ` : ''}
              </div>

              ${item.observacoes ? `
                <div class="cli-history-observations">
                  <span class="label">Observações</span>
                  <p>${escapar(item.observacoes)}</p>
                </div>
              ` : ''}
            </article>
          `).join('')}
        </div>
      `;
    } catch (error) {
      console.error(
        'Erro ao carregar histórico do cliente:',
        error
      );

      resumo.innerHTML = '';

      historicoElemento.innerHTML = `
        <div class="empty">
          <strong>Não foi possível carregar o histórico</strong>
          Verifique a conexão e tente novamente.
        </div>
      `;
    }
  }

  // ==========================================================
  // EVENTOS DA INTERFACE
  // ==========================================================

  $('btn-cli-search')?.addEventListener(
    'click',
    runClientSearch
  );

  $('cli-search-input')?.addEventListener(
    'keydown',
    event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runClientSearch();
      }
    }
  );

  $('cli-search-input')?.addEventListener(
    'input',
    event => {
      $('btn-cli-clear')?.classList.toggle(
        'visible',
        event.target.value.length > 0
      );
    }
  );

  $('btn-cli-clear')?.addEventListener('click', () => {
    const input = $('cli-search-input');

    if (input) input.value = '';

    clientesAtuais = [];

    $('btn-cli-clear')?.classList.remove('visible');

    if ($('cli-summary')) {
      $('cli-summary').innerHTML = '';
    }

    if ($('cli-results')) {
      $('cli-results').innerHTML = `
        <div class="empty">
          <strong>Busque um cliente</strong>
          Digite o nome ou telefone para consultar o histórico.
        </div>
      `;
    }

    input?.focus();
  });

  $('cli-results')?.addEventListener('click', event => {
    const card = event.target.closest('[data-client-index]');

    if (!card) return;

    const indice = Number(card.dataset.clientIndex);
    const cliente = clientesAtuais[indice];

    if (cliente) {
      abrirHistoricoCliente(cliente);
    }
  });

  criarModalClientes();
})();


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
// ORVIX — MODAL OBRIGATÓRIO DE ASSINATURA
// ============================================================

let carregandoPlanosObrigatorios = false;
let redirecionandoParaAssinatura = false;



// ============================================================
// OBTER ELEMENTOS
// ============================================================

function obterModalPlano() {
  return $('modal-plano-obrigatorio');
}


// ============================================================
// MOSTRAR MODAL
// ============================================================

function mostrarModalPlano() {
  const modal = obterModalPlano();

  if (!modal) {
    console.error(
      'Modal #modal-plano-obrigatorio não encontrado.'
    );
    return;
  }

  if (redirecionandoParaAssinatura) {
    return;
  }

  modal.classList.remove('hidden');

  modal.style.setProperty('display', 'flex', 'important');
  modal.style.removeProperty('visibility');
  modal.style.removeProperty('pointer-events');

  modal.setAttribute('aria-hidden', 'false');

  document.body.style.overflow = 'hidden';

  // O carregamento é controlado pela própria função.
  carregarPlanosObrigatorios();
}


// ============================================================
// ESCONDER MODAL
// ============================================================

function esconderModalPlano() {
  const modal = obterModalPlano();

  if (!modal) {
    return;
  }

  modal.classList.add('hidden');

  modal.style.setProperty('display', 'none', 'important');
  modal.style.setProperty('visibility', 'hidden', 'important');
  modal.style.setProperty('pointer-events', 'none', 'important');

  modal.setAttribute('aria-hidden', 'true');

  document.body.style.overflow = '';
}


// ============================================================
// CARREGAR PLANOS DISPONÍVEIS
// ============================================================

async function carregarPlanosObrigatorios() {
  const loading = $('modal-plano-loading');
  const lista = $('modal-plano-lista');
  const erro = $('modal-plano-erro');

  if (!lista || carregandoPlanosObrigatorios) {
    return;
  }

  carregandoPlanosObrigatorios = true;

  try {
    if (loading) {
      loading.style.display = 'block';
    }

    lista.innerHTML = '';

    if (erro) {
      erro.textContent = '';
      erro.style.display = 'none';
    }

    const resposta = await api('/planos/disponiveis');

    const planos = Array.isArray(resposta)
      ? resposta
      : Array.isArray(resposta?.planos)
        ? resposta.planos
        : [];

    if (planos.length === 0) {
      if (erro) {
        erro.textContent =
          'Nenhum plano está disponível no momento.';

        erro.style.display = 'block';
      }

      return;
    }

    planos.forEach((plano) => {
      if (!plano || !plano.id) {
        return;
      }

      const card = document.createElement('div');
      card.className = 'modal-plano-card';

      const nome = document.createElement('h3');
      nome.textContent = plano.nome || 'Plano';

      const descricao = document.createElement('div');
      descricao.className = 'modal-plano-card-descricao';
      descricao.textContent =
        plano.descricao || 'Plano para sua empresa.';

      const preco = document.createElement('div');
      preco.className = 'modal-plano-card-preco';

      const valor = Number(plano.valor);

      preco.textContent = Number.isFinite(valor)
        ? valor.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
          })
        : 'Valor não informado';

      const periodo = document.createElement('small');
      periodo.textContent = `/${plano.periodo || 'mês'}`;

      preco.appendChild(periodo);

      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'modal-plano-btn';
      botao.textContent = 'Escolher plano';

      botao.addEventListener('click', () => {
        selecionarPlanoObrigatorio(plano, botao);
      });

      card.appendChild(nome);
      card.appendChild(descricao);
      card.appendChild(preco);
      card.appendChild(botao);

      lista.appendChild(card);
    });

    if (lista.children.length === 0 && erro) {
      erro.textContent =
        'Nenhum plano válido está disponível no momento.';

      erro.style.display = 'block';
    }
  } catch (error) {
    console.error(
      'Erro ao carregar planos:',
      error
    );

    if (erro) {
      erro.textContent =
        error.message ||
        'Não foi possível carregar os planos. Tente novamente.';

      erro.style.display = 'block';
    }
  } finally {
    carregandoPlanosObrigatorios = false;

    if (loading) {
      loading.style.display = 'none';
    }
  }
}


// ============================================================
// SELECIONAR PLANO
// ============================================================


function selecionarPlanoObrigatorio(plano, botao) {
  if (
    redirecionandoParaAssinatura ||
    !plano ||
    !plano.id
  ) {
    return;
  }

  try {
    sessionStorage.setItem(
      'orvix_plano_selecionado',
      JSON.stringify(plano)
    );

    redirecionandoParaAssinatura = true;

    if (botao) {
      botao.disabled = true;
      botao.textContent = 'Redirecionando...';
    }

    // Fecha o modal antes de navegar.
    esconderModalPlano();

    window.location.assign('/assinaturas.html');
  } catch (error) {
    console.error(
      'Erro ao selecionar plano:',
      error
    );

    redirecionandoParaAssinatura = false;

    if (botao) {
      botao.disabled = false;
      botao.textContent = 'Escolher plano';
    }

    const erro = $('modal-plano-erro');

    if (erro) {
      erro.textContent =
        'Não foi possível selecionar o plano. Tente novamente.';

      erro.style.display = 'block';
    }
  }
}


// ============================================================
// VERIFICAR ASSINATURA OBRIGATÓRIA
// ============================================================

async function verificarAssinaturaObrigatoria() {
  if (!usuarioLogado) {
    assinaturaVerificada = false;
    return false;
  }

  const perfil = String(
    usuarioLogado.perfil || ''
  ).toLowerCase();

  const contaTesteUsuario =
    usuarioLogado.conta_teste === true;

  const contaTesteEmpresa =
    typeof empresaLogada !== 'undefined' &&
    empresaLogada?.conta_teste === true;

  // Contas que não exigem assinatura.
  if (
    perfil === 'dev' ||
    contaTesteUsuario ||
    contaTesteEmpresa
  ) {
    assinaturaVerificada = true;
    esconderModalPlano();
    return true;
  }

  const empresaId =
    usuarioLogado.empresa_id ??
    (
      typeof empresaLogada !== 'undefined'
        ? empresaLogada?.id
        : null
    );

  if (!empresaId) {
    assinaturaVerificada = false;
    mostrarModalPlano();
    return false;
  }

  try {
    // IMPORTANTE:
    // Esta URL deve corresponder à rota real do backend.
    const resposta = await api(
      '/mercado-pago/minha-assinatura'
    );

    const possuiAssinatura =
      resposta?.possui_assinatura === true;

    const status = String(
      resposta?.assinatura?.status || ''
    ).trim().toLowerCase();

    const assinaturaValida =
      possuiAssinatura &&
      ['ativa', 'authorized', 'active'].includes(status);

    if (assinaturaValida) {
      assinaturaVerificada = true;
      esconderModalPlano();
      return true;
    }

    assinaturaVerificada = false;
    mostrarModalPlano();

    return false;
  } catch (error) {
    console.error(
      'Erro ao verificar assinatura obrigatória:',
      error
    );

    assinaturaVerificada = false;
    mostrarModalPlano();

    return false;
  }
}


// ============================================================
// INICIALIZAR ESTADO VISUAL DO MODAL
// ============================================================

function inicializarModalPlanoObrigatorio() {
  const modal = obterModalPlano();

  if (!modal) {
    console.warn(
      'Modal obrigatório de plano não encontrado nesta página.'
    );
    return;
  }

  modal.classList.add('hidden');

  modal.style.setProperty('display', 'none', 'important');

  modal.setAttribute('aria-hidden', 'true');
}


// ============================================================
// INICIALIZAÇÃO
// ============================================================

inicializarModalPlanoObrigatorio();


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

$('btn-logout')?.addEventListener('click', async () => {
  if (!confirm('Deseja sair da sua conta?')) return;

  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'same-origin'
    });
  } catch (_) {
    // Mesmo sem rede, o acesso local é encerrado abaixo.
  }

  localStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event('orvix:sessao-alterada'));

  usuarioLogado = null;
  empresaLogada = null;

  window.location.reload();
});


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
   Links internos e externos seguros
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

    async function requisitar(
        path,
        options = {},
        tokenEsperado = obterToken()
    ) {
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
            throw new Error(
                'Acesso às notificações não autorizado.'
            );
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
       SEGURANÇA E FORMATAÇÃO
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

    /**
     * Aceita:
     * - Caminhos internos: /relatorios.html
     * - URLs HTTP/HTTPS: https://exemplo.com
     *
     * Rejeita:
     * - javascript:
     * - data:
     * - vbscript:
     * - URLs com protocolo não permitido
     * - URLs relativas ambíguas
     */
    function validarLink(valor) {
        if (typeof valor !== 'string' || !valor.trim()) {
            return null;
        }

        const link = valor.trim();

        try {
            if (link.startsWith('/') && !link.startsWith('//')) {
                const urlInterna = new URL(link, window.location.origin);

                if (urlInterna.origin !== window.location.origin) {
                    return null;
                }

                return {
                    href: urlInterna.pathname +
                        urlInterna.search +
                        urlInterna.hash,
                    externo: false
                };
            }

            const urlExterna = new URL(link);

            if (
                urlExterna.protocol !== 'https:' &&
                urlExterna.protocol !== 'http:'
            ) {
                return null;
            }

            return {
                href: urlExterna.href,
                externo: urlExterna.origin !== window.location.origin
            };
        } catch (_) {
            return null;
        }
    }

    function formatarData(valor) {
        if (!valor) return '';

        const data = new Date(valor);

        if (Number.isNaN(data.getTime())) {
            return '';
        }

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

    /* =====================================================
       RENDERIZAÇÃO
       ===================================================== */

    function renderizarNotificacoes() {
        if (!notificacoes.length) {
            mostrarMensagem('Nenhuma notificação por enquanto.');
            return;
        }

        lista.innerHTML = notificacoes.map(notificacao => {
            const naoLida = !notificacao.lida_em;
            const linkValido = validarLink(notificacao.link);

            const acaoLink = linkValido
                ? `
                    <a
                        class="notificacao-link"
                        href="${escaparHTML(linkValido.href)}"
                        data-notificacao-abrir-link="true"
                        ${linkValido.externo
                            ? 'target="_blank" rel="noopener noreferrer"'
                            : ''}
                        aria-label="Acessar página: ${escaparHTML(notificacao.titulo)}"
                    >
                        Acessar página
                        <span aria-hidden="true">↗</span>
                    </a>
                `
                : '';

            return `
                <article
                    class="notificacao-item ${naoLida ? 'nao-lida' : ''}"
                    data-notificacao-id="${escaparHTML(notificacao.id)}"
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

                    ${acaoLink}

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
        if (!sincronizarSessao()) return false;

        const token = obterToken();

        try {
            await requisitar(
                `/notificacoes/${encodeURIComponent(id)}/lida`,
                { method: 'PATCH' },
                token
            );

            return (
                obterToken() === token &&
                usuarioAutenticado()
            );
        } catch (erro) {
            console.error(
                '[Orvix] Erro ao marcar notificação como lida:',
                erro
            );

            return false;
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

        const notificacao = notificacoes.find(
            item => String(item.id) === String(id)
        );

        if (notificacao && !notificacao.lida_em) {
            const marcada = await marcarComoLida(id);

            if (marcada) {
                notificacao.lida_em = new Date().toISOString();

                elemento.classList.remove('nao-lida');
            }
        }
    }

    async function abrirLinkNotificacao(linkElemento, evento) {
        const hrefOriginal = linkElemento.getAttribute('href');

        const linkValido = validarLink(hrefOriginal);

        if (!linkValido) {
            evento.preventDefault();

            console.warn(
                '[Orvix] Link de notificação inválido.'
            );

            return;
        }

        evento.preventDefault();
        evento.stopPropagation();

        const item = linkElemento.closest('.notificacao-item');

        if (!item) return;

        const id = item.dataset.notificacaoId;
        const notificacao = notificacoes.find(
            itemAtual => String(itemAtual.id) === String(id)
        );

        if (notificacao && !notificacao.lida_em) {
            await abrirNotificacao(item);
        }

        if (!usuarioAutenticado()) return;

        if (linkValido.externo) {
            window.open(
                linkValido.href,
                '_blank',
                'noopener,noreferrer'
            );
        } else {
            window.location.assign(linkValido.href);
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
        const link = evento.target.closest(
            '[data-notificacao-abrir-link="true"]'
        );

        if (link) {
            await abrirLinkNotificacao(link, evento);
            return;
        }

        const item = evento.target.closest('.notificacao-item');

        if (item) {
            await abrirNotificacao(item);
        }
    });

    lista.addEventListener('keydown', async evento => {
        const link = evento.target.closest(
            '[data-notificacao-abrir-link="true"]'
        );

        // Links funcionam normalmente com Enter.
        // Não intercepta Enter ou Espaço em links.
        if (link) return;

        if (evento.key !== 'Enter' && evento.key !== ' ') {
            return;
        }

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

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && sincronizarSessao()) {
            carregarNotificacoes();
        }
    });

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

    /* =====================================================
       INICIALIZAÇÃO
       ===================================================== */

    sincronizarSessao();

    intervalo = window.setInterval(() => {
        if (sincronizarSessao()) {
            carregarNotificacoes();
        }
    }, INTERVALO_ATUALIZACAO);

    window.addEventListener('pagehide', () => {
        if (intervalo !== null) {
            window.clearInterval(intervalo);
            intervalo = null;
        }
    });
})();

})();