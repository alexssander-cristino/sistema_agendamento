import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import 'dev/dev_app.dart';
import 'notification_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await Firebase.initializeApp();
    debugPrint('FIREBASE OK');

    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
    await NotificationService.init();
    debugPrint('NOTIFICATION SERVICE OK');

    final token = await FirebaseMessaging.instance.getToken();
    debugPrint('FCM TOKEN: $token');
  } catch (e, s) {
    debugPrint('ERRO NA INICIALIZACAO: $e');
    debugPrint('$s');
  }

  runApp(const OrvixDevApp());
}