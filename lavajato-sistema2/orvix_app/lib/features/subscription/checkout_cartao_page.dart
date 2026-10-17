import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/network/api_client.dart';
import '../dashboard/dashboard_page.dart';

class CheckoutCartaoPage extends StatefulWidget {
  const CheckoutCartaoPage({
    super.key,
    required this.plano,
  });

  final Map<String, dynamic> plano;

  @override
  State<CheckoutCartaoPage> createState() =>
      _CheckoutCartaoPageState();
}

class _CheckoutCartaoPageState extends State<CheckoutCartaoPage> {
  static const Color _roxo = Color(0xFF7965D8);
  static const Color _roxoEscuro = Color(0xFF5945B5);
  static const Color _verde = Color(0xFF16865B);

  // Origem usada pelo WebView ao carregar o HTML do formulário.
  static const String _baseUrlCheckout = 'https://www.mercadopago.com.br';

  WebViewController? _webViewController;

  bool _carregando = false;
  bool _processando = false;
  String? _erro;
  String _publicKey = '';

  double get _valor {
    final valor = widget.plano['valor']
        ?.toString()
        .trim()
        .replaceAll(',', '.');

    return double.tryParse(valor ?? '') ?? 0;
  }

  String get _valorFormatado =>
      _valor.toStringAsFixed(2).replaceAll('.', ',');

  String get _nomePlano =>
      widget.plano['nome']?.toString() ?? 'Plano Orvix';

  String get _periodo =>
      widget.plano['periodo']?.toString() ?? 'mês';

  @override
  void initState() {
    super.initState();

    if (kIsWeb) return;

    _inicializarWebView();
  }

