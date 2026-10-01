(function () {
  'use strict';

  const API = '/api';

  const TOKEN_KEY =
    'lavajato_auth_token';

  let logs = [];

  const tabela =
    document.getElementById('tabela');

  const busca =
    document.getElementById('busca');

  const metodo =
    document.getElementById('metodo');

  const acao =
    document.getElementById('acao');

  const totalRequisicoes =
    document.getElementById(
      'totalRequisicoes'
    );

  const requisicoesHoje =
    document.getElementById(
      'requisicoesHoje'
    );

  const requisicoesErro =
    document.getElementById(
      'requisicoesErro'
    );

  const ipsUnicos =
    document.getElementById(
      'ipsUnicos'
    );

  const loginSucesso =
    document.getElementById(
      'loginSucesso'
    );

  const loginFalhou =
    document.getElementById(
      'loginFalhou'
    );

  const modal =
    document.getElementById('modal');

  const modalConteudo =
    document.getElementById(
      'modalConteudo'
    );

  function obterToken() {
    return localStorage.getItem(
      TOKEN_KEY
    );
  }

  async function api(
    url,
    options = {}
  ) {

    const authToken =
      obterToken();

    if (!authToken) {
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
              `Bearer ${authToken}`
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
      .replaceAll(
        '&',
        '&amp;'
      )
      .replaceAll(
        '<',
        '&lt;'
      )
      .replaceAll(
        '>',
        '&gt;'
      )
      .replaceAll(
        '"',
        '&quot;'
      )
      .replaceAll(
        "'",
        '&#039;'
      );
  }

  function dataHora(valor) {

    if (!valor) {
      return '-';
    }

    const data =
      new Date(valor);

    if (
      Number.isNaN(
        data.getTime()
      )
    ) {
      return valor;
    }

    return data.toLocaleString(
      'pt-BR'
    );
  }

  function classeStatus(status) {

    if (
      status >= 200 &&
      status < 300
    ) {
      return 'success';
    }

    if (
      status >= 400 &&
      status < 500
    ) {
      return 'warning';
    }

    if (status >= 500) {
      return 'danger';
    }

    return 'default';
  }

  function classeAcao(valor) {

    if (
      valor ===
      'login_sucesso'
    ) {
      return 'success';
    }

    if (
      valor ===
      'login_falhou'
    ) {
      return 'danger';
    }

    if (
      valor ===
      'erro_servidor'
    ) {
      return 'danger';
    }

    if (
      valor ===
      'requisicao_falhou'
    ) {
      return 'warning';
    }

    return 'info';
  }

  function nomeAcao(valor) {

    const nomes = {

      requisicao:
        'Requisição',

      login_sucesso:
        'Login realizado',

      login_falhou:
        'Login falhou',

      requisicao_falhou:
        'Requisição falhou',

      erro_servidor:
        'Erro do servidor'

    };

    return (
      nomes[valor] ||
      valor ||
      '-'
    );
  }

  function atualizarEstatisticas(
    resumo
  ) {

    if (totalRequisicoes) {
      totalRequisicoes.textContent =
        Number(
          resumo.total_requisicoes || 0
        ).toLocaleString('pt-BR');
    }

    if (requisicoesHoje) {
      requisicoesHoje.textContent =
        Number(
          resumo.requisicoes_hoje || 0
        ).toLocaleString('pt-BR');
    }

    if (requisicoesErro) {
      requisicoesErro.textContent =
        Number(
          resumo.requisicoes_com_erro || 0
        ).toLocaleString('pt-BR');
    }

    if (ipsUnicos) {
      ipsUnicos.textContent =
        Number(
          resumo.ips_unicos || 0
        ).toLocaleString('pt-BR');
    }

    if (loginSucesso) {
      loginSucesso.textContent =
        Number(
          resumo.login_sucesso || 0
        ).toLocaleString('pt-BR');
    }

    if (loginFalhou) {
      loginFalhou.textContent =
        Number(
          resumo.login_falhou || 0
        ).toLocaleString('pt-BR');
    }
  }

  function preencherAcoes() {

    if (!acao) {
      return;
    }

    const atual =
      acao.value;

    const valores =
      [
        ...new Set(
          logs
            .map(
              item => item.acao
            )
            .filter(Boolean)
        )
      ].sort();

    acao.innerHTML = `
      <option value="">
        Todas as ações
      </option>
    `;

    valores.forEach(valor => {

      const option =
        document.createElement(
          'option'
        );

      option.value = valor;

      option.textContent =
        nomeAcao(valor);

      acao.appendChild(
        option
      );
    });

    if (
      valores.includes(atual)
    ) {
      acao.value = atual;
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

    const filtroMetodo =
      metodo?.value || '';

    const filtroAcao =
      acao?.value || '';

    const lista =
      logs.filter(item => {

        const texto = [
          item.usuario_nome,
          item.usuario_email,
          item.empresa_nome,
          item.email_tentativa,
          item.acao,
          item.descricao,
          item.rota,
          item.ip
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const encontrouTexto =
          !termo ||
          texto.includes(termo);

        const encontrouMetodo =
          !filtroMetodo ||
          item.metodo ===
            filtroMetodo;

        const encontrouAcao =
          !filtroAcao ||
          item.acao ===
            filtroAcao;

        return (
          encontrouTexto &&
          encontrouMetodo &&
          encontrouAcao
        );
      });

    if (!lista.length) {

      tabela.innerHTML = `
        <tr>
          <td colspan="10">
            <div class="empty">
              Nenhum log encontrado.
            </div>
          </td>
        </tr>
      `;

      return;
    }

    tabela.innerHTML =
      lista.map(item => {

        const usuario =
          item.usuario_nome ||
          item.email_tentativa ||
          '-';

        const empresa =
          item.empresa_nome ||
          '-';

        const status =
          Number(
            item.status_http || 0
          );

        return `
          <tr>

            <td>
              ${escaparHtml(
                dataHora(
                  item.criado_em
                )
              )}
            </td>

            <td>
              ${escaparHtml(
                usuario
              )}
            </td>

            <td>
              ${escaparHtml(
                item.usuario_perfil ||
                '-'
              )}
            </td>

            <td>
              ${escaparHtml(
                empresa
              )}
            </td>

            <td>
              <span
                class="badge ${classeAcao(
                  item.acao
                )}"
              >
                ${escaparHtml(
                  nomeAcao(
                    item.acao
                  )
                )}
              </span>
            </td>

            <td>
              <span class="method">
                ${escaparHtml(
                  item.metodo || '-'
                )}
              </span>
            </td>

            <td>
              <span class="route">
                ${escaparHtml(
                  item.rota || '-'
                )}
              </span>
            </td>

            <td>
              <span
                class="badge ${classeStatus(
                  status
                )}"
              >
                ${status || '-'}
              </span>
            </td>

            <td>
              <button
                class="action"
                type="button"
                onclick="LogsAdmin.detalhes(${Number(
                  item.id
                )})"
              >
                Detalhes
              </button>
            </td>

          </tr>
        `;

      }).join('');
  }

  async function carregarResumo() {

    try {

      const resposta =
        await api(
          '/admin/logs/resumo'
        );

      atualizarEstatisticas(
        resposta
      );

    } catch (error) {

      console.error(
        'Erro no resumo:',
        error
      );
    }
  }

  async function carregar() {

    if (!tabela) {
      return;
    }

    tabela.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty">
            Carregando logs...
          </div>
        </td>
      </tr>
    `;

    try {

      const resposta =
        await api(
          '/admin/logs'
        );

      logs =
        Array.isArray(
          resposta
        )
          ? resposta
          : (
              resposta.logs ||
              []
            );

      preencherAcoes();

      renderizar();

      await carregarResumo();

    } catch (error) {

      console.error(
        'Erro ao carregar logs:',
        error
      );

      tabela.innerHTML = `
        <tr>
          <td colspan="10">
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
          `/admin/logs/${id}`
        );

      const log =
        resposta.log ||
        resposta;

      if (!modal) {
        return;
      }

      modalConteudo.innerHTML = `

        <div class="details">

          <div class="detail">
            <div class="detail-label">
              ID
            </div>

            <div class="detail-value">
              ${escaparHtml(
                log.id
              )}
            </div>
          </div>

          <div class="detail">
            <div class="detail-label">
              Data
            </div>

            <div class="detail-value">
              ${escaparHtml(
                dataHora(
                  log.criado_em
                )
              )}
            </div>
          </div>

          <div class="detail">
            <div class="detail-label">
              Usuário
            </div>

            <div class="detail-value">
              ${escaparHtml(
                log.usuario_nome ||
                '-'
              )}
            </div>
          </div>

          <div class="detail">
            <div class="detail-label">
              E-mail
            </div>

            <div class="detail-value">
              ${escaparHtml(
                log.usuario_email ||
                log.email_tentativa ||
                '-'
              )}
            </div>
          </div>

          <div class="detail">
            <div class="detail-label">
              Perfil
            </div>

            <div class="detail-value">
              ${escaparHtml(
                log.usuario_perfil ||
                '-'
              )}
            </div>
          </div>

          <div class="detail">
            <div class="detail-label">
              Empresa
            </div>

            <div class="detail-value">
              ${escaparHtml(
                log.empresa_nome ||
                '-'
              )}
            </div>
          </div>

          <div class="detail">
            <div class="detail-label">
              Ação
            </div>

            <div class="detail-value">
              ${escaparHtml(
                nomeAcao(
                  log.acao
                )
              )}
            </div>
          </div>

          <div class="detail">
            <div class="detail-label">
              IP
            </div>

            <div class="detail-value">
              ${escaparHtml(
                log.ip ||
                '-'
              )}
            </div>
          </div>

          <div class="detail">
            <div class="detail-label">
              Método
            </div>

            <div class="detail-value">
              ${escaparHtml(
                log.metodo ||
                '-'
              )}
            </div>
          </div>

          <div class="detail">
            <div class="detail-label">
              Status HTTP
            </div>

            <div class="detail-value">
              ${escaparHtml(
                log.status_http ||
                '-'
              )}
            </div>
          </div>

          <div class="detail">
            <div class="detail-label">
              Tempo
            </div>

            <div class="detail-value">
              ${escaparHtml(
                log.tempo_ms != null
                  ? `${log.tempo_ms} ms`
                  : '-'
              )}
            </div>
          </div>

          <div class="detail">
            <div class="detail-label">
              Rota
            </div>

            <div class="detail-value">
              ${escaparHtml(
                log.rota ||
                '-'
              )}
            </div>
          </div>

          <div class="detail full">
            <div class="detail-label">
              Descrição
            </div>

            <div class="detail-value">
              ${escaparHtml(
                log.descricao ||
                '-'
              )}
            </div>
          </div>

        </div>
      `;

      modal.classList.add(
        'show'
      );

    } catch (error) {

      alert(
        error.message
      );
    }
  }

  function fecharModal() {

    modal?.classList.remove(
      'show'
    );
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

  window.LogsAdmin = {
    carregar,
    detalhes,
    fecharModal,
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

      metodo?.addEventListener(
        'change',
        renderizar
      );

      acao?.addEventListener(
        'change',
        renderizar
      );

      await carregar();
    }
  );

})();