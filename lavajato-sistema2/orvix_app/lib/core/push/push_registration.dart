import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../notification_service.dart';
import '../network/api_client.dart';

/// Registra o token FCM deste aparelho na API (para o usuário logado)
/// e o remove no logout. Nunca lança exceção: falha de push não pode
/// atrapalhar login nem logout.
class PushRegistration {
  PushRegistration._();

  static StreamSubscription<String>? _refreshSub;
  static String? _ultimoToken;

  /// Chame depois que existir uma sessão válida (login, cadastro ou sessão restaurada).
  static Future<void> registrar() async {
    try {
      final token = await NotificationService.getToken();
      if (token == null || token.isEmpty) return;

      await _enviar(token);

      // Se o FCM renovar o token, envia o novo.
      _refreshSub ??= NotificationService.onTokenRefresh.listen((novo) async {
        try {
          await _enviar(novo);
        } catch (_) {}
      });
    } catch (e) {
      debugPrint('Push: falha ao registrar dispositivo: $e');
    }
  }

  /// Chame no logout, ANTES de limpar o token de login.
  static Future<void> remover() async {
    try {
      final token = _ultimoToken ?? await NotificationService.getToken();
      if (token != null && token.isNotEmpty) {
        await ApiClient.delete(
          '/dispositivos?token=${Uri.encodeQueryComponent(token)}',
        );
      }
    } catch (e) {
      debugPrint('Push: falha ao remover dispositivo: $e');
    }

    await _refreshSub?.cancel();
    _refreshSub = null;
    _ultimoToken = null;

    try {
      await NotificationService.deleteToken();
    } catch (_) {}
  }

  static Future<void> _enviar(String token) async {
    await ApiClient.post('/dispositivos', {
      'token': token,
      'plataforma':
          defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
    });
    _ultimoToken = token;
  }
}