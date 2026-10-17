import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../core/network/api_client.dart';

class AuthService {
  static const String _usuarioKey = 'orvix_usuario';
  static const String _empresaKey = 'orvix_empresa';

  // ============================================================
  // LOGIN
  // ============================================================

  static Future<Map<String, dynamic>> login({
    required String email,
    required String senha,
  }) async {
    final data = await ApiClient.post(
      '/auth/login',
      {
        'email': email.trim(),
        'senha': senha,
      },
      authenticated: false,
    );

    await _salvarSessao(data);

    return data;
  }

  // ============================================================
  // CADASTRO
  // ============================================================

  static Future<Map<String, dynamic>> cadastrar({
    required String empresa,
    required String emailEmpresa,
    String? telefone,
    required String nome,
    required String email,
    required String senha,
    required String nicho,
  }) async {
    final data = await ApiClient.post(
      '/auth/cadastro',
      {
        'empresa': empresa.trim(),
        'email_empresa': emailEmpresa.trim(),
        'telefone': telefone?.trim() ?? '',
        'nome': nome.trim(),
        'email': email.trim(),
        'senha': senha,
        'nicho': nicho.trim(),
      },
      authenticated: false,
    );

    await _salvarSessao(data);

    return data;
  }

  // ============================================================
  // SALVAR SESSÃO
  // ============================================================

  static Future<void> _salvarSessao(
    Map<String, dynamic> data,
  ) async {
    final token = data['token']?.toString();
    final usuario = data['usuario'];
    final empresa = data['empresa'];

    if (token == null || token.trim().isEmpty) {
      throw const ApiException(
        'O servidor não retornou um token de acesso.',
      );
    }

    if (usuario is! Map) {
      throw const ApiException(
        'O servidor não retornou os dados do usuário.',
      );
    }

    final usuarioMap = Map<String, dynamic>.from(usuario);
    final prefs = await SharedPreferences.getInstance();

    await prefs.setString(
      _usuarioKey,
      jsonEncode(usuarioMap),
    );

    if (empresa is Map) {
      await prefs.setString(
        _empresaKey,
        jsonEncode(Map<String, dynamic>.from(empresa)),
      );
    } else {
      await prefs.remove(_empresaKey);
    }

    await ApiClient.saveToken(token);
  }

  // ============================================================
  // VALIDAR E ATUALIZAR SESSÃO NO SERVIDOR
  // ============================================================

  static Future<bool> validarSessao() async {
    final token = await ApiClient.getToken();

    if (token == null || token.trim().isEmpty) {
      return false;
    }

    try {
      final data = await ApiClient.get('/auth/me');

      final usuario = data['usuario'];
      final empresa = data['empresa'];

      if (usuario is! Map) {
        throw const ApiException(
          'O servidor não retornou os dados do usuário.',
        );
      }

      final prefs = await SharedPreferences.getInstance();

      await prefs.setString(
        _usuarioKey,
        jsonEncode(Map<String, dynamic>.from(usuario)),
      );

      if (empresa is Map) {
        await prefs.setString(
          _empresaKey,
          jsonEncode(Map<String, dynamic>.from(empresa)),
        );
      } else {
        await prefs.remove(_empresaKey);
      }

      return true;
    } on ApiException catch (e) {
      if (e.statusCode == 401 ||
          e.statusCode == 403 ||
          e.statusCode == 404) {
        await ApiClient.clearSession();
        return false;
      }

      // Falhas temporárias do servidor não invalidam
      // automaticamente a sessão local.
      rethrow;
    }
  }

  // ============================================================
  // RECUPERAR USUÁRIO SALVO
  // ============================================================

  static Future<Map<String, dynamic>?> getSavedUser() async {
    final prefs = await SharedPreferences.getInstance();
    final json = prefs.getString(_usuarioKey);

    if (json == null) {
      return null;
    }

    try {
      final decoded = jsonDecode(json);

      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
    } on FormatException {
      return null;
    }

    return null;
  }

  // ============================================================
  // RECUPERAR EMPRESA SALVA
  // ============================================================

  static Future<Map<String, dynamic>?> getSavedCompany() async {
    final prefs = await SharedPreferences.getInstance();
    final json = prefs.getString(_empresaKey);

    if (json == null) {
      return null;
    }

    try {
      final decoded = jsonDecode(json);

      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
    } on FormatException {
      return null;
    }

    return null;
  }

  // ============================================================
  // LOGOUT
  // ============================================================

  static Future<void> logout() async {
    try {
      // Tenta encerrar a sessão no backend.
      await ApiClient.post('/auth/logout', {});
    } catch (_) {
      // Limpa a sessão local mesmo sem conexão.
    } finally {
      await ApiClient.clearSession();

      final prefs = await SharedPreferences.getInstance();

      await prefs.remove(_usuarioKey);
      await prefs.remove(_empresaKey);
    }
  }
}
