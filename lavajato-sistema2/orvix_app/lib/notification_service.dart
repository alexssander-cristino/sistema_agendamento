import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'firebase_options.dart';

const String _channelId = 'orvix_default';
const String _channelName = 'Notificações do Orvix';
const String _channelDescription =
    'Agendamentos, lembretes e avisos do Orvix One';
const String _notificationIcon = 'ic_notification';

const AndroidNotificationChannel _androidChannel = AndroidNotificationChannel(
  _channelId,
  _channelName,
  description: _channelDescription,
  importance: Importance.high,
);

/// Handler executado pelo Firebase Messaging em um isolate de background.
///
/// Mensagens que já possuem o campo "notification" são normalmente exibidas
/// pelo Android em segundo plano. Para evitar duplicação, criamos notificação
/// local somente para mensagens data-only.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (_) {
    // O app Firebase pode já estar inicializado neste isolate.
  }

  // O sistema operacional exibe mensagens com payload "notification"
  // quando o app está em segundo plano/encerrado. Não duplicar aqui.
  if (message.notification != null) return;

  if (defaultTargetPlatform != TargetPlatform.android) return;

  final title = _readText(message.data['title']) ??
      _readText(message.data['notification_title']) ??
      'Orvix One';
  final body = _readText(message.data['body']) ??
      _readText(message.data['message']) ??
      _readText(message.data['notification_body']) ??
      '';

  // Sem conteúdo visível, não há o que exibir.
  if (body.isEmpty && _readText(message.data['title']) == null &&
      _readText(message.data['notification_title']) == null) {
    return;
  }

  final local = FlutterLocalNotificationsPlugin();

  const initializationSettings = InitializationSettings(
    android: AndroidInitializationSettings(_notificationIcon),
    iOS: DarwinInitializationSettings(),
  );

  await local.initialize(settings: initializationSettings);

  final androidPlugin = local.resolvePlatformSpecificImplementation<
      AndroidFlutterLocalNotificationsPlugin>();
  await androidPlugin?.createNotificationChannel(_androidChannel);

  final route = _readText(message.data['route']);

  await local.show(
    id: message.messageId?.hashCode ??
        DateTime.now().millisecondsSinceEpoch.remainder(2147483647),
    title: title,
    body: body,
    notificationDetails: const NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        _channelName,
        channelDescription: _channelDescription,
        icon: _notificationIcon,
        importance: Importance.high,
        priority: Priority.high,
        playSound: true,
        enableVibration: true,
        category: AndroidNotificationCategory.status,
      ),
    ),
    payload: route,
  );
}

String? _readText(Object? value) {
  if (value == null) return null;
  final text = value.toString().trim();
  return text.isEmpty ? null : text;
}

class NotificationService {
  NotificationService._();

  static final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  static final FirebaseMessaging _fcm = FirebaseMessaging.instance;

  /// A interface pode observar este valor para tratar o toque na notificação.
  static final ValueNotifier<String?> pendingRoute =
      ValueNotifier<String?>(null);

  static bool _initialized = false;
  static Future<void>? _initializing;

  static Future<void> init() {
    if (_initialized) return Future<void>.value();

    return _initializing ??= _initInternal().whenComplete(() {
      _initializing = null;
    });
  }

  static Future<void> _initInternal() async {
    await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    await _fcm.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    const initializationSettings = InitializationSettings(
      android: AndroidInitializationSettings(_notificationIcon),
      iOS: DarwinInitializationSettings(),
    );

    await _local.initialize(
      settings: initializationSettings,
      onDidReceiveNotificationResponse: (response) {
        _onTap(response.payload);
      },
    );

    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_androidChannel);

    // Android: mensagens recebidas com o app aberto precisam de notificação
    // local. No iOS, as opções de apresentação acima tratam alertas FCM que
    // possuem payload "notification".
    FirebaseMessaging.onMessage.listen((message) {
      unawaited(_showForeground(message));
    });

    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _onTap(_getRoute(message));
    });

    final initialMessage = await _fcm.getInitialMessage();
    if (initialMessage != null) {
      _onTap(_getRoute(initialMessage));
    }

    _initialized = true;
  }

  static Future<String?> getToken() => _fcm.getToken();

  static Stream<String> get onTokenRefresh => _fcm.onTokenRefresh;

  static Future<void> deleteToken() => _fcm.deleteToken();

  static Future<void> _showForeground(RemoteMessage message) async {
    if (defaultTargetPlatform != TargetPlatform.android) return;

    final title = message.notification?.title ??
        _readText(message.data['title']) ??
        _readText(message.data['notification_title']) ??
        'Orvix One';

    final body = message.notification?.body ??
        _readText(message.data['body']) ??
        _readText(message.data['message']) ??
        _readText(message.data['notification_body']) ??
        '';

    if (body.isEmpty && message.notification?.title == null &&
        _readText(message.data['title']) == null &&
        _readText(message.data['notification_title']) == null) {
      return;
    }

    await _local.show(
      id: message.messageId?.hashCode ??
          DateTime.now().millisecondsSinceEpoch.remainder(2147483647),
      title: title,
      body: body,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          channelDescription: _channelDescription,
          icon: _notificationIcon,
          importance: Importance.high,
          priority: Priority.high,
          playSound: true,
          enableVibration: true,
          category: AndroidNotificationCategory.status,
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: _getRoute(message),
    );
  }

  static String? _getRoute(RemoteMessage message) {
    return _readText(message.data['route']);
  }

  static void _onTap(String? route) {
    if (route != null && route.isNotEmpty) {
      pendingRoute.value = route;
    }
  }
}
