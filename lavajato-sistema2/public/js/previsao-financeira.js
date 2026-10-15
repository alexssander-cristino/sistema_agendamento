
(() => {
  'use strict';

  const API = '/api/previsao-financeira';

  const dinheiro = (valor) =>
    Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

  const dataCurta = (valor) => {
    const partes = String(valor).slice(0, 10).split('-');

    if (partes.length !== 3) return String(valor);

    return `${partes[2]}/${partes[1]}`;
  };

  function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);

    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;

    return elemento;
  }

  function adicionarLinha(container, titulo, valor, classe = '') {
    const linha = criarElemento('div', 'linha');
    linha.append(
      criarElemento('span', '', titulo),
      criarElemento('strong', classe, dinheiro(valor))
    );
    container.appendChild(linha);
  }

  function renderizarPeriodos(periodos) {
    const container = document.getElementById('periodos');
    container.replaceChildren();

    const configuracao = [
      ['seteDias', 'Próximos 7 dias'],
      ['trintaDias', 'Próximos 30 dias'],
      ['noventaDias', 'Próximos 90 dias']
    ];

    for (const [chave, titulo] of configuracao) {
      const periodo = periodos[chave];
      if (!periodo) continue;

      const card = criarElemento('article', 'card');
      card.appendChild(criarElemento('div', 'periodo-titulo', titulo));

      const saldoClasse =
        periodo.saldoLiquidoProjetado >= 0 ? 'positivo' : 'negativo';

      card.appendChild(
        criarElemento(
          'div',
          `saldo ${saldoClasse}`,
          dinheiro(periodo.saldoLiquidoProjetado)
        )
      );

      adicionarLinha(
        card,
        'Entradas previstas',
        periodo.entradasPrevistas,
        'positivo'
      );

      adicionarLinha(
        card,
        'Saídas previstas',
        periodo.saidasPrevistas,
        'negativo'
      );

      adicionarLinha(
        card,
        'Recebimentos registrados*',
        periodo.recebimentosRegistrados,
        'positivo'
      );

      adicionarLinha(
        card,
        'Pagamentos registrados*',
        periodo.pagamentosRegistrados,
        'negativo'
      );

      container.appendChild(card);
    }
  }

  function renderizarGrafico(dias) {
    const container = document.getElementById('grafico');
    container.replaceChildren();

    const periodo = dias.slice(0, 30);
    const maiorValor = Math.max(
      1,
      ...periodo.flatMap((dia) => [
        dia.entradasPrevistas,
        dia.saidasPrevistas
      ])
    );

    for (const dia of periodo) {
      const coluna = criarElemento('div', 'coluna');
      const barras = criarElemento('div', 'barras');

      const entrada = criarElemento('div', 'barra entrada');
      entrada.style.height =
        `${Math.max(2, dia.entradasPrevistas / maiorValor * 150)}px`;
      entrada.title =
        `Entradas previstas em ${dataCurta(dia.data)}: ` +
        dinheiro(dia.entradasPrevistas);
      entrada.setAttribute('aria-label', entrada.title);

      const saida = criarElemento('div', 'barra saida');
      saida.style.height =
        `${Math.max(2, dia.saidasPrevistas / maiorValor * 150)}px`;
      saida.title =
        `Saídas previstas em ${dataCurta(dia.data)}: ` +
        dinheiro(dia.saidasPrevistas);
      saida.setAttribute('aria-label', saida.title);

      barras.append(entrada, saida);

      coluna.append(
        barras,
        criarElemento('span', 'dia-label', dataCurta(dia.data))
      );

      container.appendChild(coluna);
    }

    if (periodo.length === 0) {
      container.appendChild(
        criarElemento('p', '', 'Não há dados para exibir.')
      );
    }
  }

  function renderizarAlertas(periodos) {
    const container = document.getElementById('alertas');
    container.replaceChildren();

    const alertas = [];

    for (const [chave, periodo] of Object.entries(periodos)) {
      for (const alerta of periodo.alertas || []) {
        alertas.push({
          ...alerta,
          periodo: {
            seteDias: '7 dias',
            trintaDias: '30 dias',
            noventaDias: '90 dias'
          }[chave] || chave
        });
      }
    }

    if (alertas.length === 0) {
      container.appendChild(
        criarElemento(
          'div',
          'card',
          'Nenhum alerta de risco identificado com os lançamentos atuais.'
        )
      );
      return;
    }

    for (const alerta of alertas) {
      const item = criarElemento(
        'article',
        `alerta ${alerta.tipo === 'risco' ? 'risco' : ''}`
      );

      item.append(
        criarElemento(
          'h3',
          '',
          `${alerta.titulo} · ${alerta.periodo}`
        ),
        criarElemento('p', '', alerta.mensagem)
      );

      container.appendChild(item);
    }
  }

  async function carregarPrevisao() {
    const botao = document.getElementById('atualizar');
    const status = document.getElementById('status');

    botao.disabled = true;
    status.textContent = 'Atualizando dados financeiros...';

    try {
      const resposta = await fetch(API, {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json'
        },
        cache: 'no-store'
      });

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        throw new Error(
          dados.erro || 'Não foi possível carregar a previsão.'
        );
      }

      renderizarPeriodos(dados.periodos || {});
      renderizarGrafico(dados.evolucaoDiaria || []);
      renderizarAlertas(dados.periodos || {});

      document.getElementById('observacao').textContent =
        `${dados.observacao || ''} ` +
        'Os valores previstos dependem dos lançamentos cadastrados.';

      status.textContent =
        `Previsão atualizada em ${new Date().toLocaleString('pt-BR')}.`;
    } catch (erro) {
      console.error('Erro ao carregar previsão financeira:', erro);
      status.textContent = erro.message;

      document.getElementById('periodos').replaceChildren();
      document.getElementById('grafico').replaceChildren();
      document.getElementById('alertas').replaceChildren();
    } finally {
      botao.disabled = false;
    }
  }

  document
    .getElementById('atualizar')
    .addEventListener('click', carregarPrevisao);

  carregarPrevisao();
})();
