import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_client.dart';
import '../subscription/planos_page.dart';
import 'auth_service.dart';

class CadastroPage extends StatefulWidget {
  const CadastroPage({super.key});

  @override
  State<CadastroPage> createState() => _CadastroPageState();
}

class _CadastroPageState extends State<CadastroPage> {
  final _formKey = GlobalKey<FormState>();

  final _empresaController = TextEditingController();
  final _emailEmpresaController = TextEditingController();
  final _telefoneController = TextEditingController();
  final _nomeController = TextEditingController();
  final _emailController = TextEditingController();
  final _senhaController = TextEditingController();
  final _confirmarSenhaController = TextEditingController();

  String _nichoSelecionado = 'generico';

  bool _mostrarSenha = false;
  bool _mostrarConfirmacao = false;
  bool _carregando = false;

  // Aceite dos termos
  bool _aceitouTermos = false;
  bool _erroTermos = false;

  String? _erro;

  // TROQUE pelas URLs reais dos seus documentos.
  static const String _urlTermos = 'https://orvix.com.br/termos-de-uso';
  static const String _urlPrivacidade =
      'https://orvix.com.br/politica-de-privacidade';

  late final TapGestureRecognizer _termosTap;
  late final TapGestureRecognizer _privacidadeTap;

  static const Color _fundo = Color(0xFF090D19);
  static const Color _painel = Color(0xFF11182A);
  static const Color _campoFundo = Color(0xFF0B1120);
  static const Color _borda = Color(0xFF263149);
  static const Color _roxo = Color(0xFF8B5CF6);
  static const Color _ciano = Color(0xFF22D3EE);
  static const Color _texto = Color(0xFFF4F6FC);
  static const Color _textoSecundario = Color(0xFF9BA8C0);

  static const List<Map<String, dynamic>> _nichos = [
    {
      'valor': 'lavajato',
      'titulo': 'Lava-jato / Estética automotiva',
      'icone': Icons.directions_car_outlined,
    },
    {
      'valor': 'barbearia',
      'titulo': 'Barbearia / Salão de beleza',
      'icone': Icons.content_cut_rounded,
    },
    {
      'valor': 'clinica',
      'titulo': 'Clínica / Consultório',
      'icone': Icons.medical_services_outlined,
    },
    {
      'valor': 'pet',
      'titulo': 'Pet shop / Veterinária',
      'icone': Icons.pets_outlined,
    },
    {
      'valor': 'oficina',
      'titulo': 'Oficina mecânica',
      'icone': Icons.build_outlined,
    },
    {
      'valor': 'personal',
      'titulo': 'Personal / Aulas / Consultoria',
      'icone': Icons.fitness_center_rounded,
    },
    {
      'valor': 'personalizados',
      'titulo': 'Produtos personalizados',
      'icone': Icons.brush_outlined,
    },
    {
      'valor': 'moveis',
      'titulo': 'Móveis / Marcenaria',
      'icone': Icons.chair_outlined,
    },
    {
      'valor': 'grafica',
      'titulo': 'Gráfica / Comunicação visual',
      'icone': Icons.print_outlined,
    },
    {
      'valor': 'confeccao',
      'titulo': 'Costura / Confecção / Ajustes',
      'icone': Icons.checkroom_outlined,
    },
    {
      'valor': 'eletronicos',
      'titulo': 'Assistência técnica / Eletrônicos',
      'icone': Icons.devices_outlined,
    },
    {
      'valor': 'construcao',
      'titulo': 'Construção / Reformas',
      'icone': Icons.construction_outlined,
    },
    {
      'valor': 'fotografia',
      'titulo': 'Fotografia / Vídeo',
      'icone': Icons.camera_alt_outlined,
    },
    {
      'valor': 'eventos',
      'titulo': 'Eventos / Festas',
      'icone': Icons.celebration_outlined,
    },
    {
      'valor': 'limpeza',
      'titulo': 'Limpeza / Conservação',
      'icone': Icons.cleaning_services_outlined,
    },
    {
      'valor': 'tecnologia',
      'titulo': 'Tecnologia / Desenvolvimento de sistemas',
      'icone': Icons.computer_outlined,
    },
    {
      'valor': 'generico',
      'titulo': 'Outro tipo de negócio',
      'icone': Icons.business_outlined,
    },
  ];

  @override
  void initState() {
    super.initState();

    _termosTap = TapGestureRecognizer()
      ..onTap = () => _abrirLink'https://sistemaagendamento-lavajato-sistema.vercel.app/termos.html';

    _privacidadeTap = TapGestureRecognizer()
      ..onTap = () => _abrirLink'https://sistemaagendamento-lavajato-sistema.vercel.app/politica-de-privacidade.html';
  }

