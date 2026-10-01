(function () {
  'use strict';

  const API = '/api';
  const TOKEN_KEY = 'lavajato_auth_token';

  let usuarios = [];

  const tabela =
    document.getElementById('tabela');

  const busca =
    document.getElementById('busca');

  const perfil =
    document.getElementById('perfil');

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

  function classePerfil(valor) {

    const atual =
      String(valor || '')
        .toLowerCase();

    if (
      atual === 'administrador'
    ) {
      return 'administrador';
    }

    return 'funcionario';
  }

  function nomePerfil(valor) {

    const atual =
      String(valor || '')
        .toLowerCase();

    if (
      atual === 'administrador'
    ) {
      return 'Administrador';
    }

    if (
      atual === 'dev'
    ) {
      return 'DEV';
    }

    return 'Funcionário';
  }

  function classeAtivo(usuario) {

    if (
      usuario.ativo === false ||
      usuario.ativo === 0
    ) {
      return 'inativo';
    }

    return 'ativo';
  }

  function nomeAtivo(usuario) {

    if (
      usuario.ativo === false ||
      usuario.ativo === 0
    ) {
      return 'Inativo';
    }

    return 'Ativo';
  }

  function renderizar() {

    if (!tabela) {
      return;
    }

    const termo =
      busca?.value
        ?.toLowerCase()
        .trim() || '';

    const filtroPerfil =
      perfil?.value || '';

    const lista =
      usuarios.filter(usuario => {

        const nome =
          (
            usuario.nome ||
            ''
          ).toLowerCase();

        const email =
          (
            usuario.email ||
            ''
          ).toLowerCase();

        const empresa =
          (
            usuario.empresa_nome ||
            usuario.nome_empresa ||
            usuario.empresa ||
            ''
          ).toLowerCase();

        const perfilAtual =
          String(
            usuario.perfil || ''
          ).toLowerCase();

        const encontrouTexto =
          !termo ||
          nome.includes(termo) ||
          email.includes(termo) ||
          empresa.includes(termo);

        const encontrouPerfil =
          !filtroPerfil ||
          perfilAtual === filtroPerfil;

        return (
          encontrouTexto &&
          encontrouPerfil
        );
      });

    if (!lista.length) {

      tabela.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty">
              Nenhum usuário encontrado.
            </div>
          </td>
        </tr>
      `;

      return;
    }

    tabela.innerHTML =
      lista.map(usuario => {

        const nome =
          usuario.nome ||
          '-';

        const email =
          usuario.email ||
          '-';

        const empresa =
          usuario.empresa_nome ||
          usuario.nome_empresa ||
          usuario.empresa ||
          (
            usuario.perfil === 'dev'
              ? 'DEV'
              : '-'
          );

        const perfilAtual =
          usuario.perfil ||
          'funcionario';

        return `
          <tr>

            <td>
              ${escaparHtml(nome)}
            </td>

            <td>
              ${escaparHtml(email)}
            </td>

            <td>
              ${escaparHtml(empresa)}
            </td>

            <td>

              <span
                class="perfil ${classePerfil(
                  perfilAtual
                )}"
              >
                ${escaparHtml(
                  nomePerfil(
                    perfilAtual
                  )
                )}
              </span>

            </td>

            <td>

              <span
                class="perfil ${classeAtivo(
                  usuario
                )}"
              >
                ${nomeAtivo(usuario)}
              </span>

            </td>

            <td>

              <button
                class="action"
                type="button"
                onclick="window.UsuariosAdmin.detalhes(${Number(usuario.id)})"
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
        <td colspan="6">
          <div class="empty">
            Carregando usuários...
          </div>
        </td>
      </tr>
    `;

    try {

      const resposta =
        await api('/admin/usuarios');

      usuarios =
        Array.isArray(resposta)
          ? resposta
          : (
              resposta.usuarios ||
              resposta.data ||
              []
            );

      renderizar();

    } catch (error) {

      console.error(
        'Erro ao carregar usuários:',
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

  async function detalhes(id) {

    try {

      const resposta =
        await api(
          `/admin/usuarios/${id}`
        );

      const usuario =
        resposta.usuario ||
        resposta.data ||
        resposta;

      alert(
        `Usuário #${id}\n\n` +
        `Nome: ${
          usuario.nome || '-'
        }\n` +
        `E-mail: ${
          usuario.email || '-'
        }\n` +
        `Perfil: ${
          usuario.perfil || '-'
        }\n` +
        `Empresa: ${
          usuario.empresa_nome ||
          usuario.nome_empresa ||
          '-'
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

  window.UsuariosAdmin = {
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

      perfil?.addEventListener(
        'change',
        renderizar
      );

      await carregar();

    }
  );

})();