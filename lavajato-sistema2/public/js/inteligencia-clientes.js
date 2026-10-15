'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const dinheiro = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
  const dataBR = (v) => {
    if (!v) return 'Sem visitas';
    const s = String(v).slice(0, 10);
    const partes = s.split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : '—';
  };
  const escapar = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const perfil = (c) => ({
    sem_retorno: 'Sem retorno',
    em_risco: 'Em risco',
    frequente: 'Frequente',
    ativo: 'Ativo',
    novo: 'Novo'
  }[c] || 'Sem classificação');
  let debounceBusca = null;

  function tokenAuth() {
    return localStorage.getItem('lavajato_auth_token') ||
      localStorage.getItem('orvix_auth_token') ||
      localStorage.getItem('token') || '';
  }

  async function carregar() {
    const busca = $('busca').value.trim();
    const segmento = $('segmento').value;
    const params = new URLSearchParams({ busca, segmento });
    $('lista').innerHTML = '<tr><td colspan="6" class="loading">Analisando dados dos clientes…</td></tr>';
    $('insights').innerHTML = '<div class="loading">Gerando recomendações…</div>';

    try {
      const headers = {};
      const token = tokenAuth();
      if (token) headers.Authorization = `Bearer ${token}`;
      const resposta = await fetch(`/api/inteligencia-clientes/resumo?${params}`, {
        method: 'GET', headers, credentials: 'same-origin', cache: 'no-store'
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(dados.erro || `Falha ao carregar (${resposta.status}).`);

      $('m-total').textContent = dados.indicadores.total_clientes ?? 0;
      $('m-ativos').textContent = dados.indicadores.clientes_ativos ?? 0;
      $('m-risco').textContent = (dados.indicadores.clientes_em_risco ?? 0) + (dados.indicadores.clientes_sem_retorno ?? 0);
      $('m-frequentes').textContent = dados.indicadores.clientes_frequentes ?? 0;
      $('s-valor').textContent = `${(dados.segmentos.alto_valor || []).length} cliente(s) destacados`;
      $('s-retorno').textContent = `${(dados.segmentos.sem_retorno || []).length} cliente(s) sem visita há 60+ dias`;
      $('s-frequentes').textContent = `${(dados.segmentos.frequentes || []).length} cliente(s) com 4+ atendimentos`;
      $('s-novos').textContent = `${(dados.segmentos.novos || []).length} cliente(s) novos/primeira visita recente`;

      const insights = dados.insights || [];
      $('insights').innerHTML = insights.length ? insights.map(i => `
        <article class="insight">
          <span class="dot ${escapar(i.nivel)}"></span>
          <div><h3>${escapar(i.titulo)}</h3><p>${escapar(i.texto)}</p></div>
        </article>`).join('') : '<div class="empty">Ainda não há recomendações para exibir.</div>';

      const clientes = dados.clientes || [];
      $('qtd-lista').textContent = `${clientes.length} cliente(s)`;
      $('titulo-lista').textContent = segmento === 'todos' ? 'Clientes analisados' : `Clientes: ${$('segmento').selectedOptions[0].textContent}`;
      $('lista').innerHTML = clientes.length ? clientes.map(c => `
        <tr>
          <td><div class="customer-name"><strong>${escapar(c.nome)}</strong><span>${escapar(c.telefone || c.email || 'Sem contato informado')}</span></div></td>
          <td>${Number(c.total_atendimentos) || 0}<div class="metric-note">${Number(c.atendimentos_concluidos) || 0} concluído(s)</div></td>
          <td><strong>${dinheiro(c.total_gasto)}</strong></td>
          <td>${dataBR(c.ultima_visita)}</td>
          <td>${c.dias_sem_visita === null ? 'Sem histórico' : `${c.dias_sem_visita} dia(s)`}</td>
          <td><span class="status ${escapar(c.classificacao)}">${escapar(perfil(c.classificacao))}</span></td>
        </tr>`).join('') : '<tr><td colspan="6" class="empty">Nenhum cliente encontrado para esse filtro.</td></tr>';

      $('atualizado').textContent = `Atualizado em ${new Date(dados.atualizado_em || Date.now()).toLocaleString('pt-BR')}`;
    } catch (erro) {
      $('lista').innerHTML = `<tr><td colspan="6" class="error">${escapar(erro.message || 'Erro ao carregar os dados.')}</td></tr>`;
      $('insights').innerHTML = `<div class="error">${escapar(erro.message || 'Não foi possível gerar a análise.')}</div>`;
      $('qtd-lista').textContent = 'Erro';
      $('atualizado').textContent = 'Falha ao atualizar';
    }
  }

  $('atualizar').addEventListener('click', carregar);
  $('segmento').addEventListener('change', carregar);
  $('busca').addEventListener('input', () => {
    clearTimeout(debounceBusca);
    debounceBusca = setTimeout(carregar, 300);
  });
  document.querySelectorAll('[data-segmento]').forEach(botao => {
    botao.addEventListener('click', () => {
      $('segmento').value = botao.dataset.segmento;
      carregar();
      $('lista').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  $('voltar').addEventListener('click', () => { window.location.href = '/index.html'; });
  $('tema').addEventListener('click', () => {
    const atual = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = atual;
    try { localStorage.setItem('orvix-theme', atual); } catch (_) {}
  });
  try {
    const temaSalvo = localStorage.getItem('orvix-theme');
    if (temaSalvo === 'dark' || temaSalvo === 'light') document.documentElement.dataset.theme = temaSalvo;
  } catch (_) {}
  carregar();
})();
