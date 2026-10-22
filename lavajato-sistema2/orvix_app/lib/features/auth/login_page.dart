import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/orvix_theme_controller.dart';
import '../dashboard/dashboard_page.dart';
import '../subscription/planos_page.dart';
import 'auth_service.dart';
import 'cadastro_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _senhaController = TextEditingController();

  bool _mostrarSenha = false;
  bool _carregando = false;
  String? _erro;

  bool _aceitouTermos = false;
  bool _erroTermos = false;

  static const String _urlTermos =
      'https://sistemaagendamento-lavajato-sistema.vercel.app/termos.html';

  static const String _urlPrivacidade =
      'https://sistemaagendamento-lavajato-sistema.vercel.app/politica-de-privacidade.html';

  late final TapGestureRecognizer _termosTap;
  late final TapGestureRecognizer _privacidadeTap;

  // ============================================================
  // TEMA
  // ============================================================

  bool get _temaEscuro => OrvixThemeController.instance.isDark;

  Color get _fundo => _temaEscuro
      ? const Color(0xFF090D19)
      : const Color(0xFFF7F5FF);

  Color get _painel => _temaEscuro
      ? const Color(0xFF11182A)
      : Colors.white;

  Color get _borda => _temaEscuro
      ? const Color(0xFF263149)
      : const Color(0xFFE5DFF3);

  static const Color _roxo = Color(0xFF7965D8);
  static const Color _roxoClaro = Color(0xFF8B5CF6);
  static const Color _ciano = Color(0xFF0891B2);

  Color get _texto => _temaEscuro
      ? const Color(0xFFF4F6FC)
      : const Color(0xFF211B35);

  Color get _textoSecundario => _temaEscuro
      ? const Color(0xFF9BA8C0)
      : const Color(0xFF716B85);

  Color get _fundoCampo => _temaEscuro
      ? const Color(0xFF0B1120)
      : const Color(0xFFFAF9FF);

  Color get _textoDestaque => _temaEscuro
      ? const Color(0xFFD9D5FF)
      : const Color(0xFF6550B8);

  Color get _corBotoesSecundarios => _temaEscuro
      ? _ciano
      : const Color(0xFF6D55C7);

  Color get _corIcones => _temaEscuro
      ? _ciano
      : const Color(0xFF7965D8);

  Color get _corDivisor => _temaEscuro
      ? _borda
      : const Color(0xFFE8E3F3);

  @override
  void initState() {
    super.initState();

    _termosTap = TapGestureRecognizer()
      ..onTap = () => _abrirLink(_urlTermos);

    _privacidadeTap = TapGestureRecognizer()
      ..onTap = () => _abrirLink(_urlPrivacidade);
  }

  @override
  void dispose() {
    _termosTap.dispose();
    _privacidadeTap.dispose();
    _emailController.dispose();
    _senhaController.dispose();
    super.dispose();
  }

  // ============================================================
  // LINKS DOS DOCUMENTOS
  // ============================================================

  Future<void> _abrirLink(String url) async {
    bool ok = false;

    try {
      ok = await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.externalApplication,
      );
    } catch (_) {
      ok = false;
    }

    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Não foi possível abrir o link.'),
          backgroundColor: _painel,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  // ============================================================
  // LOGIN E VERIFICAÇÃO DA ASSINATURA
  // ============================================================

  Future<void> _entrar() async {
    FocusScope.of(context).unfocus();

    if (_carregando) return;

    final formValido = _formKey.currentState!.validate();

    if (!_aceitouTermos) {
      setState(() => _erroTermos = true);
    }

    if (!formValido || !_aceitouTermos) {
      return;
    }

    setState(() {
      _carregando = true;
      _erro = null;
    });

    try {
      final resultado = await AuthService.login(
        email: _emailController.text.trim(),
        senha: _senhaController.text,
      );

      if (!mounted) return;

      final usuario = resultado['usuario'];

      if (usuario is! Map) {
        await AuthService.logout();

        if (!mounted) return;

        setState(() {
          _erro = 'O servidor não retornou os dados do usuário.';
        });

        return;
      }

      final perfil = usuario['perfil']?.toString() ?? '';

      if (perfil == 'dev') {
        await AuthService.logout();

        if (!mounted) return;

        setState(() {
          _erro =
              'Esta é uma conta de desenvolvedor. '
              'Entre pelo painel DEV do Orvix.';
        });

        return;
      }

      if (usuario['ativo'] == false) {
        await AuthService.logout();

        if (!mounted) return;

        setState(() {
          _erro =
              'Esta conta está desativada. '
              'Entre em contato com o administrador da empresa.';
        });

        return;
      }

      final resposta = await ApiClient.get(
        '/mercado-pago/minha-assinatura',
      );

      if (!mounted) return;

      final assinatura = resposta['assinatura'];

      final status = assinatura is Map
          ? assinatura['status']?.toString().toLowerCase()
          : null;

      final assinaturaAtiva = status == 'ativa';

      final Widget paginaDestino = assinaturaAtiva
          ? const DashboardPage()
          : const PlanosPage();

      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(
          builder: (_) => paginaDestino,
        ),
        (route) => false,
      );
    } on ApiException catch (e) {
      if (!mounted) return;

      setState(() {
        _erro = _mensagemErro(e);
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _erro =
            'Não foi possível verificar seu acesso. '
            'Verifique sua conexão e tente novamente.';
      });
    } finally {
      if (mounted) {
        setState(() => _carregando = false);
      }
    }
  }

  // ============================================================
  // MENSAGENS DE ERRO
  // ============================================================

  String _mensagemErro(ApiException erro) {
    final mensagem = erro.message.trim();

    if (erro.statusCode == 401) {
      return 'E-mail ou senha incorretos. '
          'Seus dados de acesso podem ter expirado.';
    }

    if (erro.statusCode == 403) {
      return mensagem.isNotEmpty
          ? mensagem
          : 'Seu acesso não está autorizado.';
    }

    if (erro.statusCode == 429) {
      return mensagem.isNotEmpty
          ? mensagem
          : 'Muitas tentativas. Aguarde antes de tentar novamente.';
    }

    if (erro.statusCode != null && erro.statusCode! >= 500) {
      return 'O servidor apresentou um erro. '
          'Tente novamente em instantes.';
    }

    return mensagem.isNotEmpty
        ? mensagem
        : 'Não foi possível realizar o login.';
  }

  // ============================================================
  // ABRIR CADASTRO
  // ============================================================

  void _abrirCadastro() {
    if (_carregando) return;

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => const CadastroPage(),
      ),
    );
  }

  // ============================================================
  // BOTÃO DE TEMA
  // ============================================================

  Widget _botaoTema() {
    final theme = OrvixThemeController.instance;

    return AnimatedBuilder(
      animation: theme,
      builder: (context, _) {
        return Material(
          color: _painel,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: _borda),
          ),
          child: IconButton(
            tooltip: theme.isDark
                ? 'Ativar tema claro'
                : 'Ativar tema escuro',
            onPressed: theme.toggleTheme,
            icon: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              child: Icon(
                theme.isDark
                    ? Icons.light_mode_rounded
                    : Icons.dark_mode_rounded,
                key: ValueKey<bool>(theme.isDark),
                color: _corIcones,
              ),
            ),
          ),
        );
      },
    );
  }

  // ============================================================
  // BUILD
  // ============================================================

  @override
  Widget build(BuildContext context) {
    final theme = OrvixThemeController.instance;

    return AnimatedBuilder(
      animation: theme,
      builder: (context, _) {
        return Scaffold(
          backgroundColor: _fundo,
          body: LayoutBuilder(
            builder: (context, constraints) {
              final largura = constraints.maxWidth;
              final desktop = largura >= 900;

              return Stack(
                children: [
                  Positioned(
                    top: -150,
                    left: -120,
                    child: _Glow(
                      cor: _roxo,
                      tamanho: 340,
                      opacidade: _temaEscuro ? 0.055 : 0.075,
                    ),
                  ),
                  Positioned(
                    bottom: -180,
                    right: -100,
                    child: _Glow(
                      cor: _ciano,
                      tamanho: 360,
                      opacidade: _temaEscuro ? 0.055 : 0.045,
                    ),
                  ),
                  Positioned(
                    top: 16,
                    right: 16,
                    child: SafeArea(
                      child: _botaoTema(),
                    ),
                  ),
                  SafeArea(
                    child: Center(
                      child: SingleChildScrollView(
                        padding: EdgeInsets.symmetric(
                          horizontal: largura < 420 ? 20 : 32,
                          vertical: 28,
                        ),
                        child: ConstrainedBox(
                          constraints: BoxConstraints(
                            maxWidth: desktop ? 1040 : 460,
                          ),
                          child: desktop
                              ? _layoutDesktop()
                              : _layoutMobile(),
                        ),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }

  // ============================================================
  // LAYOUT MOBILE
  // ============================================================

  Widget _layoutMobile() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _logo(),
        const SizedBox(height: 34),
        _cartaoLogin(),
        const SizedBox(height: 26),
        _rodape(),
      ],
    );
  }

  // ============================================================
  // LAYOUT DESKTOP
  // ============================================================

  Widget _layoutDesktop() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(right: 52),
            child: _apresentacao(),
          ),
        ),
        SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _cartaoLogin(),
              const SizedBox(height: 22),
              _rodape(),
            ],
          ),
        ),
      ],
    );
  }

  // ============================================================
  // LOGO
  // ============================================================

  Widget _logo() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFF8B5CF6),
                Color(0xFF5B4BE7),
              ],
            ),
            boxShadow: [
              BoxShadow(
                color: _roxo.withValues(alpha: 0.20),
                blurRadius: 24,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: const Icon(
            Icons.bolt_rounded,
            color: Colors.white,
            size: 29,
          ),
        ),
        const SizedBox(width: 13),
        Text(
          'orvix',
          style: TextStyle(
            color: _texto,
            fontSize: 32,
            fontWeight: FontWeight.w800,
            letterSpacing: -1.5,
          ),
        ),
      ],
    );
  }

  // ============================================================
  // APRESENTAÇÃO
  // ============================================================

  Widget _apresentacao() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _logo(),
        const SizedBox(height: 64),
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 13,
            vertical: 8,
          ),
          decoration: BoxDecoration(
            color: _roxo.withValues(
              alpha: _temaEscuro ? 0.12 : 0.09,
            ),
            borderRadius: BorderRadius.circular(30),
            border: Border.all(
              color: _roxo.withValues(alpha: 0.28),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.auto_awesome_rounded,
                color: _corIcones,
                size: 16,
              ),
              const SizedBox(width: 8),
              Text(
                'GESTÃO MAIS INTELIGENTE',
                style: TextStyle(
                  color: _textoDestaque,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 25),
        Text(
          'Sua empresa.\nSeu controle.\nSeu próximo nível.',
          style: TextStyle(
            color: _texto,
            fontSize: 43,
            height: 1.16,
            fontWeight: FontWeight.w800,
            letterSpacing: -1.7,
          ),
        ),
        const SizedBox(height: 22),
        Text(
          'Organize sua operação, acompanhe os resultados '
          'e tenha as informações da sua empresa em um '
          'só lugar.',
          style: TextStyle(
            color: _textoSecundario,
            fontSize: 16,
            height: 1.8,
          ),
        ),
        const SizedBox(height: 34),
        _beneficio(
          Icons.calendar_month_rounded,
          'Organização',
          'Acompanhe seus agendamentos e clientes.',
        ),
        const SizedBox(height: 20),
        _beneficio(
          Icons.query_stats_rounded,
          'Visão financeira',
          'Consulte receitas, despesas e resultados.',
        ),
        const SizedBox(height: 20),
        _beneficio(
          Icons.shield_outlined,
          'Acesso protegido',
          'Entre com suas credenciais de usuário.',
        ),
      ],
    );
  }

  Widget _beneficio(
    IconData icone,
    String titulo,
    String descricao,
  ) {
    return Row(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: _temaEscuro
                ? Colors.white.withValues(alpha: 0.045)
                : _roxo.withValues(alpha: 0.07),
            borderRadius: BorderRadius.circular(13),
            border: Border.all(color: _borda),
          ),
          child: Icon(
            icone,
            color: _corIcones,
            size: 21,
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                titulo,
                style: TextStyle(
                  color: _texto,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                descricao,
                style: TextStyle(
                  color: _textoSecundario,
                  fontSize: 12,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ============================================================
  // TERMOS E PRIVACIDADE
  // ============================================================

  void _alternarTermos() {
    if (_carregando) return;

    setState(() {
      _aceitouTermos = !_aceitouTermos;

      if (_aceitouTermos) {
        _erroTermos = false;
      }

      _erro = null;
    });
  }

  Widget _campoTermos() {
    final estiloLink = TextStyle(
      color: _corBotoesSecundarios,
      fontWeight: FontWeight.w700,
      decoration: TextDecoration.underline,
      decorationColor: _corBotoesSecundarios,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 24,
              height: 24,
              child: Checkbox(
                value: _aceitouTermos,
                activeColor: _roxo,
                checkColor: Colors.white,
                side: BorderSide(
                  color: _erroTermos
                      ? const Color(0xFFEF4444)
                      : _textoSecundario,
                  width: 1.5,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(5),
                ),
                onChanged: _carregando
                    ? null
                    : (valor) {
                        setState(() {
                          _aceitouTermos = valor ?? false;

                          if (_aceitouTermos) {
                            _erroTermos = false;
                          }

                          _erro = null;
                        });
                      },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _alternarTermos,
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text.rich(
                    TextSpan(
                      style: TextStyle(
                        color: _textoSecundario,
                        fontSize: 12,
                        height: 1.6,
                      ),
                      children: [
                        const TextSpan(text: 'Li e aceito os '),
                        TextSpan(
                          text: 'Termos de Uso',
                          recognizer: _termosTap,
                          style: estiloLink,
                        ),
                        const TextSpan(text: ' e a '),
                        TextSpan(
                          text: 'Política de Privacidade',
                          recognizer: _privacidadeTap,
                          style: estiloLink,
                        ),
                        const TextSpan(text: ' do Orvix.'),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
        if (_erroTermos)
          const Padding(
            padding: EdgeInsets.only(top: 6, left: 34),
            child: Text(
              'Você precisa aceitar os termos para entrar.',
              style: TextStyle(
                color: Color(0xFFEF4444),
                fontSize: 11,
                height: 1.5,
              ),
            ),
          ),
      ],
    );
  }

  // ============================================================
  // CARTÃO DE LOGIN
  // ============================================================

  Widget _cartaoLogin() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: _painel.withValues(alpha: 0.98),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: _borda),
        boxShadow: [
          BoxShadow(
            color: _temaEscuro
                ? Colors.black.withValues(alpha: 0.20)
                : const Color(0xFF6550A0).withValues(alpha: 0.07),
            blurRadius: 50,
            offset: const Offset(0, 20),
          ),
        ],
      ),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (MediaQuery.sizeOf(context).width < 900) ...[
              _logo(),
              const SizedBox(height: 30),
            ],
            Text(
              'Bem-vindo de volta',
              style: TextStyle(
                color: _texto,
                fontSize: 25,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.6,
              ),
            ),
            const SizedBox(height: 9),
            Text(
              'Entre na sua conta para continuar.',
              style: TextStyle(
                color: _textoSecundario,
                fontSize: 13,
                height: 1.6,
              ),
            ),
            const SizedBox(height: 30),

            _Label('E-mail', cor: _texto),
            const SizedBox(height: 9),
            TextFormField(
              controller: _emailController,
              enabled: !_carregando,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              autocorrect: false,
              autofillHints: const [
                AutofillHints.username,
              ],
              style: TextStyle(
                color: _texto,
                fontSize: 14,
              ),
              decoration: _decoracao(
                hint: 'voce@empresa.com.br',
                icone: Icons.mail_outline_rounded,
              ),
              validator: (valor) {
                final email = valor?.trim() ?? '';

                if (email.isEmpty) {
                  return 'Informe seu e-mail.';
                }

                if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
                    .hasMatch(email)) {
                  return 'Informe um e-mail válido.';
                }

                return null;
              },
              onChanged: (_) {
                if (_erro != null) {
                  setState(() => _erro = null);
                }
              },
            ),

            const SizedBox(height: 22),
            _Label('Senha', cor: _texto),
            const SizedBox(height: 9),
            TextFormField(
              controller: _senhaController,
              enabled: !_carregando,
              obscureText: !_mostrarSenha,
              textInputAction: TextInputAction.done,
              autofillHints: const [
                AutofillHints.password,
              ],
              style: TextStyle(
                color: _texto,
                fontSize: 14,
              ),
              decoration: _decoracao(
                hint: 'Digite sua senha',
                icone: Icons.lock_outline_rounded,
                sufixo: IconButton(
                  tooltip: _mostrarSenha
                      ? 'Ocultar senha'
                      : 'Mostrar senha',
                  onPressed: _carregando
                      ? null
                      : () {
                          setState(() {
                            _mostrarSenha = !_mostrarSenha;
                          });
                        },
                  icon: Icon(
                    _mostrarSenha
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                    color: _textoSecundario,
                    size: 20,
                  ),
                ),
              ),
              validator: (valor) {
                if (valor == null || valor.isEmpty) {
                  return 'Informe sua senha.';
                }

                return null;
              },
              onChanged: (_) {
                if (_erro != null) {
                  setState(() => _erro = null);
                }
              },
              onFieldSubmitted: (_) {
                if (!_carregando) _entrar();
              },
            ),

            const SizedBox(height: 20),
            _campoTermos(),
            const SizedBox(height: 20),

            if (_erro != null) ...[
              _avisoErro(_erro!),
              const SizedBox(height: 18),
            ],

            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _carregando ? null : _entrar,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _roxo,
                  disabledBackgroundColor:
                      _roxo.withValues(alpha: 0.55),
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(13),
                  ),
                ),
                child: _carregando
                    ? const SizedBox(
                        width: 23,
                        height: 23,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.3,
                          color: Colors.white,
                        ),
                      )
                    : const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'Entrar na minha conta',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          SizedBox(width: 10),
                          Icon(
                            Icons.arrow_forward_rounded,
                            size: 19,
                          ),
                        ],
                      ),
              ),
            ),

            const SizedBox(height: 24),

            Row(
              children: [
                Expanded(
                  child: Container(
                    height: 1,
                    color: _corDivisor,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Text(
                    'ORVIX',
                    style: TextStyle(
                      color: _textoSecundario,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 2,
                    ),
                  ),
                ),
                Expanded(
                  child: Container(
                    height: 1,
                    color: _corDivisor,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 18),
            Center(
              child: Text(
                'Acesse com as credenciais da sua empresa.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: _textoSecundario,
                  fontSize: 12,
                  height: 1.6,
                ),
              ),
            ),

            const SizedBox(height: 18),
            Center(
              child: Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    'Ainda não tem uma conta?',
                    style: TextStyle(
                      color: _textoSecundario,
                      fontSize: 12,
                    ),
                  ),
                  TextButton(
                    onPressed: _carregando ? null : _abrirCadastro,
                    style: TextButton.styleFrom(
                      foregroundColor: _corBotoesSecundarios,
                    ),
                    child: const Text(
                      'Criar conta',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ============================================================
  // DECORAÇÃO DOS CAMPOS
  // ============================================================

  InputDecoration _decoracao({
    required String hint,
    required IconData icone,
    Widget? sufixo,
  }) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(
        color: _temaEscuro
            ? const Color(0xFF68758E)
            : const Color(0xFF9992AB),
        fontSize: 13,
      ),
      prefixIcon: Icon(
        icone,
        color: _textoSecundario,
        size: 20,
      ),
      suffixIcon: sufixo,
      filled: true,
      fillColor: _fundoCampo,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 15,
        vertical: 17,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: _borda),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: _borda),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(
          color: _roxo,
          width: 1.5,
        ),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(
          color: Color(0xFFEF4444),
        ),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(
          color: Color(0xFFEF4444),
          width: 1.3,
        ),
      ),
      errorStyle: const TextStyle(
        color: Color(0xFFDC2626),
        fontSize: 11,
        height: 1.5,
      ),
    );
  }

  // ============================================================
  // AVISO DE ERRO
  // ============================================================

  Widget _avisoErro(String mensagem) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xFFEF4444).withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(
          color: const Color(0xFFEF4444).withValues(alpha: 0.30),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.error_outline_rounded,
            color: Color(0xFFEF4444),
            size: 19,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              mensagem,
              style: TextStyle(
                color: _temaEscuro
                    ? const Color(0xFFFCA5A5)
                    : const Color(0xFFB91C1C),
                fontSize: 12,
                height: 1.6,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ============================================================
  // RODAPÉ
  // ============================================================

  Widget _rodape() {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.lock_outline_rounded,
              size: 13,
              color: _textoSecundario,
            ),
            const SizedBox(width: 7),
            Text(
              'Acesso protegido',
              style: TextStyle(
                color: _textoSecundario,
                fontSize: 11,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          'Orvix © 2026 · Gestão para sua empresa',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: _temaEscuro
                ? const Color(0xFF66728A)
                : const Color(0xFF8A849B),
            fontSize: 11,
          ),
        ),
      ],
    );
  }
}

// ============================================================
// LABEL DOS CAMPOS
// ============================================================

class _Label extends StatelessWidget {
  final String texto;
  final Color cor;

  const _Label(
    this.texto, {
    required this.cor,
  });

  @override
  Widget build(BuildContext context) {
    return Text(
      texto,
      style: TextStyle(
        color: cor,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}

// ============================================================
// EFEITO DE LUZ DO FUNDO
// ============================================================

class _Glow extends StatelessWidget {
  final Color cor;
  final double tamanho;
  final double opacidade;

  const _Glow({
    required this.cor,
    required this.tamanho,
    this.opacidade = 0.055,
  });

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: tamanho,
        height: tamanho,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: cor.withValues(alpha: opacidade),
        ),
      ),
    );
  }
}
