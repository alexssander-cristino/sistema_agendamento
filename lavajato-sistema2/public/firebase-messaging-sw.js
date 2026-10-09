
importScripts(
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js'
);

importScripts(
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js'
);

firebase.initializeApp({
  apiKey: "AIzaSyAudiu_ENQbQjElInkvbKkGqAzwTuzekBA",
  authDomain: "orvix-notificacoes.firebaseapp.com",
  projectId: "orvix-notificacoes",
  storageBucket: "orvix-notificacoes.firebasestorage.app",
  messagingSenderId: "454025108283",
  appId: "1:454025108283:web:6755e120e86e4c2b7f751e"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};

  return self.registration.showNotification(
    notification.title || 'Orvix',
    {
      body: notification.body || 'Você tem uma nova notificação.',
      data: {
        link: payload.fcmOptions?.link || '/'
      }
    }
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const link = event.notification.data?.link || '/';

  event.waitUntil(clients.openWindow(link));
});