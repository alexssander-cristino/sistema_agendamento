(function () {
  'use strict';

  const firebaseConfig = {
    apiKey: 'AIzaSyAudiu_ENQbQjElInkvbKkGqAzwTuzekBA',
    authDomain: 'orvix-notificacoes.firebaseapp.com',
    projectId: 'orvix-notificacoes',
    storageBucket: 'orvix-notificacoes.firebasestorage.app',
    messagingSenderId: '454025108283',
    appId: '1:454025108283:web:6755e120e86e4c2b7f751e'
  };
  const VAPID_KEY = 'BN95juUQcL75Pl9GMQuPBAfU9-cGaqocFgfyjaora9KqhHkkuWxKNoyudVHHzll-Y5wUrzZ4ZGJI2ZAmgqfgXOw';
  let messaging = null;
  let serviceWorkerRegistration = null;

  
  function iniciarFirebase() {
    if (!window.firebase) throw new Error('Bibliotecas Firebase não foram carregadas.');
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    messaging = firebase.messaging(app);
  }

  async function ativarNotificacoes() {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      throw new Error('Este navegador não oferece suporte a notificações push.');
    }
    if (!window.isSecureContext) throw new Error('As notificações exigem HTTPS.');
    if (!messaging) iniciarFirebase();

    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') throw new Error('Permissão de notificações não concedida.');

    serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration });
    if (!token) throw new Error('O Firebase não retornou um token para este navegador.');

    const resposta = await fetch('/api/firebase-notific/token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ token })
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      if (resposta.status === 401) throw new Error('Entre na sua conta do Orvix e tente ativar novamente.');
      throw new Error(dados.erro || 'Não foi possível registrar este navegador no Orvix.');
    }
    return { sucesso: true, mensagem: 'Notificações ativadas neste navegador.' };
  }

  async function desativarNotificacoes() {
    if (!messaging) iniciarFirebase();
    const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: serviceWorkerRegistration || undefined });
    if (token) {
      await fetch('/api/firebase-notific/token', {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ token })
      });
      await messaging.deleteToken();
    }
    return { sucesso: true, mensagem: 'Notificações desativadas neste navegador.' };
  }

  function configurarRecebimento() {
    if (!messaging) iniciarFirebase();
    messaging.onMessage(function (payload) {
      const titulo = payload.notification?.title || payload.data?.title || 'Orvix';
      const corpo = payload.notification?.body || payload.data?.body || 'Você recebeu uma nova notificação.';
      // Em primeiro plano o service worker não exibe automaticamente; mostramos apenas uma vez.
      if (Notification.permission === 'granted') {
        try { new Notification(titulo, { body: corpo, icon: '/favicon.ico', tag: payload.data?.route || 'orvix-notification' }); }
        catch (e) { console.warn('[Orvix Push] Não foi possível exibir a notificação em primeiro plano.', e); }
      }
    });
  }


  window.OrvixFirebaseNotific = { ativarNotificacoes, desativarNotificacoes };
  try {
    iniciarFirebase();
    configurarRecebimento();
  } catch (erro) {
    console.error('[Orvix Push] Falha na inicialização:', erro.message || erro);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', criarBotaoAtivacao, { once: true });
  else criarBotaoAtivacao();
})();