  @override
  void dispose() {
    _termosTap.dispose();
    _privacidadeTap.dispose();
    _empresaController.dispose();
    _emailEmpresaController.dispose();
    _telefoneController.dispose();
    _nomeController.dispose();
    _emailController.dispose();
    _senhaController.dispose();
    _confirmarSenhaController.dispose();
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
        const SnackBar(
          content: Text('Não foi possível abrir o link.'),
        ),
      );
    }
  }

  // ============================================================
  // CADASTRO
  // ============================================================

  Future<void> _cadastrar() async {
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
      await AuthService.cadastrar(
        empresa: _empresaController.text.trim(),
        emailEmpresa: _emailEmpresaController.text.trim(),
        telefone: _telefoneController.text.trim(),
        nome: _nomeController.text.trim(),
        email: _emailController.text.trim(),
        senha: _senhaController.text,
        nicho: _nichoSelecionado,
      );

      if (!mounted) return;

      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(
          builder: (_) => const PlanosPage(),
        ),
        (route) => false,
      );
    } on ApiException catch (e) {
      if (!mounted) return;

      setState(() {
        _erro = e.message;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _erro =
            'Não foi possível concluir o cadastro. '
            'Verifique sua conexão e tente novamente.';
      });
    } finally {
      if (mounted) {
        setState(() => _carregando = false);
      }
    }
  }

  // ============================================================
  // VALIDAÇÕES
  // ============================================================

  String? _validarObrigatorio(
    String? valor, {
    required String mensagem,
  }) {
    if (valor == null || valor.trim().isEmpty) {
      return mensagem;
    }

    return null;
  }

  String? _validarEmail(String? valor) {
    final email = valor?.trim() ?? '';

    if (email.isEmpty) {
      return 'Informe o e-mail.';
    }

    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) {
      return 'Informe um e-mail válido.';
    }

    if (email.length > 254) {
      return 'O e-mail é muito longo.';
    }

    return null;
  }

  String? _validarSenha(String? valor) {
    if (valor == null || valor.isEmpty) {
      return 'Informe uma senha.';
    }

    if (valor.length < 6) {
      return 'A senha deve ter pelo menos 6 caracteres.';
    }

    return null;
  }

  String? _validarConfirmacao(String? valor) {
    if (valor == null || valor.isEmpty) {
      return 'Confirme sua senha.';
    }

    if (valor != _senhaController.text) {
      return 'As senhas não coincidem.';
    }

    return null;
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
      hintStyle: const TextStyle(
        color: Color(0xFF68758E),
        fontSize: 13,
      ),
      prefixIcon: Icon(
        icone,
        color: _textoSecundario,
        size: 20,
      ),
      suffixIcon: sufixo,
      filled: true,
      fillColor: _campoFundo,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 15,
        vertical: 16,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: _borda),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: _borda),
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
          color: Color(0xFFF87171),
        ),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(
          color: Color(0xFFF87171),
          width: 1.5,
        ),
      ),
      errorStyle: const TextStyle(
        fontSize: 11,
        height: 1.5,
      ),
    );
  }

  // ============================================================
  // CAMPO DE TEXTO REUTILIZÁVEL
  // ============================================================

  Widget _campo({
    required String label,
    required String hint,
    required IconData icone,
    required TextEditingController controller,
    required String? Function(String?) validator,
    TextInputType keyboardType = TextInputType.text,
    TextInputAction textInputAction = TextInputAction.next,
    bool obscureText = false,
    Widget? sufixo,
    Iterable<String>? autofillHints,
    void Function(String)? onFieldSubmitted,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Color(0xFFDCE3F2),
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: controller,
          enabled: !_carregando,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          obscureText: obscureText,
          autocorrect: false,
          autofillHints: autofillHints,
          style: const TextStyle(
            color: _texto,
            fontSize: 14,
          ),
          decoration: _decoracao(
            hint: hint,
            icone: icone,
            sufixo: sufixo,
          ),
          validator: validator,
          onFieldSubmitted: onFieldSubmitted,
          onChanged: (_) {
            if (_erro != null) {
              setState(() => _erro = null);
            }
          },
        ),
      ],
    );
  }

  // ============================================================
  // SELETOR DE NICHO
  // ============================================================

  Widget _campoNicho() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Tipo de negócio',
          style: TextStyle(
            color: Color(0xFFDCE3F2),
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: _nichoSelecionado,
          isExpanded: true,
          dropdownColor: _painel,
          iconEnabledColor: _textoSecundario,
          style: const TextStyle(
            color: _texto,
            fontSize: 14,
          ),
          decoration: _decoracao(
            hint: 'Selecione o tipo de negócio',
            icone: Icons.category_outlined,
          ),
          items: _nichos.map((nicho) {
            return DropdownMenuItem<String>(
              value: nicho['valor'] as String,
              child: Row(
                children: [
                  Icon(
                    nicho['icone'] as IconData,
                    size: 19,
                    color: _ciano,
                  ),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Text(
                      nicho['titulo'] as String,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
          onChanged: _carregando
              ? null
              : (valor) {
                  if (valor == null) return;

                  setState(() {
                    _nichoSelecionado = valor;
                    _erro = null;
                  });
                },
          validator: (valor) {
            if (valor == null || valor.isEmpty) {
              return 'Selecione o tipo de negócio.';
            }

            return null;
          },
        ),
        const SizedBox(height: 7),
        const Text(
          'O Orvix utilizará essa escolha para personalizar '
          'a experiência da sua empresa.',
          style: TextStyle(
            color: _textoSecundario,
            fontSize: 11,
            height: 1.5,
          ),
        ),
      ],
    );
  }

  // ============================================================
  // CHECKBOX DE TERMOS E PRIVACIDADE
  // ============================================================

  void _alternarTermos() {
    if (_carregando) return;

    setState(() {
      _aceitouTermos = !_aceitouTermos;
      if (_aceitouTermos) _erroTermos = false;
      _erro = null;
    });
  }

  Widget _campoTermos() {
    const estiloLink = TextStyle(
      color: _ciano,
      fontWeight: FontWeight.w700,
      decoration: TextDecoration.underline,
      decorationColor: _ciano,
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
                      ? const Color(0xFFF87171)
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
                          if (_aceitouTermos) _erroTermos = false;
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
                      style: const TextStyle(
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
              'Você precisa aceitar os termos para criar a conta.',
              style: TextStyle(
                color: Color(0xFFF87171),
                fontSize: 11,
                height: 1.5,
              ),
            ),
          ),
      ],
    );
  }

  // ============================================================
  // TÍTULO DAS SEÇÕES
  // ============================================================

  Widget _tituloSecao(
    String titulo,
    String descricao,
    IconData icone,
  ) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: _roxo.withValues(alpha: 0.13),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(
            icone,
            color: _ciano,
            size: 20,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                titulo,
                style: const TextStyle(
                  color: _texto,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                descricao,
                style: const TextStyle(
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

  Widget _separador() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 25),
      child: Container(
        height: 1,
        color: _borda,
      ),
    );
  }

  // ============================================================
  // MENSAGEM DE ERRO
  // ============================================================

  Widget _mensagemErro() {
    if (_erro == null) {
      return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: const Color(0xFFEF4444).withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(
          color: const Color(0xFFEF4444).withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.error_outline_rounded,
            color: Color(0xFFF87171),
            size: 19,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _erro!,
              style: const TextStyle(
                color: Color(0xFFFCA5A5),
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
  // CABEÇALHO
  // ============================================================

  Widget _cabecalho() {
    return Column(
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(17),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                _roxo,
                Color(0xFF5B4BE7),
              ],
            ),
            boxShadow: [
              BoxShadow(
                color: _roxo.withValues(alpha: 0.22),
                blurRadius: 25,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: const Icon(
            Icons.bolt_rounded,
            color: Colors.white,
            size: 33,
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'Crie sua conta',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: _texto,
            fontSize: 27,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.8,
          ),
        ),
        const SizedBox(height: 9),
        const Text(
          'Comece a organizar sua empresa com o Orvix.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: _textoSecundario,
            fontSize: 13,
            height: 1.7,
          ),
        ),
      ],
    );
  }

  // ============================================================
  // FORMULÁRIO COMPLETO
  // ============================================================

  Widget _formulario() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _tituloSecao(
            'Dados da empresa',
            'Informe os dados principais da sua empresa.',
            Icons.business_outlined,
          ),
          const SizedBox(height: 22),
          _campo(
            label: 'Nome da empresa',
            hint: 'Ex.: Minha Empresa',
            icone: Icons.business_rounded,
            controller: _empresaController,
            validator: (valor) => _validarObrigatorio(
              valor,
              mensagem: 'Informe o nome da empresa.',
            ),
          ),
          const SizedBox(height: 19),
          _campoNicho(),
          const SizedBox(height: 19),
          _campo(
            label: 'E-mail da empresa',
            hint: 'contato@empresa.com.br',
            icone: Icons.business_center_outlined,
            controller: _emailEmpresaController,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            validator: _validarEmail,
          ),
          const SizedBox(height: 19),
          _campo(
            label: 'Telefone',
            hint: '(00) 00000-0000 (opcional)',
            icone: Icons.phone_outlined,
            controller: _telefoneController,
            keyboardType: TextInputType.phone,
            validator: (_) => null,
          ),
          _separador(),
          _tituloSecao(
            'Dados do administrador',
            'Esses dados serão utilizados para acessar o Orvix.',
            Icons.person_outline_rounded,
          ),
          const SizedBox(height: 22),
          _campo(
            label: 'Seu nome completo',
            hint: 'Nome do administrador',
            icone: Icons.person_outline_rounded,
            controller: _nomeController,
            autofillHints: const [AutofillHints.name],
            validator: (valor) => _validarObrigatorio(
              valor,
              mensagem: 'Informe seu nome.',
            ),
          ),
          const SizedBox(height: 19),
          _campo(
            label: 'E-mail de acesso',
            hint: 'voce@empresa.com.br',
            icone: Icons.mail_outline_rounded,
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.username],
            validator: _validarEmail,
          ),
          const SizedBox(height: 19),
          _campo(
            label: 'Senha',
            hint: 'Pelo menos 6 caracteres',
            icone: Icons.lock_outline_rounded,
            controller: _senhaController,
            obscureText: !_mostrarSenha,
            autofillHints: const [AutofillHints.newPassword],
            validator: _validarSenha,
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
          const SizedBox(height: 19),
          _campo(
            label: 'Confirmar senha',
            hint: 'Digite a senha novamente',
            icone: Icons.verified_user_outlined,
            controller: _confirmarSenhaController,
            obscureText: !_mostrarConfirmacao,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.newPassword],
            validator: _validarConfirmacao,
            onFieldSubmitted: (_) {
              if (!_carregando) _cadastrar();
            },
            sufixo: IconButton(
              tooltip: _mostrarConfirmacao
                  ? 'Ocultar senha'
                  : 'Mostrar senha',
              onPressed: _carregando
                  ? null
                  : () {
                      setState(() {
                        _mostrarConfirmacao = !_mostrarConfirmacao;
                      });
                    },
              icon: Icon(
                _mostrarConfirmacao
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                color: _textoSecundario,
                size: 20,
              ),
            ),
          ),
          const SizedBox(height: 22),
          _campoTermos(),
          const SizedBox(height: 25),
          _mensagemErro(),
          if (_erro != null) const SizedBox(height: 17),
          SizedBox(
            width: double.infinity,
            height: 53,
            child: ElevatedButton(
              onPressed: _carregando ? null : _cadastrar,
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
                          'Criar minha conta',
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
          const SizedBox(height: 18),
          const Center(
            child: Text(
              'Seus dados serão utilizados para configurar '
              'o acesso da sua empresa ao Orvix.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: _textoSecundario,
                fontSize: 11,
                height: 1.7,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: TextButton(
              onPressed: _carregando
                  ? null
                  : () => Navigator.of(context).pop(),
              style: TextButton.styleFrom(
                foregroundColor: _ciano,
              ),
              child: const Text(
                'Já tenho uma conta · Voltar ao login',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ============================================================
  // TELA
  // ============================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _fundo,
      appBar: AppBar(
        backgroundColor: _fundo,
        foregroundColor: _texto,
        elevation: 0,
        title: const Text(
          'Cadastro Orvix',
          style: TextStyle(
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: Stack(
        children: [
          const Positioned(
            top: -120,
            right: -100,
            child: _CadastroGlow(
              cor: _roxo,
              tamanho: 280,
            ),
          ),
          const Positioned(
            bottom: -140,
            left: -100,
            child: _CadastroGlow(
              cor: _ciano,
              tamanho: 300,
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 24,
                ),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    maxWidth: 540,
                  ),
                  child: Container(
                    padding: const EdgeInsets.all(26),
                    decoration: BoxDecoration(
                      color: _painel.withValues(alpha: 0.97),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: _borda),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.16),
                          blurRadius: 40,
                          offset: const Offset(0, 18),
                        ),
                      ],
                    ),
                    child: Column(
                      children: [
                        _cabecalho(),
                        const SizedBox(height: 32),
                        _formulario(),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// EFEITO DE LUZ DO FUNDO
// ============================================================

class _CadastroGlow extends StatelessWidget {
  final Color cor;
  final double tamanho;

  const _CadastroGlow({
    required this.cor,
    required this.tamanho,
  });

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: tamanho,
        height: tamanho,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: cor.withValues(alpha: 0.055),
        ),
      ),
    );
  }
}