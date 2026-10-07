/*
 * bloqueio.js
 *
 * Carregue ESTE arquivo PRIMEIRO (antes de app.js e de qualquer outro script)
 * em todas as páginas que chamam a API: index.html, recuperar-senha.html etc.
 * NÃO carregue em /429.html.
 *
 *   <script src="/js/bloqueio.js"></script>
 *
 * O que ele faz:
 *  1. Se existir um bloqueio ativo (guardado no navegador), manda a pessoa
 *     para /429.html em vez de mostrar o login.
 *  2. Qualquer resposta HTTP 429 da API grava o bloqueio e redireciona.
 *
 * IMPORTANTE: isto é só a parte visual (UX). O bloqueio de verdade é feito
 * pelo servidor (express-rate-limit). Quem limpar o localStorage continua
 * sendo barrado pelo backend.
 */

(function(){
  'use strict';

  var CHAVE = 'orvix_bloqueio_ate';
  var PAGINA = '/429.html';
  var BLOQUEIO_PADRAO_MS = 15 * 60 * 1000;

  function lerBloqueio(){
    try{
      var ate = Number(localStorage.getItem(CHAVE) || 0);
      return ate > Date.now() ? ate : 0;
    }catch(e){
      return 0;
    }
  }

  function gravarBloqueio(ate){
    try{
      localStorage.setItem(CHAVE, String(ate));
    }catch(e){}
  }

  function limparBloqueio(){
    try{
      localStorage.removeItem(CHAVE);
    }catch(e){}
  }

  function estaNaPaginaDeBloqueio(){
    return window.location.pathname.endsWith('/429.html');
  }

  // ----------------------------------------------------------
  // 1. GUARDA: bloqueio ativo => fica em /429.html
  // ----------------------------------------------------------

  if(lerBloqueio()){

    if(!estaNaPaginaDeBloqueio()){
      window.location.replace(PAGINA);
    }

    return;
  }

  limparBloqueio();

  // ----------------------------------------------------------
  // 2. INTERCEPTA RESPOSTAS 429 DA API
  // ----------------------------------------------------------

  var fetchOriginal = window.fetch;

  window.fetch = async function(){

    var resposta = await fetchOriginal.apply(this, arguments);

    if(resposta.status === 429 && !estaNaPaginaDeBloqueio()){

      var entrada = arguments[0];

      var url = String(
        typeof entrada === 'string'
          ? entrada
          : (entrada && entrada.url) || ''
      );

      if(url.indexOf('/api/') !== -1){

        var destino = PAGINA;
        var ate = Date.now() + BLOQUEIO_PADRAO_MS;

        try{

          var dados = await resposta.clone().json();

          if(dados && Number(dados.bloqueado_ate) > Date.now()){
            ate = Number(dados.bloqueado_ate);
          }

          if(dados && typeof dados.redirecionar === 'string'){
            destino = dados.redirecionar;
          }

        }catch(e){}

        // Só aceita caminho do próprio site
        if(destino.charAt(0) !== '/' || destino.indexOf('//') === 0){
          destino = PAGINA;
        }

        gravarBloqueio(ate);

        window.location.replace(destino);
      }
    }

    return resposta;
  };

})();