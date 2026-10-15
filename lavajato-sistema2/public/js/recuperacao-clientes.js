
(() => {
  'use strict';

  const API = '/api/recuperacao-clientes';

  const RESULTADOS = [
    ['contato_realizado', 'Contato realizado'],
    ['respondeu', 'Cliente respondeu'],
    ['interessado', 'Demonstrou interesse'],
    ['agendou', 'Agendou novamente'],
    ['sem_interesse', 'Sem interesse'],
    ['sem_resposta', 'Sem resposta'],
    ['numero_invalido', 'Número inválido']
  ];

  let clientesAtuais = [];

  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);

    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;

    return el;
  }

  function dataFormatada(valor) {
    if (!valor) return 'Não informado';

    const texto = String(valor).slice(0, 10);
    const partes = texto.split('-');

    return partes.length === 3
      ? `${partes[2]}/${partes[1]}/${partes[0]}`
      : texto;
  }

  function moeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function telefoneWhatsApp(valor) {
    let numero = String(valor || '').replace(/\D/g, '');

    if (numero.startsWith('00')) {
      numero = numero.slice(2);
    }

    // Se o número ainda não tem código de país,
    // assume Brasil quando possui DDD e número local.
    if (numero.length === 10 || numero.length === 11) {
      numero = `55${numero}`;
    }

    // Evita abrir uma conversa com número claramente inválido.
    if (numero.length < 12 || numero.length > 13) {
      return null;
    }

    return numero;
  }

  async function requisicao(url, opcoes = {}) {
    const resposta = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...opcoes,
      headers: {
        Accept: 'application/json',
        ...(opcoes.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(opcoes.headers || {})
      }
    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      throw new Error(
        dados.erro || 'Não foi possível concluir a operação.'
      );
    }

    return dados;
  }

  async function carregarClientes() {
    const status = document.getElementById('status');
    const lista = document.getElementById('lista');

    status.textContent = 'Carregando lista de recuperação...';

    try {
      const periodo = document.getElementById('periodo').value;
      const busca = document.getElementById('busca').value.trim();

      const parametros = new URLSearchParams({
        dias: periodo,
        busca
      });

      const dados = await requisicao(`${API}?${parametros.toString()}`);

      clientesAtuais = dados.clientes || [];
      renderizarClientes(clientesAtuais);

      status.textContent =
        `${clientesAtuais.length} cliente(s) encontrados ` +
        paraTextoPeriodo(Number(dados.periodo_dias));
    } catch (erro) {
      console.error('Erro ao carregar recuperação de clientes:', erro);
      status.textContent = erro.message;
      lista.replaceChildren();
    }
  }

  function paraTextoPeriodo(dias) {
    return `com pelo menos ${dias} dias sem retorno.`;
  }

  function criarBotao(texto, classe, acao) {
    const botao = elemento('button', classe, texto);
    botao.type = 'button';
    botao.addEventListener('click', acao);
    return botao;
  }

  function renderizarClientes(clientes) {
    const lista = document.getElementById('lista');
    lista.replaceChildren();

    if (clientes.length === 0) {
      lista.appendChild(
        elemento(
          'div',
          'vazio',
          'Nenhum cliente encontrado para esse filtro. Verifique se há atendimentos concluídos no histórico.'
        )
      );
      return;
    }

    for (const cliente of clientes) {
      lista.appendChild(criarCartaoCliente(cliente));
    }
  }

  function criarCartaoCliente(cliente) {
    const cartao = elemento('article', 'cliente');
    const topo = elemento('div', 'cliente-topo');
    const informacoes = elemento('div');

    informacoes.append(
      elemento('h2', '', cliente.nome || 'Cliente sem nome'),
      elemento('p', '', cliente.telefone || 'Telefone não cadastrado'),
      elemento(
        'p',
        '',
        `Último atendimento: ${dataFormatada(cliente.ultimo_atendimento)}`
      ),
      elemento(
        'p',
        '',
        `${cliente.dias_sem_retorno} dias sem retorno`
      ),
      elemento(
        'p',
        '',
        `${cliente.total_atendimentos} atendimento(s) concluído(s)`
      ),
      elemento(
        'p',
        '',
        `Total histórico registrado: ${moeda(cliente.total_historico)}`
      )
    );

    const prioridade = elemento(
      'span',
      `prioridade ${cliente.prioridade || 'normal'}`,
      {
        alta: 'Prioridade alta',
        media: 'Prioridade média',
        normal: 'Prioridade normal'
      }[cliente.prioridade] || 'Prioridade normal'
    );

    topo.append(informacoes, prioridade);
    cartao.appendChild(topo);

    const acoes = elemento('div', 'acoes');

    acoes.append(
      criarBotao('Preparar mensagem', '', () => {
        abrirEditor(cartao, cliente);
      }),
      criarBotao('Ver histórico', '', () => {
        carregarHistorico(cartao, cliente.id);
      })
    );

    cartao.appendChild(acoes);
    return cartao;
  }

  function abrirEditor(cartao, cliente) {
    const anterior = cartao.querySelector('.editor');

    if (anterior) {
      anterior.remove();
      return;
    }

    const editor = elemento('div', 'editor');

    const labelMensagem = elemento('label', '', 'Mensagem sugerida');
    const mensagem = elemento('textarea');
    mensagem.value = cliente.mensagem_sugerida || '';
    mensagem.maxLength = 5000;
    labelMensagem.htmlFor = `mensagem-${cliente.id}`;
    mensagem.id = `mensagem-${cliente.id}`;

    const labelResultado = elemento('label', '', 'Resultado do contato');
    const resultado = elemento('select');
    resultado.id = `resultado-${cliente.id}`;
    labelResultado.htmlFor = resultado.id;

    for (const [valor, texto] of RESULTADOS) {
      const opcao = elemento('option', '', texto);
      opcao.value = valor;
      resultado.appendChild(opcao);
    }

    const labelObservacoes = elemento('label', '', 'Observações (opcional)');
    const observacoes = elemento('textarea');
    observacoes.maxLength = 1000;
    observacoes.placeholder = 'Ex.: pediu para entrar em contato na próxima semana.';
    observacoes.id = `observacoes-${cliente.id}`;
    labelObservacoes.htmlFor = observacoes.id;

    const acoes = elemento('div', 'acoes');

    acoes.append(
      criarBotao('Copiar mensagem', '', async () => {
        try {
          await navigator.clipboard.writeText(mensagem.value);
          alert('Mensagem copiada.');
        } catch {
          mensagem.focus();
          mensagem.select();
          alert('Não foi possível copiar automaticamente. Copie o texto selecionado.');
        }
      }),
      criarBotao('Abrir WhatsApp', 'whatsapp', () => {
        const telefone = telefoneWhatsApp(cliente.telefone_whatsapp);

        if (!telefone) {
          alert(
            'O telefone não parece válido para o WhatsApp. ' +
            'Confira o número e inclua o código do país e o DDD.'
          );
          return;
        }

        const url =
          `https://wa.me/${telefone}?text=` +
          encodeURIComponent(mensagem.value);

        window.open(url, '_blank', 'noopener,noreferrer');
      }),
      criarBotao('Registrar resultado', 'primario', async () => {
        const botao = acoes.querySelector('button:last-child');
        botao.disabled = true;

        try {
          await requisicao(
            `${API}/${encodeURIComponent(cliente.id)}/contatos`,
            {
              method: 'POST',
              body: JSON.stringify({
                mensagem: mensagem.value,
                resultado: resultado.value,
                observacoes: observacoes.value,
                telefone: cliente.telefone || null
              })
            }
          );

          alert('Resultado do contato registrado.');
          await carregarClientes();
        } catch (erro) {
          alert(erro.message);
          botao.disabled = false;
        }
      })
    );

    editor.append(
      labelMensagem,
      mensagem,
      labelResultado,
      resultado,
      labelObservacoes,
      observacoes,
      acoes
    );

    cartao.appendChild(editor);
    mensagem.focus();
  }

  async function carregarHistorico(cartao, clienteId) {
    const existente = cartao.querySelector('.historico');

    if (existente) {
      existente.remove();
      return;
    }

    const area = elemento('div', 'historico');
    area.appendChild(elemento('p', '', 'Carregando histórico...'));
    cartao.appendChild(area);

    try {
      const historico = await requisicao(
        `${API}/${encodeURIComponent(clienteId)}/historico`
      );

      area.replaceChildren();
      area.appendChild(elemento('h3', '', 'Histórico de contatos'));

      if (!historico.length) {
        area.appendChild(
          elemento('p', '', 'Ainda não há contatos registrados.')
        );
        return;
      }

      for (const contato of historico) {
        const item = elemento('div', 'historico-item');

        const resultadoTexto =
          RESULTADOS.find(([valor]) => valor === contato.resultado)?.[1]
          || contato.resultado;

        item.append(
          elemento(
            'strong',
            '',
            `${resultadoTexto} · ${new Date(contato.contato_em).toLocaleString('pt-BR')}`
          ),
          elemento('p', '', contato.mensagem)
        );

        if (contato.observacoes) {
          item.appendChild(
            elemento('p', '', `Observações: ${contato.observacoes}`)
          );
        }

        area.appendChild(item);
      }
    } catch (erro) {
      area.replaceChildren(
        elemento('p', '', erro.message)
      );
    }
  }

  document
    .getElementById('atualizar')
    .addEventListener('click', carregarClientes);

  document
    .getElementById('periodo')
    .addEventListener('change', carregarClientes);

  let temporizadorBusca;

  document.getElementById('busca').addEventListener('input', () => {
    clearTimeout(temporizadorBusca);
    temporizadorBusca = setTimeout(carregarClientes, 300);
  });

  carregarClientes();
})();
