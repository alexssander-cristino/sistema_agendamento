
import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../auth/auth_service.dart';
import '../auth/login_page.dart';
import 'checkout_cartao_page.dart';

class PlanosPage extends StatefulWidget {
  const PlanosPage({super.key});

  @override
  State<PlanosPage> createState() => _PlanosPageState();
}

class _PlanosPageState extends State<PlanosPage> {
  List<Map<String, dynamic>> _planos = [];
  String? _planoSelecionadoId;
  bool _carregando = true;
  bool _enviando = false;
  bool _saindo = false;
  String? _erro;

  static const Color _primaria = Color(0xFF6558D3);
  static const Color _fundo = Color(0xFFF7F7FC);

  @override
  void initState() {
    super.initState();
    _carregarPlanos();
  }

  Future<void> _carregarPlanos() async {
    if (mounted) {
      setState(() {
        _carregando = true;
        _erro = null;
      });
    }

    try {
      final resposta = await ApiClient.getList(
        '/planos/disponiveis',
      );

      final planos = resposta
          .whereType<Map>()
          .map((plano) => Map<String, dynamic>.from(plano))
          .where((plano) => plano['id'] != null)
          .toList();

      if (!mounted) return;

      setState(() {
        _planos = planos;
        _carregando = false;

        if (_planos.isNotEmpty) {
          final existeSelecionado = _planos.any(
            (plano) =>
                plano['id'].toString() == _planoSelecionadoId,
          );

          if (!existeSelecionado) {
            _planoSelecionadoId = _planos.first['id'].toString();
          }
        } else {
          _planoSelecionadoId = null;
        }
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _carregando = false;
        _erro = e is ApiException
            ? e.message
            : 'Não foi possível carregar os planos. Tente novamente.';
      });
    }
  }

