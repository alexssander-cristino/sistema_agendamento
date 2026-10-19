
import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Trata mensagens FCM recebidas em segundo plano.
///
/// Registre esta função com FirebaseMessaging.onBackgroundMessage
/// no main.dart, antes de executar runApp().
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  // Mensagens com o campo "notification" são exibidas pelo Android
  // quando o aplicativo está em segundo plano ou fechado.
  //
  // Não exiba uma notificação local aqui sem verificar o payload,
  // para evitar notificações duplicadas.
}

class NotificationService {
  NotificationService._();

  static final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  static final FirebaseMessaging _fcm = FirebaseMessaging.instance;

  /// Rota que a interface pode observar para abrir a tela correspondente.
  static final ValueNotifier<String?> pendingRoute =
      ValueNotifier<String?>(null);

  static const String channelId = 'orvix_default';

  /// Nome do recurso Android:
  /// android/app/src/main/res/drawable/ic_notification.png
  static const String notificationIcon = 'ic_notification';

  static const AndroidNotificationChannel _channel =
      AndroidNotificationChannel(
    channelId,
    'Notificações do Orvix',
    description: 'Agendamentos, lembretes e avisos do Orvix One',
    importance: Importance.high,
  );

  static bool _initialized = false;
  static Future<void>? _initializing;

  /// Inicializa o Firebase Messaging e as notificações locais.
  static Future<void> init() {
    if (_initialized) return Future<void>.value();

    // Evita inicializações concorrentes.
    return _initializing ??= _initInternal().whenComplete(() {
      _initializing = null;
    });
  }

  static Future<void> _initInternal() async {
    // Solicita permissão de notificações ao usuário, quando aplicável.
    await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    // Exibição de notificações em primeiro plano no iOS.
    await _fcm.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    const initializationSettings = InitializationSettings(
      android: AndroidInitializationSettings(notificationIcon),
      iOS: DarwinInitializationSettings(),
    );

    await _local.initialize(
      settings: initializationSettings,
      onDidReceiveNotificationResponse: (response) {
        _onTap(response.payload);
      },
    );

    // Cria o canal utilizado pelas notificações locais do Android.
    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    // Notificações recebidas enquanto o app está aberto.
    FirebaseMessaging.onMessage.listen((message) {
      unawaited(_showForeground(message));
    });

    // Usuário tocou em uma notificação FCM com o app em segundo plano.
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _onTap(_getRoute(message));
    });

    // Usuário abriu o app tocando em uma notificação após encerrá-lo.
    final initialMessage = await _fcm.getInitialMessage();

    if (initialMessage != null) {
      _onTap(_getRoute(initialMessage));
    }

    _initialized = true;
  }

  /// Obtém o token FCM deste dispositivo.
  static Future<String?> getToken() {
    return _fcm.getToken();
  }

  /// Stream de renovação do token FCM.
  static Stream<String> get onTokenRefresh {
    return _fcm.onTokenRefresh;
  }

  /// Remove o token FCM local.
  ///
  /// Use somente se a intenção for realmente desvincular este token.
  static Future<void> deleteToken() {
    return _fcm.deleteToken();
  }

  /// Mostra uma notificação local quando chega um push com o app aberto.
  static Future<void> _showForeground(RemoteMessage message) async {
    if (defaultTargetPlatform != TargetPlatform.android) return;

    final title =
        message.notification?.title ??
        message.data['title']?.toString() ??
        'Orvix One';

    final body =
        message.notification?.body ??
        message.data['body']?.toString() ??
        '';

    final route = _getRoute(message);

    await _local.show(
      id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          channelId,
          _channel.name,
          channelDescription: _channel.description,
          icon: notificationIcon,
          importance: Importance.high,
          priority: Priority.high,
          playSound: true,
          enableVibration: true,
          category: AndroidNotificationCategory.status,
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: route,
    );
  }

  /// Extrai a rota da mensagem sem assumir que o valor é uma String.
  static String? _getRoute(RemoteMessage message) {
    final value = message.data['route'];

    if (value is String && value.isNotEmpty) {
      return value;
    }

    return null;
  }

  /// Informa à interface qual rota deve ser aberta.
  static void _onTap(String? route) {
    if (route != null && route.isNotEmpty) {
      pendingRoute.value = route;
    }
  }
}
