import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import 'dev/dev_app.dart';
import 'firebase_options.dart';
import 'notification_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    debugPrint('[ORVIX DEV PUSH] Firebase inicializado.');

    FirebaseMessaging.onBackgroundMessage(
      firebaseBackgroundHandler,
    );

    await NotificationService.init();

    final token = await NotificationService.getToken();

    debugPrint(
      '[ORVIX DEV PUSH] Token FCM disponível: '
      '${token != null && token.isNotEmpty}',
    );
  } catch (e, stackTrace) {
    debugPrint('[ORVIX DEV PUSH] Erro ao inicializar: $e');
    debugPrint('$stackTrace');
  }

  runApp(const OrvixDevApp());
}