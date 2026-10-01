(function () {
  'use strict';

  const API = '/api';
  const TOKEN_KEY = 'lavajato_auth_token';

  let assinaturas = [];

  const tabela =
    document.getElementById('tabela');

  const busca =
    document.getElementById('busca');

  const status =
    document.getElementById('status');

  function token() {
    return localStorage.getItem(TOKEN_KEY);
  }

  async function api(url, options = {}) {

    const authToken = token();

    if (!authToken) {
      window.location.href = '/';
      throw new Error('Sessão não encontrada.');
    }

    const resposta = await fetch(
      `${API}${url}`,
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
          Authorization:
            `Bearer ${authToken}`
        }
      }
    );

    let dados = null;

    try {
      dados = await resposta.json();
    } catch {
      dados = null;
    }

    if (!resposta.ok) {

      if (
        resposta.status === 401
      ) {
        localStorage.removeItem(
          TOKEN_KEY
        );

        window.location.href = '/';
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

      const resposta =
        await api('/auth/me');

      if (
        resposta.usuario?.perfil !== 'dev'
      ) {
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

    if (
      valor === null ||
      valor === undefined
    ) {
      return '';
    }

    return String(valor)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function moeda(valor) {

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

  function data(valor) {

    if (!valor) {
      return '-';
    }

    const d = new Date(valor);

    if (Number.isNaN(d.getTime())) {
      return valor;
    }

    return d.toLocaleDateString(
      'pt-BR'
    );
  }

  function classeStatus(valor) {

    const statusAtual =
      String(valor || '')
        .toLowerCase();

    if (
      statusAtual === 'ativa'
    ) {
      return 'ativa';
    }

    if (
      statusAtual === 'pendente'
    ) {
      return 'pendente';
    }

    if (
      statusAtual === 'inadimplente'
    ) {
      return 'inadimplente';
    }

    return 'cancelada';
  }

  function nomeStatus(valor) {

    const nomes = {
      ativa: 'Ativa',
      pendente: 'Pendente',
      inadimplente: 'Inadimplente',
      cancelada: 'Cancelada',
      pausada: 'Pausada'
    };

    return nomes[
      String(valor || '')
        .toLowerCase()
    ] || valor || '-';
  }

  function renderizar() {

    if (!tabela) {
      return;
    }

    const termo =
      busca?.value
        ?.toLowerCase()
        .trim() || '';

    const filtro =
      status?.value || '';

    const lista =
      assinaturas.filter(item => {

        const empresa =
          (
            item.empresa_nome ||
            item.nome_empresa ||
            item.empresa ||
            ''
          ).toLowerCase();

        const plano =
          (
            item.plano_nome ||
            item.plano ||
            ''
          ).toLowerCase();

        const statusAtual =
          String(
            item.status || ''
          ).toLowerCase();

        const encontrouTexto =
          !termo ||
          empresa.includes(termo) ||
          plano.includes(termo);

        const encontrouStatus =
          !filtro ||
          statusAtual === filtro;

        return (
          encontrouTexto &&
          encontrouStatus
        );
      });

    if (!lista.length) {

      tabela.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty">
              Nenhuma assinatura encontrada.
            </div>
          </td>
        </tr>
      `;

      return;
    }

    tabela.innerHTML =
      lista.map(item => {

        const empresa =
          item.empresa_nome ||
          item.nome_empresa ||
          item.empresa ||
          '-';

        const plano =
          item.plano_nome ||
          item.plano ||
          '-';

        const valor =
          item.valor ??
          item.plano_valor ??
          0;

        const statusAtual =
          item.status || 'pendente';

        return `
          <tr>

            <td>
              ${escaparHtml(empresa)}
            </td>

            <td>
              ${escaparHtml(plano)}
            </td>

            <td>
              ${moeda(valor)}
            </td>

            <td>

              <span
                class="status ${classeStatus(
                  statusAtual
                )}"
              >
                ${escaparHtml(
                  nomeStatus(
                    statusAtual
                  )
                )}
              </span>

            </td>

            <td>
              ${data(
                item.inicio_em ||
                item.inicio
              )}
            </td>

            <td>
              ${data(
                item.proxima_cobranca_em ||
                item.proxima_cobranca
              )}
            </td>

            <td>

              <button
                class="action"
                type="button"
                onclick="window.AssinaturasAdmin.detalhes(${Number(item.id)})"
              >
                Detalhes
              </button>

            </td>

          </tr>
        `;

      }).join('');
  }

  async function carregar() {

    if (!tabela) {
      return;
    }

    tabela.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty">
            Carregando assinaturas...
          </div>
        </td>
      </tr>
    `;

    try {

      const resposta =
        await api('/admin/assinaturas');

      assinaturas =
        Array.isArray(resposta)
          ? resposta
          : (
              resposta.assinaturas ||
              resposta.data ||
              []
            );

      renderizar();

    } catch (error) {

      console.error(
        'Erro ao carregar assinaturas:',
        error
      );

      tabela.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty">
              ${escaparHtml(
                error.message
              )}
            </div>
          </td>
        </tr>
      `;
    }
  }

  async function detalhes(id) {

    try {

      const resposta =
        await api(
          `/admin/assinaturas/${id}`
        );

      const assinatura =
        resposta.assinatura ||
        resposta.data ||
        resposta;

      alert(
        `Assinatura #${id}\n\n` +
        `Empresa: ${
          assinatura.empresa_nome || '-'
        }\n` +
        `Plano: ${
          assinatura.plano_nome || '-'
        }\n` +
        `Status: ${
          assinatura.status || '-'
        }\n` +
        `Valor: ${
          moeda(assinatura.valor)
        }`
      );

    } catch (error) {

      alert(error.message);

    }
  }

  function filtrar() {
    renderizar();
  }

  function logout() {

    localStorage.removeItem(
      TOKEN_KEY
    );

    localStorage.removeItem(
      'dev_empresa_contexto'
    );

    window.location.href = '/';
  }

  window.AssinaturasAdmin = {
    detalhes,
    filtrar,
    carregar,
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

      await carregar();

    }
  );

})();