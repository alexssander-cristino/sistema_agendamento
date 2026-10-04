const API_URL = '/api';

const formulario =
  document.getElementById('form-recuperar-senha');

const emailInput =
  document.getElementById('email');

const mensagem =
  document.getElementById('mensagem');

const botao =
  document.getElementById('btn-recuperar');

const formularioContainer =
  document.getElementById('formulario-container');

const sucessoContainer =
  document.getElementById('sucesso-container');


function mostrarMensagem(texto, tipo = 'erro') {

  mensagem.textContent = texto;

  mensagem.className =
    `mensagem ${tipo}`;

}


function limparMensagem() {

  mensagem.textContent = '';

  mensagem.className =
    'mensagem';

}


formulario.addEventListener(
  'submit',
  async function(event) {

    event.preventDefault();

    limparMensagem();

    const email =
      emailInput.value
        .trim()
        .toLowerCase();


    if (!email) {

      mostrarMensagem(
        'Informe o e-mail da sua conta.'
      );

      emailInput.focus();

      return;
    }


    if (!emailInput.checkValidity()) {

      mostrarMensagem(
        'Informe um e-mail válido.'
      );

      emailInput.focus();

      return;
    }


    botao.disabled = true;

    botao.textContent =
      'Enviando...';


    try {

      const resposta =
        await fetch(
          `${API_URL}/auth/esqueci-senha`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({
              email
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
          'Não foi possível solicitar a recuperação de senha.'
        );

      }


      formularioContainer.style.display =
        'none';

      sucessoContainer.style.display =
        'block';


    } catch (error) {

      console.error(
        'Erro ao solicitar recuperação:',
        error
      );

      mostrarMensagem(
        error.message ||
        'Não foi possível enviar o link de recuperação.'
      );

      botao.disabled = false;

      botao.textContent =
        'Enviar link de recuperação';

    }

  }
);