  Future<void> _sairDaConta() async {
    if (_saindo) return;

    final confirmar = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          icon: const Icon(
            Icons.logout_rounded,
            color: _primaria,
            size: 34,
          ),
          title: const Text(
            'Sair da conta?',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Color(0xFF28263F),
              fontWeight: FontWeight.w800,
            ),
          ),
          content: const Text(
            'Você precisará entrar novamente para acessar sua conta.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Color(0xFF77768D),
              height: 1.5,
            ),
          ),
          actionsAlignment: MainAxisAlignment.center,
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text(
                'Cancelar',
                style: TextStyle(
                  color: Color(0xFF77768D),
                ),
              ),
            ),
            FilledButton.icon(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              icon: const Icon(Icons.logout_rounded, size: 17),
              label: const Text('Sair da conta'),
              style: FilledButton.styleFrom(
                backgroundColor: _primaria,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        );
      },
    );

    if (confirmar != true || !mounted) return;

    setState(() => _saindo = true);

    try {
      await AuthService.logout();
    } catch (_) {
      // O AuthService deve limpar a sessão local mesmo se
      // a chamada de encerramento no servidor falhar.
    }

    if (!mounted) return;

    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => const LoginPage(),
      ),
      (route) => false,
    );
  }

  String _texto(dynamic valor, {String padrao = ''}) {
    if (valor == null) return padrao;

    final texto = valor.toString().trim();
    return texto.isEmpty ? padrao : texto;
  }

  double _valorPlano(Map<String, dynamic> plano) {
    final valor = plano['valor'];

    if (valor is num) return valor.toDouble();

    final texto = valor
        ?.toString()
        .replaceAll('R\$', '')
        .replaceAll(' ', '')
        .trim();

    if (texto == null || texto.isEmpty) return 0;

    final normalizado = texto.contains(',')
        ? texto.replaceAll('.', '').replaceAll(',', '.')
        : texto;

    return double.tryParse(normalizado) ?? 0;
  }

  String _moeda(double valor) {
    final partes = valor.toStringAsFixed(2).split('.');
    final inteiro = partes[0];
    final resultado = StringBuffer();

    for (var i = 0; i < inteiro.length; i++) {
      resultado.write(inteiro[i]);

      final restantes = inteiro.length - i - 1;

      if (restantes > 0 && restantes % 3 == 0) {
        resultado.write('.');
      }
    }

    return 'R\$ ${resultado.toString()},${partes[1]}';
  }

  String _periodo(dynamic periodo) {
    final valor = _texto(periodo).toLowerCase();

    switch (valor) {
      case 'mensal':
      case 'month':
      case 'monthly':
        return '/mês';
      case 'anual':
      case 'year':
      case 'yearly':
        return '/ano';
      case 'semanal':
      case 'week':
      case 'weekly':
        return '/semana';
      case 'diario':
      case 'dia':
      case 'day':
      case 'daily':
        return '/dia';
      default:
        return valor.isEmpty ? '' : '/$valor';
    }
  }

  bool _planoPopular(Map<String, dynamic> plano) {
    final nome = _texto(plano['nome']).toLowerCase();

    return nome.contains('pro') ||
        nome.contains('profissional');
  }

  Future<void> _continuar() async {
    if (_enviando || _carregando || _saindo) return;

    Map<String, dynamic>? selecionado;

    for (final plano in _planos) {
      if (plano['id'].toString() == _planoSelecionadoId) {
        selecionado = plano;
        break;
      }
    }

    if (selecionado == null) {
      _mensagem('Selecione um plano para continuar.');
      return;
    }

    if (_valorPlano(selecionado) <= 0) {
      _mensagem(
        'Este plano possui um valor inválido. '
        'Entre em contato com o suporte.',
      );
      return;
    }

    setState(() => _enviando = true);

    try {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => CheckoutCartaoPage(
            plano: Map<String, dynamic>.from(selecionado!),
          ),
        ),
      );
    } catch (_) {
      if (mounted) {
        _mensagem(
          'Não foi possível abrir a tela de pagamento.',
        );
      }
    } finally {
      if (mounted) {
        setState(() => _enviando = false);
      }
    }
  }

  void _mensagem(String mensagem) {
    if (!mounted) return;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(mensagem),
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _fundo,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1100),
            child: Column(
              children: [
                _cabecalho(),
                Expanded(
                  child: _conteudo(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _cabecalho() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 22, 24, 12),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: _primaria,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(
              Icons.grid_view_rounded,
              color: Colors.white,
              size: 25,
            ),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Orvix',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF22213A),
                    letterSpacing: -0.6,
                  ),
                ),
                Text(
                  'Planos e assinatura',
                  style: TextStyle(
                    fontSize: 12,
                    color: Color(0xFF77768D),
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Atualizar planos',
            onPressed: _carregando || _enviando || _saindo
                ? null
                : _carregarPlanos,
            icon: const Icon(
              Icons.refresh_rounded,
              color: Color(0xFF77768D),
            ),
          ),
          const SizedBox(width: 4),
          OutlinedButton.icon(
            onPressed: _saindo ? null : _sairDaConta,
            icon: _saindo
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: _primaria,
                    ),
                  )
                : const Icon(
                    Icons.logout_rounded,
                    size: 17,
                  ),
            label: Text(_saindo ? 'Saindo...' : 'Sair'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF6558D3),
              side: const BorderSide(
                color: Color(0xFFE0DDF5),
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              padding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _conteudo() {
    if (_carregando) {
      return const Center(
        child: CircularProgressIndicator(
          color: _primaria,
        ),
      );
    }

    if (_erro != null) {
      return _estadoErro();
    }

    if (_planos.isEmpty) {
      return _estadoVazio();
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final largura = constraints.maxWidth;

        final colunas = largura >= 850
            ? 3
            : largura >= 560
                ? 2
                : 1;

        final larguraCartao =
            (largura - (colunas - 1) * 16) / colunas;

        return Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  20,
                  20,
                  20,
                  24,
                ),
                child: Column(
                  children: [
                    const Icon(
                      Icons.workspace_premium_rounded,
                      size: 42,
                      color: _primaria,
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Escolha o plano ideal',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 29,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF24223D),
                        letterSpacing: -0.8,
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Selecione um plano para começar a utilizar '
                      'os recursos do Orvix.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.5,
                        color: Color(0xFF77768D),
                      ),
                    ),
                    const SizedBox(height: 28),
                    Wrap(
                      spacing: 16,
                      runSpacing: 16,
                      alignment: WrapAlignment.center,
                      children: _planos.map((plano) {
                        return SizedBox(
                          width: larguraCartao,
                          child: _cartaoPlano(plano),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 24),
                    const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.lock_outline_rounded,
                          size: 16,
                          color: Color(0xFF77768D),
                        ),
                        SizedBox(width: 7),
                        Flexible(
                          child: Text(
                            'Pagamento processado com segurança.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 12,
                              color: Color(0xFF77768D),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            _rodape(),
          ],
        );
      },
    );
  }

  Widget _cartaoPlano(Map<String, dynamic> plano) {
    final id = plano['id'].toString();
    final selecionado = id == _planoSelecionadoId;
    final popular = _planoPopular(plano);
    final nome = _texto(plano['nome'], padrao: 'Plano');
    final descricao = _texto(
      plano['descricao'],
      padrao: 'Acesso aos recursos disponíveis deste plano.',
    );
    final valor = _valorPlano(plano);
    final periodo = _periodo(plano['periodo']);

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: _enviando || _saindo
            ? null
            : () {
                setState(() => _planoSelecionadoId = id);
              },
        borderRadius: BorderRadius.circular(20),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selecionado
                  ? _primaria
                  : const Color(0xFFE8E7F1),
              width: selecionado ? 2 : 1,
            ),
            boxShadow: selecionado
                ? [
                    BoxShadow(
                      color: _primaria.withValues(alpha: 0.08),
                      blurRadius: 22,
                      offset: const Offset(0, 7),
                    ),
                  ]
                : [],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      nome,
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF28263F),
                      ),
                    ),
                  ),
                  if (selecionado)
                    const Icon(
                      Icons.check_circle_rounded,
                      color: _primaria,
                      size: 23,
                    ),
                ],
              ),
              if (popular) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0EDFF),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'POPULAR',
                    style: TextStyle(
                      color: _primaria,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.7,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 14),
              Text(
                descricao,
                style: const TextStyle(
                  fontSize: 13,
                  height: 1.6,
                  color: Color(0xFF77768D),
                ),
              ),
              const SizedBox(height: 24),
              Wrap(
                crossAxisAlignment: WrapCrossAlignment.end,
                children: [
                  Text(
                    _moeda(valor),
                    style: const TextStyle(
                      fontSize: 27,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF28263F),
                      letterSpacing: -0.8,
                    ),
                  ),
                  if (periodo.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(
                        left: 4,
                        bottom: 4,
                      ),
                      child: Text(
                        periodo,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF77768D),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 22),
              Divider(
                color: Colors.grey.shade200,
                height: 1,
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Icon(
                    selecionado
                        ? Icons.radio_button_checked_rounded
                        : Icons.radio_button_unchecked_rounded,
                    color: selecionado
                        ? _primaria
                        : const Color(0xFFB5B3C8),
                    size: 20,
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      selecionado
                          ? 'Plano selecionado'
                          : 'Selecionar este plano',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: selecionado
                            ? FontWeight.w700
                            : FontWeight.w500,
                        color: selecionado
                            ? _primaria
                            : const Color(0xFF77768D),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _rodape() {
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 16, 22, 20),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(color: Color(0xFFE8E7F1)),
        ),
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 500),
          child: SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton(
              onPressed: _enviando || _carregando || _saindo
                  ? null
                  : _continuar,
              style: ElevatedButton.styleFrom(
                backgroundColor: _primaria,
                foregroundColor: Colors.white,
                disabledBackgroundColor:
                    _primaria.withValues(alpha: 0.5),
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(15),
                ),
              ),
              child: _enviando
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          'Continuar para pagamento',
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
        ),
      ),
    );
  }

  Widget _estadoErro() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.cloud_off_rounded,
              color: _primaria,
              size: 48,
            ),
            const SizedBox(height: 16),
            const Text(
              'Não foi possível carregar os planos',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w800,
                color: Color(0xFF28263F),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _erro ?? 'Ocorreu um erro inesperado.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Color(0xFF77768D),
                height: 1.5,
              ),
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: _carregarPlanos,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Tentar novamente'),
              style: ElevatedButton.styleFrom(
                backgroundColor: _primaria,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _estadoVazio() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.inventory_2_outlined,
              color: _primaria,
              size: 48,
            ),
            const SizedBox(height: 16),
            const Text(
              'Nenhum plano disponível',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w800,
                color: Color(0xFF28263F),
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Ainda não existem planos disponíveis para assinatura. '
              'Tente novamente mais tarde.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFF77768D),
                height: 1.5,
              ),
            ),
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: _carregarPlanos,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Atualizar'),
            ),
          ],
        ),
      ),
    );
  }
}
