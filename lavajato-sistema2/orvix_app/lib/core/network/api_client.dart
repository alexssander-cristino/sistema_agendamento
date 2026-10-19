import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  const ApiException(this.message, {this.statusCode});
  @override
  String toString() => message;
}

class ApiClient {
  // Em build de produção passe --dart-define=API_BASE_URL=https://SEU-DOMINIO/api.
  // O default aponta para a API publicada do Orvix, nunca para localhost no celular.
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://sistemaagendamento-lavajato-sistema.vercel.app/api',
  );
  static const String tokenKey = 'lavajato_auth_token';
  static const Duration _timeout = Duration(seconds: 25);

  static Future<String?> getToken() async => (await SharedPreferences.getInstance()).getString(tokenKey);
  static Future<void> saveToken(String token) async => (await SharedPreferences.getInstance()).setString(tokenKey, token);
  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(tokenKey);
    await prefs.remove('orvix_usuario');
    await prefs.remove('orvix_empresa');
  }

  static Uri _buildUri(String path) {
    final base = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    final p = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$p');
  }

  static Future<Map<String, String>> _headers(bool authenticated) async {
    final headers = <String, String>{'Accept': 'application/json', 'Content-Type': 'application/json'};
    if (authenticated) {
      final token = await getToken();
      if (token != null && token.isNotEmpty) headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  static Future<http.Response> _send({required String method, required String path, Map<String, dynamic>? body, bool authenticated = true}) async {
    final headers = await _headers(authenticated);
    final uri = _buildUri(path);
    final encoded = body == null ? null : jsonEncode(body);
    switch (method) {
      case 'GET': return http.get(uri, headers: headers).timeout(_timeout);
      case 'POST': return http.post(uri, headers: headers, body: encoded).timeout(_timeout);
      case 'PUT': return http.put(uri, headers: headers, body: encoded).timeout(_timeout);
      case 'PATCH': return http.patch(uri, headers: headers, body: encoded).timeout(_timeout);
      case 'DELETE': return http.delete(uri, headers: headers, body: encoded).timeout(_timeout);
      default: throw ArgumentError('Método HTTP não suportado: $method');
    }
  }

  static Map<String, dynamic> _parseResponse(http.Response response) {
    Map<String, dynamic> data = {};
    if (response.body.isNotEmpty) {
      try { final decoded = jsonDecode(response.body); if (decoded is Map<String, dynamic>) data = decoded; } on FormatException { data = {}; }
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(data['erro']?.toString() ?? data['mensagem']?.toString() ?? 'Não foi possível concluir a solicitação.', statusCode: response.statusCode);
    }
    return data;
  }

  static Future<Map<String, dynamic>> get(String path, {bool authenticated = true}) async => _parseResponse(await _send(method: 'GET', path: path, authenticated: authenticated));
  static Future<Map<String, dynamic>> post(String path, Map<String, dynamic> payload, {bool authenticated = true}) async => _parseResponse(await _send(method: 'POST', path: path, body: payload, authenticated: authenticated));
  static Future<Map<String, dynamic>> put(String path, Map<String, dynamic> payload, {bool authenticated = true}) async => _parseResponse(await _send(method: 'PUT', path: path, body: payload, authenticated: authenticated));
  static Future<Map<String, dynamic>> patch(String path, Map<String, dynamic> payload, {bool authenticated = true}) async => _parseResponse(await _send(method: 'PATCH', path: path, body: payload, authenticated: authenticated));
  static Future<Map<String, dynamic>> delete(String path, {bool authenticated = true}) async => _parseResponse(await _send(method: 'DELETE', path: path, authenticated: authenticated));

  static Future<List<dynamic>> getList(String path, {bool authenticated = true}) async {
    final response = await _send(method: 'GET', path: path, authenticated: authenticated);
    dynamic decoded;
    if (response.body.isNotEmpty) { try { decoded = jsonDecode(response.body); } on FormatException { decoded = null; } }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final data = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
      throw ApiException(data['erro']?.toString() ?? data['mensagem']?.toString() ?? 'Não foi possível carregar os dados.', statusCode: response.statusCode);
    }
    if (decoded is List) return decoded;
    throw const ApiException('A API não retornou uma lista válida.');
  }
}
