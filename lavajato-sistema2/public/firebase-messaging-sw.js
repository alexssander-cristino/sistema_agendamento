/* Service worker do Firebase Cloud Messaging — Orvix.
 * Mensagens com payload notification são exibidas automaticamente pelo FCM
 * em segundo plano; não chamar showNotification aqui para evitar duplicatas.
 */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAudiu_ENQbQjElInkvbKkGqAzwTuzekBA',
  authDomain: 'orvix-notificacoes.firebaseapp.com',
  projectId: 'orvix-notificacoes',
  storageBucket: 'orvix-notificacoes.firebasestorage.app',
  messagingSenderId: '454025108283',
  appId: '1:454025108283:web:6755e120e86e4c2b7f751e'
});

firebase.messaging();

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const data = event.notification && event.notification.data ? event.notification.data : {};
  const link = data.link || data.FCM_MSG?.notification?.click_action || '/';
  event.waitUntil((async function () {
    const destino = new URL(link, self.location.origin).href;
    const abas = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const aba of abas) {
      if ('focus' in aba && aba.url.startsWith(self.location.origin)) {
        await aba.focus();
        if ('navigate' in aba) await aba.navigate(destino);
        return;
      }
    }
    await clients.openWindow(destino);
  })());
});
