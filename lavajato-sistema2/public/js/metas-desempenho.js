
(() => {
  'use strict';

  const API = '/api/metas-desempenho';
  const $ = (id) => document.getElementById(id);

  const moeda = (valor) =>
    Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });

  const inteiro = (valor) =>
    Number(valor || 0).toLocaleString('pt-BR');

  const percentual = (valor) =>
    `${Number(valor || 0).toLocaleString('pt-BR', {
      maximumFractionDigits: 1
    })}%`;

  const mesAtual = () => {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(
      agora.getMonth() + 1
    ).padStart(2, '0')}`;
  };

  function informar(mensagem, formulario = false) {
    $(formulario ? 'form-aviso' : 'aviso').textContent = mensagem;
  }

  async function requisitar(url, opcoes = {}) {
    const resposta = await fetch(url, {
      credentials: 'same-origin',
      ...opcoes,
      headers: {
        'Content-Type': 'application/json',
        ...(opcoes.headers || {})
      }
    });

    if (resposta.status === 401) {
      throw new Error('Sua sessão expirou. Entre novamente no Orvix.');
    }

    const dados = resposta.status === 204
      ? null
      : await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      throw new Error(
        dados?.erro || 'Não foi possível concluir a operação.'
      );
    }

    return dados;
  }

  function exibirProgresso(prefixo, dados, formato) {
    const realizado = Number(dados?.realizado || 0);
    const meta = Number(dados?.meta || 0);
    const falta = Number(dados?.falta || 0);
    const percentualReal = Number(dados?.percentual || 0);

    $(`${prefixo}-bar`).style.width =
      `${Math.min(100, Math.max(0, percentualReal))}%`;

    $(`${prefixo}-percent`).textContent = meta > 0
      ? `${percentual(percentualReal)} da meta`
      : 'Meta ainda não definida';

    if (prefixo === 'faturamento' || prefixo === 'ticket') {
      $(prefixo).textContent = moeda(realizado);
      $(`${prefixo}-falta`).textContent = meta > 0
        ? falta > 0
          ? `Faltam ${moeda(falta)} para a meta`
          : 'Meta alcançada!'
        : 'Defina sua meta mensal.';
    } else {
      $(prefixo).textContent = inteiro(realizado);
      $(`${prefixo}-falta`).textContent = meta > 0
        ? falta > 0
          ? `Faltam ${inteiro(falta)} atendimentos`
          : 'Meta alcançada!'
        : 'Defina sua meta mensal.';
    }
  }

  function renderizarGrafico(dados) {
    const container = $('grafico-diario');
    container.replaceChildren();

    if (!dados.length) {
      container.innerHTML =
        '<p class="empty">Ainda não há dados para este período.</p>';
      return;
    }

    const maximo = Math.max(
      1,
      ...dados.map((item) => Number(item.faturamento || 0))
    );

    dados.forEach((item) => {
      const valor = Number(item.faturamento || 0);
      const coluna = document.createElement('div');
      coluna.className = 'chart-item';

      const texto = document.createElement('div');
      texto.className = 'chart-value';
      texto.textContent = moeda(valor);

      const barra = document.createElement('div');
      barra.className = 'chart-bar';
      barra.style.height = `${Math.max(2, (valor / maximo) * 105)}px`;
      barra.title = `${item.data}: ${moeda(valor)}`;

      const rotulo = document.createElement('div');
      rotulo.className = 'chart-label';
      rotulo.textContent = item.data.slice(8, 10);

      coluna.append(texto, barra, rotulo);
      container.appendChild(coluna);
    });
  }

  function renderizarHistorico(dados) {
    const corpo = $('historico');
    corpo.replaceChildren();

    if (!dados.length) {
      const linha = document.createElement('tr');
      const celula = document.createElement('td');
      celula.colSpan = 4;
      celula.className = 'empty';
      celula.textContent = 'Nenhum histórico disponível.';
      linha.appendChild(celula);
      corpo.appendChild(linha);
      return;
    }

    dados.forEach((item) => {
      const linha = document.createElement('tr');

      const [ano, mes] = item.mes.split('-');
      const nomeMes = new Date(
        Number(ano),
        Number(mes) - 1,
        1
      ).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
      });

      [
        nomeMes,
        moeda(item.faturamento),
        inteiro(item.atendimentos),
        moeda(item.ticket_medio)
      ].forEach((valor) => {
        const celula = document.createElement('td');
        celula.textContent = valor;
        linha.appendChild(celula);
      });

      corpo.appendChild(linha);
    });
  }

  async function carregar() {
    const mes = $('mes').value;

    if (!/^\d{4}-\d{2}$/.test(mes)) {
      informar('Selecione um mês válido.');
      return;
    }

    $('atualizar').disabled = true;
    informar('Carregando resultados...');

    try {
      const dados = await requisitar(
        `${API}?mes=${encodeURIComponent(mes)}`
      );

      $('meta-faturamento').value =
        dados.metas.faturamento;

      $('meta-atendimentos').value =
        dados.metas.atendimentos;

      $('meta-ticket').value =
        dados.metas.ticket_medio;

      exibirProgresso(
        'faturamento',
        dados.resultados.faturamento,
        moeda
      );

      exibirProgresso(
        'atendimentos',
        dados.resultados.atendimentos,
        inteiro
      );

      exibirProgresso(
        'ticket',
        dados.resultados.ticket_medio,
        moeda
      );

      renderizarGrafico(dados.evolucao_diaria || []);
      renderizarHistorico(dados.evolucao_mensal || []);

      informar('Resultados atualizados.');
    } catch (erro) {
      console.error('Erro ao carregar metas:', erro);
      informar(erro.message);
    } finally {
      $('atualizar').disabled = false;
    }
  }

  async function salvar(evento) {
    evento.preventDefault();

    const mes = $('mes').value;
    const faturamento = Number($('meta-faturamento').value);
    const atendimentos = Number($('meta-atendimentos').value);
    const ticket = Number($('meta-ticket').value);

    if (
      !/^\d{4}-\d{2}$/.test(mes) ||
      !Number.isFinite(faturamento) ||
      !Number.isFinite(atendimentos) ||
      !Number.isFinite(ticket) ||
      faturamento < 0 ||
      atendimentos < 0 ||
      ticket < 0 ||
      !Number.isSafeInteger(atendimentos) ||
      faturamento > 999999999999 ||
      ticket > 999999999999
    ) {
      informar(
        'Confira os valores: use números válidos e não negativos.',
        true
      );
      return;
    }

    $('salvar').disabled = true;
    informar('Salvando metas...', true);

    try {
      const resposta = await requisitar(API, {
        method: 'PUT',
        body: JSON.stringify({
          mes,
          meta_faturamento: faturamento,
          meta_atendimentos: atendimentos,
          meta_ticket_medio: ticket
        })
      });

      informar(resposta.mensagem || 'Metas salvas.', true);
      await carregar();
    } catch (erro) {
      console.error('Erro ao salvar metas:', erro);
      informar(erro.message, true);
    } finally {
      $('salvar').disabled = false;
    }
  }

  $('mes').value = mesAtual();
  $('mes').addEventListener('change', carregar);
  $('atualizar').addEventListener('click', carregar);
  $('form-metas').addEventListener('submit', salvar);

  carregar();
})();
