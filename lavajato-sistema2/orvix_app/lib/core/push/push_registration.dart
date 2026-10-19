import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../notification_service.dart';
import '../network/api_client.dart';

/// Registra e mantém atualizado o token FCM do usuário autenticado.
class PushRegistration {
  PushRegistration._();
  static StreamSubscription<String>? _refreshSub;
  static String? _ultimoToken;
  static bool _registrando = false;

  static Future<void> registrar() async {
    if (_registrando) return;
    _registrando = true;
    try {
      await NotificationService.init();
      final token = await NotificationService.getToken();
      if (token == null || token.trim().isEmpty) {
        debugPrint('[Orvix Push] FCM não retornou token.');
        return;
      }
      await _enviar(token);
      _refreshSub ??= NotificationService.onTokenRefresh.listen((novoToken) async {
        try {
          await _enviar(novoToken);
        } catch (erro) {
          debugPrint('[Orvix Push] Falha ao atualizar token FCM: $erro');
        }
      });
      debugPrint('[Orvix Push] Dispositivo registrado na API.');
    } catch (erro) {
      // Não bloqueia login se o serviço de push estiver indisponível.
      debugPrint('[Orvix Push] Falha ao registrar dispositivo: $erro');
    } finally {
      _registrando = false;
    }
  }

  static Future<void> remover() async {
    try {
      final token = _ultimoToken ?? await NotificationService.getToken();
      if (token != null && token.isNotEmpty) {
        await ApiClient.delete('/dispositivos?token=${Uri.encodeQueryComponent(token)}');
      }
    } catch (erro) {
      debugPrint('[Orvix Push] Falha ao remover dispositivo da API: $erro');
    }
    await _refreshSub?.cancel();
    _refreshSub = null;
    _ultimoToken = null;
    try {
      await NotificationService.deleteToken();
    } catch (erro) {
      debugPrint('[Orvix Push] Falha ao apagar token local: $erro');
    }
  }

  static Future<void> _enviar(String token) async {
    await ApiClient.post('/dispositivos', {
      'token': token,
      'plataforma': defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
    });
    _ultimoToken = token;
  }
}
