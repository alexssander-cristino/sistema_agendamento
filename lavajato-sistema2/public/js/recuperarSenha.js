const API_URL = '/api';

const formulario =
  document.getElementById(
    'formulario-recuperacao'
  );

const mensagem =
  document.getElementById(
    'mensagem'
  );

const btnRedefinir =
  document.getElementById(
    'btn-redefinir'
  );

const formularioContainer =
  document.getElementById(
    'formulario-container'
  );

const sucessoContainer =
  document.getElementById(
    'sucesso-container'
  );

const senha =
  document.getElementById(
    'senha'
  );

const confirmarSenha =
  document.getElementById(
    'confirmar-senha'
  );

const parametros =
  new URLSearchParams(
    window.location.search
  );

const token =
  parametros.get('token');


function mostrarMensagem(
  texto,
  tipo = 'erro'
) {
  mensagem.textContent = texto;

  mensagem.className =
    `mensagem ${tipo}`;
}


function limparMensagem() {
  mensagem.textContent = '';

  mensagem.className =
    'mensagem';
}


function validarToken() {
  if (!token) {
    mostrarMensagem(
      'O link de recuperação é inválido ou está incompleto.'
    );

    btnRedefinir.disabled = true;

    senha.disabled = true;
    confirmarSenha.disabled = true;

    return false;
  }

  /*
   * O backend gera tokens com 32 bytes
   * em hexadecimal = 64 caracteres.
   */
  if (!/^[a-fA-F0-9]{64}$/.test(token)) {
    mostrarMensagem(
      'O link de recuperação é inválido.'
    );

    btnRedefinir.disabled = true;

    senha.disabled = true;
    confirmarSenha.disabled = true;

    return false;
  }

  return true;
}


function validarSenhas() {
  const novaSenha =
    senha.value;

  const novaSenhaConfirmacao =
    confirmarSenha.value;

  if (novaSenha.length < 6) {
    mostrarMensagem(
      'A senha deve possuir pelo menos 6 caracteres.'
    );

    senha.focus();

    return false;
  }

  if (novaSenha !== novaSenhaConfirmacao) {
    mostrarMensagem(
      'As senhas não coincidem.'
    );

    confirmarSenha.focus();

    return false;
  }

  return true;
}


formulario.addEventListener(
  'submit',
  async function(event) {
    event.preventDefault();

    limparMensagem();

    if (!validarToken()) {
      return;
    }

    if (!validarSenhas()) {
      return;
    }

    btnRedefinir.disabled = true;

    btnRedefinir.textContent =
      'Redefinindo...';

    try {
      const resposta =
        await fetch(
          `${API_URL}/auth/redefinir-senha`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({
              token,
              senha: senha.value
            })
          }
        );

      let dados = {};

      try {
        dados =
          await resposta.json();
      } catch {
        dados = {};
      }

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
          'Não foi possível redefinir a senha.'
        );
      }

      formularioContainer.style.display =
        'none';

      sucessoContainer.style.display =
        'block';

    } catch (error) {
      console.error(
        'Erro ao redefinir senha:',
        error
      );

      mostrarMensagem(
        error.message ||
        'Ocorreu um erro ao redefinir sua senha.'
      );

      btnRedefinir.disabled = false;

      btnRedefinir.textContent =
        'Redefinir senha';
    }
  }
);


validarToken();