
import 'package:flutter/material.dart';

import 'core/network/api_client.dart';
import 'core/theme/orvix_theme_controller.dart';
import 'features/auth/auth_service.dart';
import 'features/auth/login_page.dart';
import 'features/dashboard/dashboard_page.dart';
import 'features/subscription/planos_page.dart';

class OrvixApp extends StatefulWidget {
  const OrvixApp({super.key});

  @override
  State<OrvixApp> createState() => _OrvixAppState();
}

class _OrvixAppState extends State<OrvixApp> {
  final OrvixThemeController _theme =
      OrvixThemeController.instance;

  @override
  void initState() {
    super.initState();
    _theme.load();
  }

  @override
  Widget build(BuildContext context) {
    const roxo = Color(0xFF7965D8);

    return AnimatedBuilder(
      animation: _theme,
      builder: (context, _) {
        return MaterialApp(
          title: 'Orvix',
          debugShowCheckedModeBanner: false,
          themeMode: _theme.themeMode,
          theme: _buildLightTheme(roxo),
          darkTheme: _buildDarkTheme(roxo),
          home: const StartupPage(),
        );
      },
    );
  }

  ThemeData _buildLightTheme(Color roxo) {
    const fundo = Color(0xFFF7F7FB);
    const superficie = Colors.white;
    const texto = Color(0xFF252238);
    const borda = Color(0xFFEAE8F2);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.fromSeed(
        seedColor: roxo,
        brightness: Brightness.light,
        surface: superficie,
      ),
      scaffoldBackgroundColor: fundo,
      dividerColor: borda,
      appBarTheme: const AppBarTheme(
        backgroundColor: superficie,
        foregroundColor: texto,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: superficie,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: borda),
        ),
      ),
      inputDecorationTheme: _inputTheme(
        preenchimento: superficie,
        borda: const Color(0xFFE3E3EC),
        foco: roxo,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: roxo,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  ThemeData _buildDarkTheme(Color roxo) {
    const fundo = Color(0xFF090D19);
    const superficie = Color(0xFF11182A);
    const texto = Color(0xFFF4F6FC);
    const borda = Color(0xFF263149);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: ColorScheme.fromSeed(
        seedColor: roxo,
        brightness: Brightness.dark,
        surface: superficie,
      ),
      scaffoldBackgroundColor: fundo,
      dividerColor: borda,
      appBarTheme: const AppBarTheme(
        backgroundColor: superficie,
        foregroundColor: texto,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: superficie,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: borda),
        ),
      ),
      inputDecorationTheme: _inputTheme(
        preenchimento: const Color(0xFF0B1120),
        borda: borda,
        foco: roxo,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: roxo,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  InputDecorationTheme _inputTheme({
    required Color preenchimento,
    required Color borda,
    required Color foco,
  }) {
    return InputDecorationTheme(
      filled: true,
      fillColor: preenchimento,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 16,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: borda),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: borda),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: foco, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(
          color: Colors.redAccent,
        ),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(
          color: Colors.redAccent,
          width: 1.5,
        ),
      ),
    );
  }
}

class StartupPage extends StatefulWidget {
  const StartupPage({super.key});

  @override
  State<StartupPage> createState() => _StartupPageState();
}

class _StartupPageState extends State<StartupPage> {
  bool _loading = true;
  bool _hasSession = false;
  bool _subscriptionActive = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _checkSession();
  }

  Future<void> _checkSession() async {
    try {
      final token = await ApiClient.getToken();

      if (token == null || token.trim().isEmpty) {
        if (!mounted) return;

        setState(() {
          _hasSession = false;
          _subscriptionActive = false;
          _loading = false;
          _errorMessage = null;
        });
        return;
      }

      final sessaoValida = await AuthService.validarSessao();

      if (!sessaoValida) {
        if (!mounted) return;

        setState(() {
          _hasSession = false;
          _subscriptionActive = false;
          _loading = false;
          _errorMessage = null;
        });
        return;
      }

      final resposta =
          await ApiClient.get('/mercado-pago/minha-assinatura');

      final assinatura = resposta['assinatura'];
      final status = assinatura is Map
          ? assinatura['status']?.toString().toLowerCase()
          : null;

      if (!mounted) return;

      setState(() {
        _hasSession = true;
        _subscriptionActive = status == 'ativa';
        _loading = false;
        _errorMessage = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;

      setState(() {
        _loading = false;
        _errorMessage = e.message;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _loading = false;
        _errorMessage =
            'Não foi possível conectar ao servidor. '
            'Verifique sua conexão e tente novamente.';
      });
    }
  }

  Future<void> _tentarNovamente() async {
    if (_loading) return;

    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    await _checkSession();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(
            color: Color(0xFF7965D8),
          ),
        ),
      );
    }

    if (_errorMessage != null) {
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: 420,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.error_outline_rounded,
                      size: 48,
                      color: Colors.redAccent,
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Não foi possível iniciar',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _errorMessage!,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: _tentarNovamente,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Tentar novamente'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    if (!_hasSession) {
      return const LoginPage();
    }

    if (_subscriptionActive) {
      return const DashboardPage();
    }

    return const PlanosPage();
  }
}