  void _inicializarWebView() {
    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF8F7FC))
      ..addJavaScriptChannel(
        'PaymentBridge',
        onMessageReceived: (message) {
          _receberMensagem(message.message);
        },
      );

    _webViewController = controller;
    _inicializarPagamento();
  }

  Future<void> _inicializarPagamento() async {
    if (kIsWeb) return;

    final controller = _webViewController;

    if (controller == null) {
      _mostrarErro('Não foi possível inicializar o checkout.');
      return;
    }

    setState(() {
      _carregando = true;
      _erro = null;
    });

    try {
      if (_valor <= 0) {
        throw const ApiException(
          'O plano selecionado possui um valor inválido.',
        );
      }

      final resposta = await ApiClient.get(
        '/mercado-pago/public-key',
      );

      final chave = resposta['public_key']?.toString().trim();

      if (chave == null || chave.isEmpty) {
        throw const ApiException(
          'A chave pública do Mercado Pago não foi configurada.',
        );
      }

      _publicKey = chave;

      await controller.loadHtmlString(
        _construirFormulario(
          publicKey: chave,
          amount: _valor.toStringAsFixed(2),
        ),
        baseUrl: _baseUrlCheckout,
      );

      if (!mounted) return;

      setState(() {
        _carregando = false;
        _erro = null;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _carregando = false;
        _erro = e is ApiException
            ? e.message
            : 'Não foi possível carregar o formulário de pagamento.';
      });
    }
  }

  /// Recarrega apenas o formulário do WebView, mantendo a mensagem de erro
  /// na tela. Necessário porque o token do cartão é de uso único: após uma
  /// falha, o usuário precisa de um formulário novo para tentar de novo.
  Future<void> _recarregarFormulario() async {
    final controller = _webViewController;

    if (controller == null || _publicKey.isEmpty) return;

    await controller.loadHtmlString(
      _construirFormulario(
        publicKey: _publicKey,
        amount: _valor.toStringAsFixed(2),
      ),
      baseUrl: _baseUrlCheckout,
    );
  }

  String _construirFormulario({
    required String publicKey,
    required String amount,
  }) {
    final chaveSegura = jsonEncode(publicKey);
    final valorSeguro = jsonEncode(amount);

    return '''
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport"
        content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Checkout Orvix</title>

  <script src="https://sdk.mercadopago.com/js/v2"></script>

  <style>
    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      margin: 0;
      padding: 4px 0 20px;
      background: #f8f7fc;
      color: #24213a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                   Roboto, Arial, sans-serif;
      font-size: 14px;
    }

    form {
      width: 100%;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 20px;
    }

    .section-icon {
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border-radius: 12px;
      background: #eee9ff;
      color: #7058cf;
      font-size: 19px;
      font-weight: 800;
    }

    .section-heading {
      margin: 0;
      color: #24213a;
      font-size: 17px;
      font-weight: 750;
    }

    .section-description {
      margin: 5px 0 0;
      color: #77738c;
      font-size: 12px;
      line-height: 1.5;
    }

    .campo {
      margin-bottom: 17px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      color: #38344d;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .1px;
    }

    input, select {
      width: 100%;
      min-height: 48px;
      padding: 12px 13px;
      border: 1px solid #e0ddec;
      border-radius: 11px;
      background: #ffffff;
      color: #24213a;
      font-family: inherit;
      font-size: 14px;
      outline: none;
      transition: border-color .18s, box-shadow .18s;
    }

    input::placeholder {
      color: #aaa6b9;
    }

    input:focus, select:focus {
      border-color: #7965d8;
      box-shadow: 0 0 0 3px rgba(121, 101, 216, .12);
    }

    #form-checkout__cardNumber,
    #form-checkout__expirationDate,
    #form-checkout__securityCode {
      display: flex;
      align-items: center;
      width: 100%;
      min-height: 48px;
      padding: 0 12px;
      overflow: hidden;
      border: 1px solid #e0ddec;
      border-radius: 11px;
      background: #ffffff;
    }

    #form-checkout__cardNumber iframe,
    #form-checkout__expirationDate iframe,
    #form-checkout__securityCode iframe {
      width: 100%;
      min-height: 44px;
      border: 0;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
    }

    .grid .campo {
      min-width: 0;
    }

    .mensagem {
      display: none;
      margin: 12px 0;
      padding: 12px 13px;
      border: 1px solid #f4c7c7;
      border-radius: 11px;
      background: #fff1f1;
      color: #a12727;
      font-size: 12px;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }

    .mensagem.visivel {
      display: block;
    }

    button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      width: 100%;
      min-height: 52px;
      padding: 14px 16px;
      border: 0;
      border-radius: 13px;
      background: linear-gradient(135deg, #8570e5, #6953c6);
      color: #ffffff;
      font-family: inherit;
      font-size: 14px;
      font-weight: 750;
      letter-spacing: .1px;
      cursor: pointer;
      box-shadow: 0 5px 13px rgba(105, 83, 198, .2);
      transition: opacity .2s;
    }

    button:disabled {
      opacity: .58;
      cursor: wait;
      box-shadow: none;
    }

    .security {
      display: flex;
      align-items: flex-start;
      gap: 11px;
      margin-top: 17px;
      padding: 14px;
      border: 1px solid #dcefe5;
      border-radius: 12px;
      background: #f0faf5;
    }

    .security-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: #d9f3e5;
      color: #16865b;
      font-size: 16px;
      font-weight: 800;
    }

    .security-title {
      margin: 0 0 4px;
      color: #226347;
      font-size: 12px;
      font-weight: 750;
    }

    .security-description {
      margin: 0;
      color: #527866;
      font-size: 11px;
      line-height: 1.55;
    }

    .footer {
      margin: 15px 0 0;
      color: #9994aa;
      text-align: center;
      font-size: 11px;
      line-height: 1.6;
    }

    @media (max-width: 340px) {
      .grid {
        grid-template-columns: minmax(0, 1fr);
        gap: 0;
      }
    }
  </style>
</head>

<body>
  <div class="section-title">
    <div class="section-icon">✦</div>
    <div>
      <h2 class="section-heading">Dados do pagamento</h2>
      <p class="section-description">
        Preencha os dados para ativar sua assinatura.
      </p>
    </div>
  </div>

  <form id="form-checkout">
    <div class="campo">
      <label for="form-checkout__cardholderName">
        Nome impresso no cartão
      </label>
      <input
        id="form-checkout__cardholderName"
        autocomplete="cc-name"
        placeholder="Nome completo do titular"
        required>
    </div>

    <div class="campo">
      <label for="form-checkout__cardNumber">
        Número do cartão
      </label>
      <div id="form-checkout__cardNumber"></div>
    </div>

    <div class="grid">
      <div class="campo">
        <label for="form-checkout__expirationDate">
          Validade
        </label>
        <div id="form-checkout__expirationDate"></div>
      </div>

      <div class="campo">
        <label for="form-checkout__securityCode">
          Código de segurança
        </label>
        <div id="form-checkout__securityCode"></div>
      </div>
    </div>

    <div class="campo">
      <label for="form-checkout__issuer">Banco emissor</label>
      <select id="form-checkout__issuer"></select>
    </div>

    <div class="campo">
      <label for="form-checkout__installments">Parcelas</label>
      <select id="form-checkout__installments"></select>
    </div>

    <div class="campo">
      <label for="form-checkout__identificationType">
        Tipo de documento
      </label>
      <select id="form-checkout__identificationType"></select>
    </div>

    <div class="campo">
      <label for="form-checkout__identificationNumber">
        CPF ou documento
      </label>
      <input
        id="form-checkout__identificationNumber"
        autocomplete="off"
        inputmode="numeric"
        placeholder="Número do documento">
    </div>

    <div class="campo">
      <label for="form-checkout__cardholderEmail">
        E-mail do titular
      </label>
      <input
        id="form-checkout__cardholderEmail"
        type="email"
        autocomplete="email"
        placeholder="voce@exemplo.com"
        required>
    </div>

    <p id="mensagem" class="mensagem" role="alert"></p>

    <button type="submit" id="botao-pagar" disabled>
      Carregando formulário...
    </button>

    <div class="security">
      <div class="security-icon">✓</div>
      <div>
        <p class="security-title">Pagamento protegido</p>
        <p class="security-description">
          Os dados sensíveis do cartão são capturados pelo
          Mercado Pago e não precisam ser enviados diretamente
          ao servidor Orvix.
        </p>
      </div>
    </div>

    <p class="footer">
      Ao continuar, você solicita a contratação do plano selecionado.
    </p>
  </form>

  <script>
    const publicKey = $chaveSegura;
    const amount = $valorSeguro;

    const mensagem = document.getElementById('mensagem');
    const botao = document.getElementById('botao-pagar');

    function mostrarErro(texto) {
      mensagem.textContent = texto;
      mensagem.classList.toggle('visivel', Boolean(texto));
    }

    try {
      const mp = new MercadoPago(publicKey, {
        locale: 'pt-BR'
      });

      const cardForm = mp.cardForm({
        amount: amount,
        iframe: true,
        form: {
          id: 'form-checkout',
          cardNumber: {
            id: 'form-checkout__cardNumber',
            placeholder: '0000 0000 0000 0000'
          },
          expirationDate: {
            id: 'form-checkout__expirationDate',
            placeholder: 'MM/AA'
          },
          securityCode: {
            id: 'form-checkout__securityCode',
            placeholder: 'CVV'
          },
          cardholderName: {
            id: 'form-checkout__cardholderName',
            placeholder: 'Nome completo'
          },
          issuer: {
            id: 'form-checkout__issuer',
            placeholder: 'Selecione o banco'
          },
          installments: {
            id: 'form-checkout__installments',
            placeholder: 'Selecione as parcelas'
          },
          identificationType: {
            id: 'form-checkout__identificationType',
            placeholder: 'Tipo de documento'
          },
          identificationNumber: {
            id: 'form-checkout__identificationNumber',
            placeholder: 'CPF'
          },
          cardholderEmail: {
            id: 'form-checkout__cardholderEmail',
            placeholder: 'voce@exemplo.com'
          }
        },
        callbacks: {
          onFormMounted: function(error) {
            if (error) {
              mostrarErro(
                'Não foi possível carregar os campos do cartão. Tente novamente.'
              );
              return;
            }

            botao.disabled = false;
            botao.textContent = 'Confirmar assinatura';
          },

          onSubmit: function(event) {
            event.preventDefault();

            try {
              const dados = cardForm.getCardFormData();

              if (!dados || !dados.token) {
                mostrarErro(
                  'Não foi possível validar o cartão. Confira os dados.'
                );
                return;
              }

              botao.disabled = true;
              botao.textContent = 'Processando pagamento...';
              mostrarErro('');

              PaymentBridge.postMessage(JSON.stringify({
                type: 'submit',
                card_token_id: dados.token,
                email: dados.cardholderEmail,
                nome: dados.cardholderName
              }));
            } catch (error) {
              mostrarErro(
                'Não foi possível preparar o pagamento. Confira os dados.'
              );
              botao.disabled = false;
              botao.textContent = 'Confirmar assinatura';
            }
          }
        }
      });
    } catch (error) {
      mostrarErro(
        'Erro ao iniciar o Mercado Pago. Verifique sua conexão e tente novamente.'
      );
    }
  </script>
</body>
</html>
''';
  }

  Future<void> _receberMensagem(String mensagem) async {
    if (_processando) return;

    try {
      final decoded = jsonDecode(mensagem);

      if (decoded is! Map) return;
      if (decoded['type'] != 'submit') return;

      final token = decoded['card_token_id']?.toString();
      final email = decoded['email']?.toString().trim();
      final nome = decoded['nome']?.toString().trim();

      if (token == null ||
          token.isEmpty ||
          email == null ||
          email.isEmpty ||
          nome == null ||
          nome.isEmpty) {
        _mostrarErro('Confira os dados do cartão e do titular.');
        await _recarregarFormulario();
        return;
      }

      await _enviarAssinatura(
        token: token,
        email: email,
        nome: nome,
      );
    } on FormatException {
      _mostrarErro('O formulário retornou uma resposta inválida.');
    }
  }

  Future<void> _enviarAssinatura({
    required String token,
    required String email,
    required String nome,
  }) async {
    if (_processando) return;

    setState(() {
      _processando = true;
      _erro = null;
    });

    try {
      final resposta = await ApiClient.post(
        '/mercado-pago/assinaturas',
        {
          'plano_id': widget.plano['id'],
          'email': email,
          'nome': nome,
          'card_token_id': token,
        },
      );

      if (!mounted) return;

      final assinatura = resposta['assinatura'];
      final status = assinatura is Map
          ? assinatura['status']?.toString().toLowerCase()
          : null;

      if (status == 'ativa') {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Assinatura ativada com sucesso.'),
            backgroundColor: _verde,
          ),
        );

        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute<void>(
            builder: (_) => const DashboardPage(),
          ),
          (route) => false,
        );

        return;
      }

      // Assinatura recebida mas ainda não ativa (ex.: em processamento).
      // O formulário NÃO é recarregado para evitar cobrança duplicada.
      final mensagemResposta =
          resposta['mensagem']?.toString() ??
          'A solicitação foi recebida, mas a assinatura ainda não está ativa.';

      setState(() {
        _erro =
            '$mensagemResposta Status: ${status ?? 'em processamento'}.';
      });
    } on ApiException catch (e) {
      if (!mounted) return;

      setState(() {
        _erro = e.message;
      });

      // O servidor recusou a solicitação (ex.: cartão recusado). O token do
      // cartão é de uso único, então recarregamos o formulário para o usuário
      // poder tentar novamente.
      await _recarregarFormulario();
    } catch (_) {
      if (!mounted) return;

      // Falha de rede/timeout: não sabemos se o servidor processou o pedido,
      // então o formulário não é recarregado para evitar cobrança duplicada.
      setState(() {
        _erro =
            'Não foi possível confirmar a solicitação. Verifique sua '
            'conexão e confira em seu perfil se a assinatura foi ativada '
            'antes de tentar novamente.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _processando = false;
        });
      }
    }
  }

  void _mostrarErro(String mensagem) {
    if (!mounted) return;

    setState(() {
      _erro = mensagem;
    });
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final cores = tema.colorScheme;

    return Scaffold(
      backgroundColor: tema.scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text(
          'Finalizar assinatura',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w700,
          ),
        ),
        centerTitle: false,
        backgroundColor: tema.scaffoldBackgroundColor,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 600),
            child: ListView(
              keyboardDismissBehavior:
                  ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                _buildCabecalho(tema),
                const SizedBox(height: 22),
                _buildResumoPlano(tema),
                const SizedBox(height: 26),
                Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: _roxo.withValues(alpha: 0.11),
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: const Icon(
                        Icons.credit_card_rounded,
                        color: _roxo,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Dados do cartão',
                            style: tema.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'Preencha os dados para continuar.',
                            style: tema.textTheme.bodySmall?.copyWith(
                              color: cores.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
                  decoration: BoxDecoration(
                    color: tema.cardColor,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: tema.dividerColor.withValues(alpha: 0.55),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(
                          alpha: tema.brightness == Brightness.dark
                              ? 0.08
                              : 0.035,
                        ),
                        blurRadius: 20,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      if (kIsWeb)
                        _buildAvisoWeb(tema)
                      else
                        _buildFormularioNativo(),
                      if (_erro != null && !kIsWeb) ...[
                        const SizedBox(height: 14),
                        _buildErro(tema),
                      ],
                      if (_processando) ...[
                        const SizedBox(height: 20),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: const LinearProgressIndicator(
                            color: _roxo,
                            minHeight: 4,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Enviando solicitação de assinatura...',
                          textAlign: TextAlign.center,
                          style: tema.textTheme.bodySmall?.copyWith(
                            color: cores.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                _buildSeguranca(tema),
                const SizedBox(height: 22),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.lock_outline_rounded,
                      size: 15,
                      color: cores.onSurfaceVariant,
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        'Pagamento processado pelo Mercado Pago',
                        textAlign: TextAlign.center,
                        style: tema.textTheme.bodySmall?.copyWith(
                          color: cores.onSurfaceVariant,
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCabecalho(ThemeData tema) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [_roxo, _roxoEscuro],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: _roxo.withValues(alpha: 0.23),
            blurRadius: 22,
            offset: const Offset(0, 9),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            right: -22,
            top: -28,
            child: Container(
              width: 115,
              height: 115,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.07),
              ),
            ),
          ),
          Positioned(
            right: 25,
            bottom: -42,
            child: Container(
              width: 85,
              height: 85,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.06),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 39,
                    height: 39,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.17),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.18),
                      ),
                    ),
                    child: const Icon(
                      Icons.auto_awesome_rounded,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Text(
                    'Orvix',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 21,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 7,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(30),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.22),
                      ),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.verified_user_outlined,
                          size: 13,
                          color: Colors.white,
                        ),
                        SizedBox(width: 5),
                        Text(
                          'Seguro',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 25),
              const Text(
                'Seu negócio, no\npróximo nível.',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 25,
                  height: 1.17,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.6,
                ),
              ),
              const SizedBox(height: 9),
              Text(
                'Finalize sua assinatura para liberar os recursos do Orvix.',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.83),
                  fontSize: 13,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildResumoPlano(ThemeData tema) {
    final cores = tema.colorScheme;

    return Container(
      padding: const EdgeInsets.all(19),
      decoration: BoxDecoration(
        color: tema.cardColor,
        borderRadius: BorderRadius.circular(19),
        border: Border.all(
          color: _roxo.withValues(alpha: 0.28),
          width: 1.2,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'RESUMO DA ASSINATURA',
                  style: tema.textTheme.labelSmall?.copyWith(
                    color: cores.onSurfaceVariant,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.1,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 9,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: _roxo.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'SEU PLANO',
                  style: TextStyle(
                    color: _roxo,
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 17),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 49,
                height: 49,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      _roxo.withValues(alpha: 0.16),
                      _roxo.withValues(alpha: 0.07),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: const Icon(
                  Icons.workspace_premium_rounded,
                  color: _roxo,
                  size: 27,
                ),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _nomePlano,
                      style: tema.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Cobrança por $_periodo',
                      style: tema.textTheme.bodySmall?.copyWith(
                        color: cores.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    'R\$ $_valorFormatado',
                    style: tema.textTheme.titleLarge?.copyWith(
                      color: _roxo,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.5,
                    ),
                  ),
                  Text(
                    '/ $_periodo',
                    style: tema.textTheme.bodySmall?.copyWith(
                      color: cores.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 17),
          Divider(
            height: 1,
            color: tema.dividerColor.withValues(alpha: 0.55),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              const Icon(
                Icons.check_circle_rounded,
                color: _verde,
                size: 17,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Plano selecionado para sua empresa',
                  style: tema.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSeguranca(ThemeData tema) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: _verde.withValues(alpha: 0.07),
        border: Border.all(
          color: _verde.withValues(alpha: 0.17),
        ),
        borderRadius: BorderRadius.circular(15),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 37,
            height: 37,
            decoration: BoxDecoration(
              color: _verde.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(11),
            ),
            child: const Icon(
              Icons.shield_outlined,
              color: _verde,
              size: 21,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Seus dados estão protegidos',
                  style: tema.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: tema.brightness == Brightness.dark
                        ? const Color(0xFF83D6AE)
                        : const Color(0xFF216746),
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  'O Mercado Pago processa os dados do cartão. '
                  'A Orvix recebe o token necessário para solicitar '
                  'a assinatura.',
                  style: tema.textTheme.bodySmall?.copyWith(
                    height: 1.5,
                    color: tema.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErro(ThemeData tema) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: tema.colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: tema.colorScheme.error.withValues(alpha: 0.15),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.error_outline_rounded,
            size: 20,
            color: tema.colorScheme.onErrorContainer,
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              _erro!,
              style: TextStyle(
                color: tema.colorScheme.onErrorContainer,
                height: 1.45,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAvisoWeb(ThemeData tema) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: tema.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(
            Icons.credit_card_off_outlined,
            size: 45,
            color: tema.colorScheme.primary,
          ),
          const SizedBox(height: 14),
          Text(
            'Checkout Web não configurado',
            textAlign: TextAlign.center,
            style: tema.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'O formulário atual utiliza WebView, que não funciona '
            'no Chrome. Para pagar pelo navegador, é necessário '
            'integrar o SDK JavaScript do Mercado Pago à versão Web.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back),
            label: const Text('Voltar aos planos'),
          ),
        ],
      ),
    );
  }

  Widget _buildFormularioNativo() {
    final tema = Theme.of(context);

    if (_carregando) {
      return SizedBox(
        height: 340,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: _roxo.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(18),
              ),
              child: const Padding(
                padding: EdgeInsets.all(15),
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: _roxo,
                ),
              ),
            ),
            const SizedBox(height: 18),
            Text(
              'Preparando pagamento',
              style: tema.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Conectando ao Mercado Pago...',
              style: tema.textTheme.bodySmall?.copyWith(
                color: tema.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      );
    }

    if (_erro != null && _publicKey.isEmpty) {
      return SizedBox(
        height: 230,
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.cloud_off_rounded,
                size: 42,
                color: _roxo,
              ),
              const SizedBox(height: 12),
              Text(
                _erro!,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _inicializarPagamento,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Tentar novamente'),
                style: FilledButton.styleFrom(
                  backgroundColor: _roxo,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
      );
    }

    final controller = _webViewController;

    if (controller == null) {
      return const SizedBox(
        height: 180,
        child: Center(
          child: Text('O formulário de pagamento não está disponível.'),
        ),
      );
    }

    return SizedBox(
      height: 700,
      child: WebViewWidget(
        controller: controller,
      ),
    );
  }
}