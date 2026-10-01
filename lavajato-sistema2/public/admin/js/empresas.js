(function () {
  'use strict';

  const API = '/api';
  const TOKEN_KEY = 'lavajato_auth_token';

  let empresas = [];

  const tabela = document.getElementById('empresasTabela');
  const busca = document.getElementById('busca');
  const status = document.getElementById('status');

  function obterToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  async function api(url, options = {}) {
    const token = obterToken();

    if (!token) {
      window.location.href = '/';
      throw new Error('Sessão não encontrada.');
    }

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    };

    const resposta = await fetch(`${API}${url}`, {
      ...options,
      headers
    });

    let dados = null;

    try {
      dados = await resposta.json();
    } catch {
      dados = null;
    }

    if (!resposta.ok) {
      if (resposta.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = '/';
        throw new Error('Sessão expirada.');
      }

      if (resposta.status === 403) {
        throw new Error(
          dados?.erro || 'Acesso permitido apenas ao DEV.'
        );
      }

      throw new Error(
        dados?.erro ||
        dados?.message ||
        'Erro ao comunicar com o servidor.'
      );
    }

    return dados;
  }

  async function verificarDev() {
    try {
      const resposta = await api('/auth/me');

      const usuario = resposta.usuario;

      if (!usuario || usuario.perfil !== 'dev') {
        window.location.href = '/';
        return false;
      }

      return true;

    } catch (error) {
      console.error(error);
      return false;
    }
  }

  function escaparHtml(valor) {
    if (valor === null || valor === undefined) {
      return '';
    }

    return String(valor)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatarData(data) {
    if (!data) {
      return '-';
    }

    const valor = new Date(data);

    if (Number.isNaN(valor.getTime())) {
      return data;
    }

    return valor.toLocaleDateString('pt-BR');
  }

  function obterNomeEmpresa(empresa) {
    return (
      empresa.nome ||
      empresa.razao_social ||
      empresa.nome_empresa ||
      '-'
    );
  }

  function obterStatus(empresa) {
    if (
      empresa.ativo === true ||
      empresa.status === 'ativa' ||
      empresa.status === 'ativo'
    ) {
      return 'ativa';
    }

    if (
      empresa.status === 'pendente'
    ) {
      return 'pendente';
    }

    return 'inativa';
  }

  function textoStatus(statusEmpresa) {
    const textos = {
      ativa: 'Ativa',
      pendente: 'Pendente',
      inativa: 'Inativa'
    };

    return textos[statusEmpresa] || statusEmpresa;
  }

  function renderizar() {
    if (!tabela) {
      return;
    }

    const termo =
      busca?.value
        ?.toLowerCase()
        .trim() || '';

    const filtroStatus =
      status?.value || '';

    const filtradas = empresas.filter(empresa => {

      const nome = obterNomeEmpresa(empresa)
        .toLowerCase();

      const email = (
        empresa.email ||
        empresa.email_contato ||
        ''
      ).toLowerCase();

      const administrador = (
        empresa.administrador_nome ||
        empresa.nome_administrador ||
        ''
      ).toLowerCase();

      const statusAtual =
        obterStatus(empresa);

      const encontrouTexto =
        !termo ||
        nome.includes(termo) ||
        email.includes(termo) ||
        administrador.includes(termo);

      const encontrouStatus =
        !filtroStatus ||
        statusAtual === filtroStatus;

      return encontrouTexto && encontrouStatus;
    });

    if (!filtradas.length) {
      tabela.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty">
              Nenhuma empresa encontrada.
            </div>
          </td>
        </tr>
      `;

      return;
    }

    tabela.innerHTML = filtradas.map(empresa => {

      const id = empresa.id;

      const nome =
        obterNomeEmpresa(empresa);

      const administrador =
        empresa.administrador_nome ||
        empresa.nome_administrador ||
        '-';

      const email =
        empresa.email ||
        empresa.email_contato ||
        '-';

      const plano =
        empresa.plano_nome ||
        empresa.plano ||
        '-';

      const statusAtual =
        obterStatus(empresa);

      return `
        <tr>

          <td>
            ${escaparHtml(nome)}
          </td>

          <td>
            ${escaparHtml(administrador)}
          </td>

          <td>
            ${escaparHtml(email)}
          </td>

          <td>
            ${escaparHtml(plano)}
          </td>

          <td>
            <span class="status ${escaparHtml(statusAtual)}">
              ${escaparHtml(
                textoStatus(statusAtual)
              )}
            </span>
          </td>

          <td>

            <div class="actions">

              <button
                class="action"
                type="button"
                onclick="window.EmpresasAdmin.detalhes(${Number(id)})"
              >
                Detalhes
              </button>

              <button
                class="action"
                type="button"
                onclick="window.EmpresasAdmin.testar(${Number(id)})"
              >
                Entrar como teste
              </button>

            </div>

          </td>

        </tr>
      `;
    }).join('');
  }

  async function carregarEmpresas() {
    if (!tabela) {
      return;
    }

    tabela.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty">
            Carregando empresas...
          </div>
        </td>
      </tr>
    `;

    try {
      const resposta =
        await api('/admin/empresas');

      empresas =
        Array.isArray(resposta)
          ? resposta
          : (
              resposta.empresas ||
              resposta.data ||
              []
            );

      renderizar();

    } catch (error) {

      console.error(
        'Erro ao carregar empresas:',
        error
      );

      tabela.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty">
              ${escaparHtml(error.message)}
            </div>
          </td>
        </tr>
      `;
    }
  }

  async function detalhes(id) {
    try {

      const resposta =
        await api(`/admin/empresas/${id}`);

      const empresa =
        resposta.empresa ||
        resposta.data ||
        resposta;

      const nome =
        obterNomeEmpresa(empresa);

      const email =
        empresa.email ||
        empresa.email_contato ||
        '-';

      const telefone =
        empresa.telefone ||
        '-';

      alert(
        `Empresa: ${nome}\n` +
        `E-mail: ${email}\n` +
        `Telefone: ${telefone}`
      );

    } catch (error) {

      alert(error.message);

    }
  }

  async function testar(id) {

    try {

      const resposta =
        await api(
          `/admin/empresas/${id}/contexto`,
          {
            method: 'POST'
          }
        );

      if (resposta.token) {
        localStorage.setItem(
          TOKEN_KEY,
          resposta.token
        );
      }

      if (resposta.empresa) {
        localStorage.setItem(
          'dev_empresa_contexto',
          JSON.stringify(
            resposta.empresa
          )
        );
      }

      window.location.href = '/';

    } catch (error) {

      alert(
        error.message ||
        'Não foi possível selecionar a empresa.'
      );

    }
  }

  function novaEmpresa() {
    alert(
      'O cadastro de empresa pelo painel DEV será conectado ao backend na próxima etapa.'
    );
  }

  function filtrar() {
    renderizar();
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('dev_empresa_contexto');

    window.location.href = '/';
  }

  window.EmpresasAdmin = {
    detalhes,
    testar,
    novaEmpresa,
    filtrar,
    carregar: carregarEmpresas,
    logout
  };

  document.addEventListener(
    'DOMContentLoaded',
    async () => {

      const autorizado =
        await verificarDev();

      if (!autorizado) {
        return;
      }

      busca?.addEventListener(
        'input',
        renderizar
      );

      status?.addEventListener(
        'change',
        renderizar
      );

      await carregarEmpresas();

    }
  );

})();