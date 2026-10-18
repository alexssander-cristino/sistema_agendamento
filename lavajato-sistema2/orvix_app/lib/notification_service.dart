import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Handler para mensagens com o app em segundo plano ou fechado.
/// Precisa ser uma função de nível superior.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  // Mensagens com o campo "notification" são exibidas pelo próprio sistema.
}

class NotificationService {
  NotificationService._();

  static final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  static final FirebaseMessaging _fcm = FirebaseMessaging.instance;

  /// A tela do WebView observa este valor e navega quando houver uma rota.
  static final ValueNotifier<String?> pendingRoute =
      ValueNotifier<String?>(null);

  static const String channelId = 'orvix_default';

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    channelId,
    'Notificações do Orvix',
    description: 'Agendamentos, lembretes e avisos',
    importance: Importance.high,
  );

  static bool _initialized = false;

  static Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    // No Android 13+ isto também pede a permissão POST_NOTIFICATIONS.
    await _fcm.requestPermission();

    // iOS: mostra o push mesmo com o app aberto.
    await _fcm.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    await _local.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
      onDidReceiveNotificationResponse: (response) =>
          _onTap(response.payload),
    );

    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    FirebaseMessaging.onMessage.listen(_showForeground);
    FirebaseMessaging.onMessageOpenedApp
        .listen((m) => _onTap(m.data['route'] as String?));

    // App aberto a partir de uma notificação (estava fechado).
    final initial = await _fcm.getInitialMessage();
    if (initial != null) _onTap(initial.data['route'] as String?);
  }

  /// Token FCM deste dispositivo.
  static Future<String?> getToken() => _fcm.getToken();

  /// Dispara quando o FCM renova o token.
  static Stream<String> get onTokenRefresh => _fcm.onTokenRefresh;

  /// Chame no logout para o aparelho parar de receber pushes do usuário.
  static Future<void> deleteToken() => _fcm.deleteToken();

  static Future<void> _showForeground(RemoteMessage m) async {
    // No iOS o sistema já exibe (ver setForegroundNotificationPresentationOptions).
    if (defaultTargetPlatform != TargetPlatform.android) return;

    final title = m.notification?.title ?? m.data['title'] as String? ?? 'Orvix';
    final body = m.notification?.body ?? m.data['body'] as String? ?? '';

    await _local.show(
      id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
          // Personalização: cor, som, estilo, botões de ação etc.
        ),
      ),
      payload: m.data['route'] as String?,
    );
  }

  static void _onTap(String? route) {
    if (route != null && route.isNotEmpty) {
      pendingRoute.value = route;
    }
  }
}