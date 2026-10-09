(function () {
  'use strict';

  const firebaseConfig = {
  apiKey: "AIzaSyAudiu_ENQbQjElInkvbKkGqAzwTuzekBA",
  authDomain: "orvix-notificacoes.firebaseapp.com",
  projectId: "orvix-notificacoes",
  storageBucket: "orvix-notificacoes.firebasestorage.app",
  messagingSenderId: "454025108283",
  appId: "1:454025108283:web:6755e120e86e4c2b7f751e"
  };

  const VAPID_KEY = 'SUA_CHAVE_PUBLICA_VAPID';

  let messaging = null;

  function inicializarFirebase() {
    if (!window.firebase) {
      throw new Error('SDK do Firebase não foi carregado.');
    }

    const app = firebase.apps.length
      ? firebase.app()
      : firebase.initializeApp(firebaseConfig);

    messaging = firebase.messaging(app);
  }

  async function ativarNotificacoes() {
    try {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Este navegador não oferece suporte a Service Workers.');
      }

      if (!('Notification' in window)) {
        throw new Error('Este navegador não oferece suporte a notificações.');
      }

      if (!window.isSecureContext) {
        throw new Error('As notificações exigem HTTPS ou localhost.');
      }

      if (!messaging) {
        inicializarFirebase();
      }

      const permissao = await Notification.requestPermission();

      if (permissao !== 'granted') {
        throw new Error('A permissão para notificações não foi concedida.');
      }

      const registro = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js'
      );

      await navigator.serviceWorker.ready;

      const token = await messaging.getToken({
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registro
      });

      if (!token) {
        throw new Error('O Firebase não retornou um token para o dispositivo.');
      }

      const resposta = await fetch('/api/firebase-notific/token', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      });

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        throw new Error(
          dados.erro || 'Não foi possível registrar o dispositivo.'
        );
      }

      console.log('[Orvix Push] Dispositivo registrado.');

      return {
        sucesso: true,
        mensagem: 'Notificações ativadas neste dispositivo.'
      };
    } catch (erro) {
      console.error('[Orvix Push]', erro);

      throw erro;
    }
  }

  function configurarRecebimento() {
    if (!messaging) {
      inicializarFirebase();
    }

    messaging.onMessage((payload) => {
      const titulo = payload.notification?.title || 'Orvix';
      const mensagem =
        payload.notification?.body || 'Você recebeu uma notificação.';

      console.log('[Orvix Push] Notificação recebida:', payload);

      // O navegador pode não exibir notificações enquanto
      // o aplicativo está aberto. Aqui usamos a API nativa.
      if (Notification.permission === 'granted') {
        new Notification(titulo, {
          body: mensagem,
          icon: '/favicon.ico'
        });
      }
    });
  }

  try {
    inicializarFirebase();
    configurarRecebimento();
  } catch (erro) {
    console.error('[Orvix Push] Falha na inicialização:', erro.message);
  }

  window.OrvixFirebaseNotific = {
    ativarNotificacoes
  };
})();