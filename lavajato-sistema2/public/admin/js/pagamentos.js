(function () {
  'use strict';

  const API = '/api';
  const TOKEN_KEY = 'lavajato_auth_token';

  let pagamentos = [];

  const tabela =
    document.getElementById('tabela');

  const busca =
    document.getElementById('busca');

  const status =
    document.getElementById('status');

  function obterToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  async function api(url, options = {}) {

    const token =
      obterToken();

    if (!token) {
      window.location.href = '/';
      throw new Error(
        'Sessão não encontrada.'
      );
    }

    const resposta =
      await fetch(
        `${API}${url}`,
        {
          ...options,
          headers: {
            'Content-Type':
              'application/json',
            ...(options.headers || {}),
            Authorization:
              `Bearer ${token}`
          }
        }
      );

    let dados = null;

    try {
      dados =
        await resposta.json();
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

    return Number(
      valor || 0
    ).toLocaleString(
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

    const d =
      new Date(valor);

    if (
      Number.isNaN(
        d.getTime()
      )
    ) {
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
      statusAtual === 'aprovado' ||
      statusAtual === 'approved'
    ) {
      return 'aprovado';
    }

    if (
      statusAtual === 'pendente' ||
      statusAtual === 'pending'
    ) {
      return 'pendente';
    }

    return 'rejeitado';
  }

  function nomeStatus(valor) {

    const statusAtual =
      String(valor || '')
        .toLowerCase();

    if (
      statusAtual === 'aprovado' ||
      statusAtual === 'approved'
    ) {
      return 'Aprovado';
    }

    if (
      statusAtual === 'pendente' ||
      statusAtual === 'pending'
    ) {
      return 'Pendente';
    }

    if (
      statusAtual === 'cancelado' ||
      statusAtual === 'cancelled'
    ) {
      return 'Cancelado';
    }

    if (
      statusAtual === 'rejeitado' ||
      statusAtual === 'rejected'
    ) {
      return 'Rejeitado';
    }

    return valor || '-';
  }

  function atualizarResumo(lista) {

    const total =
      lista.length;

    const aprovados =
      lista.filter(item =>
        ['aprovado', 'approved']
          .includes(
            String(
              item.status || ''
            ).toLowerCase()
          )
      ).length;

    const pendentes =
      lista.filter(item =>
        ['pendente', 'pending']
          .includes(
            String(
              item.status || ''
            ).toLowerCase()
          )
      ).length;

    const receita =
      lista
        .filter(item =>
          ['aprovado', 'approved']
            .includes(
              String(
                item.status || ''
              ).toLowerCase()
            )
        )
        .reduce(
          (
            totalAtual,
            item
          ) =>
            totalAtual +
            Number(
              item.valor || 0
            ),
          0
        );

    const cards =
      document.querySelectorAll(
        '.card-value'
      );

    if (cards[0]) {
      cards[0].textContent =
        total;
    }

    if (cards[1]) {
      cards[1].textContent =
        aprovados;
    }

    if (cards[2]) {
      cards[2].textContent =
        pendentes;
    }

    if (cards[3]) {
      cards[3].textContent =
        moeda(receita);
    }
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
      pagamentos.filter(item => {

        const empresa =
          (
            item.empresa_nome ||
            item.nome_empresa ||
            item.empresa ||
            ''
          ).toLowerCase();

        const transacao =
          (
            item.transacao_id ||
            item.mercado_pago_id ||
            item.pagamento_id ||
            ''
          ).toLowerCase();

        const statusAtual =
          String(
            item.status || ''
          ).toLowerCase();

        const encontrouTexto =
          !termo ||
          empresa.includes(termo) ||
          transacao.includes(termo);

        const encontrouStatus =
          !filtro ||
          statusAtual === filtro ||
          (
            filtro === 'aprovado' &&
            statusAtual === 'approved'
          ) ||
          (
            filtro === 'pendente' &&
            statusAtual === 'pending'
          );

        return (
          encontrouTexto &&
          encontrouStatus
        );
      });

    atualizarResumo(lista);

    if (!lista.length) {

      tabela.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty">
              Nenhum pagamento encontrado.
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

        const transacao =
          item.transacao_id ||
          item.mercado_pago_id ||
          item.pagamento_id ||
          '-';

        const metodo =
          item.metodo ||
          item.metodo_pagamento ||
          item.forma_pagamento ||
          'Mercado Pago';

        const statusAtual =
          item.status || 'pendente';

        return `
          <tr>

            <td>
              ${escaparHtml(empresa)}
            </td>

            <td>
              ${moeda(item.valor)}
            </td>

            <td>
              ${data(
                item.data ||
                item.criado_em ||
                item.created_at
              )}
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
              ${escaparHtml(metodo)}
            </td>

            <td>
              ${escaparHtml(transacao)}
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
        <td colspan="6">
          <div class="empty">
            Carregando pagamentos...
          </div>
        </td>
      </tr>
    `;

    try {

      const resposta =
        await api('/admin/pagamentos');

      pagamentos =
        Array.isArray(resposta)
          ? resposta
          : (
              resposta.pagamentos ||
              resposta.data ||
              []
            );

      renderizar();

    } catch (error) {

      console.error(
        'Erro ao carregar pagamentos:',
        error
      );

      tabela.innerHTML = `
        <tr>
          <td colspan="6">
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

  window.PagamentosAdmin = {
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