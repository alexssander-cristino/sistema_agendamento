
import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/orvix_theme_controller.dart';

class ServicosPage extends StatefulWidget {
  const ServicosPage({super.key});

  @override
  State<ServicosPage> createState() => _ServicosPageState();
}

class _ServicosPageState extends State<ServicosPage> {
  static const Color _roxo = Color(0xFF7965D8);
  static const Color _verde = Color(0xFF239B70);
  static const Color _vermelho = Color(0xFFD94F68);

  final TextEditingController _buscaController = TextEditingController();

  List<Map<String, dynamic>> _servicos = [];
  bool _carregando = true;
  bool _excluindo = false;
  String? _erro;

  bool get _temaEscuro => OrvixThemeController.instance.isDark;

  Color get _fundo => _temaEscuro
      ? const Color(0xFF0F1020)
      : const Color(0xFFF6F5FB);

  Color get _painel => _temaEscuro
      ? const Color(0xFF191A30)
      : Colors.white;

  Color get _texto => _temaEscuro
      ? const Color(0xFFF4F3FF)
      : const Color(0xFF242033);

  Color get _secundario => _temaEscuro
      ? const Color(0xFFA6A4C2)
      : const Color(0xFF777187);

  Color get _borda => _temaEscuro
      ? Colors.white.withValues(alpha: 0.07)
      : const Color(0xFFE4E0EF);

  Color get _fundoCampo => _temaEscuro
      ? const Color(0xFF0F1020)
      : const Color(0xFFF8F7FC);

  Color get _fundoEtiqueta => _temaEscuro
      ? Colors.white.withValues(alpha: 0.04)
      : const Color(0xFFF1EFF8);

  @override
  void initState() {
    super.initState();
    OrvixThemeController.instance.addListener(_aoAlterarTema);
    _carregar();
  }

  void _aoAlterarTema() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    OrvixThemeController.instance.removeListener(_aoAlterarTema);
    _buscaController.dispose();
    super.dispose();
  }

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  String _s(dynamic valor, [String padrao = '']) {
    if (valor == null) return padrao;
    return valor.toString();
  }

  int? _id(dynamic valor) {
    if (valor is int) return valor;
    return int.tryParse(valor?.toString() ?? '');
  }

  double _valor(dynamic valor) {
    if (valor is num) return valor.toDouble();

    var texto = valor?.toString().trim() ?? '';
    if (texto.isEmpty) return 0;

    if (texto.contains(',') && texto.contains('.')) {
      texto = texto.replaceAll('.', '').replaceAll(',', '.');
    } else {
      texto = texto.replaceAll(',', '.');
    }

    return double.tryParse(texto) ?? 0;
  }

  String _moeda(num valor) {
    final partes = valor.toStringAsFixed(2).split('.');
    final inteiro = partes[0].replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => '.',
    );
    return 'R\$ $inteiro,${partes[1]}';
  }

  String _duracao(dynamic valor) {
    final minutos = int.tryParse(valor?.toString() ?? '');
    if (minutos == null || minutos <= 0) return '';

    if (minutos < 60) return '$minutos min';

    final horas = minutos ~/ 60;
    final resto = minutos % 60;

    return resto == 0
        ? '${horas}h'
        : '${horas}h${resto.toString().padLeft(2, '0')}';
  }

  void _mensagem(String mensagem) {
    if (!mounted) return;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(mensagem),
          behavior: SnackBarBehavior.floating,
          backgroundColor: _painel,
          showCloseIcon: true,
        ),
      );
  }

  // ============================================================
  // CARREGAMENTO
  // ============================================================

  Future<void> _carregar() async {
    if (mounted) {
      setState(() {
        _carregando = true;
        _erro = null;
      });
    }

    try {
      final lista = await ApiClient.getList('/servicos');

      if (!mounted) return;

      setState(() {
        _servicos = lista
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
        _carregando = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _carregando = false;
        _erro = e is ApiException
            ? e.message
            : 'Não foi possível carregar os serviços.';
      });
    }
  }

  List<Map<String, dynamic>> get _filtrados {
    final busca = _buscaController.text.trim().toLowerCase();

    final lista = _servicos.where((servico) {
      if (busca.isEmpty) return true;
      return _s(servico['nome']).toLowerCase().contains(busca);
    }).toList();

    lista.sort(
      (a, b) => _s(a['nome']).toLowerCase().compareTo(
            _s(b['nome']).toLowerCase(),
          ),
    );

    return lista;
  }

  // ============================================================
  // FORMULÁRIO
  // ============================================================

  InputDecoration _decoracao(String rotulo, {IconData? icone}) {
    return InputDecoration(
      labelText: rotulo,
      prefixIcon: icone == null ? null : Icon(icone, size: 20),
      labelStyle: TextStyle(color: _secundario),
      prefixIconColor: _secundario,
      filled: true,
      fillColor: _fundoCampo,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 15,
        vertical: 16,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: BorderSide(color: _borda),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: const BorderSide(color: _roxo, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: const BorderSide(color: _vermelho),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: const BorderSide(color: _vermelho, width: 1.5),
      ),
    );
  }

  Future<void> _abrirFormulario({
    Map<String, dynamic>? servico,
  }) async {
    if (_excluindo) return;

    final id = _id(servico?['id']);
    final formKey = GlobalKey<FormState>();

    final nome = TextEditingController(text: _s(servico?['nome']));
    final preco = TextEditingController(
      text: servico == null
          ? ''
          : _valor(servico['preco'])
              .toStringAsFixed(2)
              .replaceAll('.', ','),
    );
    final duracao = TextEditingController(
      text: servico == null ? '30' : _s(servico['duracao_min']),
    );

    bool salvandoDialog = false;

    try {
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) {
          return StatefulBuilder(
            builder: (context, setDialogState) {
              return AlertDialog(
                backgroundColor: _painel,
                surfaceTintColor: Colors.transparent,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(22),
                  side: BorderSide(color: _borda),
                ),
                title: Text(
                  servico == null ? 'Novo serviço' : 'Editar serviço',
                  style: TextStyle(
                    color: _texto,
                    fontWeight: FontWeight.w800,
                    fontSize: 20,
                  ),
                ),
                content: SizedBox(
                  width: 480,
                  child: SingleChildScrollView(
                    child: Form(
                      key: formKey,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextFormField(
                            controller: nome,
                            maxLength: 150,
                            enabled: !salvandoDialog,
                            textCapitalization:
                                TextCapitalization.sentences,
                            style: TextStyle(color: _texto),
                            decoration: _decoracao(
                              'Nome do serviço *',
                              icone: Icons.design_services_outlined,
                            ),
                            validator: (v) {
                              if (v == null || v.trim().isEmpty) {
                                return 'Informe o nome do serviço.';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: preco,
                            enabled: !salvandoDialog,
                            keyboardType:
                                const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            style: TextStyle(color: _texto),
                            decoration: _decoracao(
                              'Preço (R\$) *',
                              icone: Icons.payments_outlined,
                            ),
                            validator: (v) {
                              if (v == null || v.trim().isEmpty) {
                                return 'Informe o preço.';
                              }
                              if (_valor(v) < 0) {
                                return 'O preço não pode ser negativo.';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: duracao,
                            enabled: !salvandoDialog,
                            keyboardType: TextInputType.number,
                            style: TextStyle(color: _texto),
                            decoration: _decoracao(
                              'Duração em minutos *',
                              icone: Icons.schedule,
                            ),
                            validator: (v) {
                              final minutos =
                                  int.tryParse(v?.trim() ?? '');
                              if (minutos == null || minutos <= 0) {
                                return 'Informe a duração (maior que zero).';
                              }
                              return null;
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                actionsPadding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
                actions: [
                  TextButton(
                    onPressed: salvandoDialog
                        ? null
                        : () => Navigator.of(dialogContext).pop(),
                    child: Text(
                      'Cancelar',
                      style: TextStyle(color: _secundario),
                    ),
                  ),
                  FilledButton.icon(
                    onPressed: salvandoDialog
                        ? null
                        : () async {
                            if (!(formKey.currentState?.validate() ??
                                false)) {
                              return;
                            }

                            if (servico != null && id == null) return;

                            setDialogState(
                              () => salvandoDialog = true,
                            );

                            final minutos =
                                int.tryParse(duracao.text.trim()) ?? 0;

                            final dados = <String, dynamic>{
                              'nome': nome.text.trim(),
                              'preco': _valor(preco.text),
                              'duracao_min': minutos,
                            };

                            try {
                              if (id == null) {
                                await ApiClient.post('/servicos', dados);
                              } else {
                                await ApiClient.put(
                                  '/servicos/$id',
                                  dados,
                                );
                              }

                              if (!mounted ||
                                  !dialogContext.mounted) {
                                return;
                              }

                              Navigator.of(dialogContext).pop();

                              _mensagem(
                                id == null
                                    ? 'Serviço cadastrado com sucesso.'
                                    : 'Serviço atualizado com sucesso.',
                              );

                              await _carregar();
                            } catch (e) {
                              if (dialogContext.mounted) {
                                setDialogState(
                                  () => salvandoDialog = false,
                                );
                              }

                              _mensagem(
                                e is ApiException
                                    ? e.message
                                    : 'Não foi possível salvar o serviço.',
                              );
                            }
                          },
                    style: FilledButton.styleFrom(
                      backgroundColor: _roxo,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: salvandoDialog
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.save_outlined),
                    label: Text(
                      salvandoDialog ? 'Salvando...' : 'Salvar',
                    ),
                  ),
                ],
              );
            },
          );
        },
      );
    } finally {
      // Aguarda a animação de saída do diálogo antes de descartar os campos.
      Future<void>.delayed(const Duration(milliseconds: 500), () {
        nome.dispose();
        preco.dispose();
        duracao.dispose();
      });
    }
  }

  // ============================================================
  // EXCLUSÃO
  // ============================================================

  Future<void> _excluir(Map<String, dynamic> servico) async {
    final id = _id(servico['id']);
    if (id == null || _excluindo) return;

    final nome = _s(servico['nome'], 'este serviço');

    final confirmar = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: _painel,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: BorderSide(color: _borda),
        ),
        title: Text(
          'Excluir serviço?',
          style: TextStyle(
            color: _texto,
            fontWeight: FontWeight.w800,
          ),
        ),
        content: Text(
          'O serviço "$nome" será excluído. '
          'Essa ação não pode ser desfeita.',
          style: TextStyle(
            color: _secundario,
            height: 1.5,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(
              'Cancelar',
              style: TextStyle(color: _secundario),
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: _vermelho,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );

    if (confirmar != true || !mounted) return;

    setState(() => _excluindo = true);

    try {
      await ApiClient.delete('/servicos/$id');

      if (!mounted) return;

      _mensagem('Serviço excluído.');
      await _carregar();
    } catch (e) {
      _mensagem(
        e is ApiException
            ? e.message
            : 'Não foi possível excluir o serviço.',
      );
    } finally {
      if (mounted) setState(() => _excluindo = false);
    }
  }

  // ============================================================
  // WIDGETS
  // ============================================================

  Widget _indicador(
    IconData icone,
    String titulo,
    String valor,
    Color cor,
  ) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _painel,
        borderRadius: BorderRadius.circular(17),
        border: Border.all(color: _borda),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: cor.withValues(alpha: 0.13),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icone, color: cor, size: 21),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: TextStyle(
                    color: _secundario,
                    fontSize: 11,
                  ),
                ),
                const SizedBox(height: 4),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    valor,
                    style: TextStyle(
                      color: _texto,
                      fontSize: 19,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _cartaoServico(Map<String, dynamic> servico) {
    final nome = _s(servico['nome'], 'Serviço sem nome');
    final duracao = _duracao(servico['duracao_min']);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _painel,
        borderRadius: BorderRadius.circular(19),
        border: Border.all(color: _borda),
        boxShadow: _temaEscuro
            ? null
            : [
                BoxShadow(
                  color: const Color(0xFF33205F).withValues(alpha: 0.035),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: _roxo.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.design_services_outlined,
                  color: _roxo,
                  size: 23,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    nome,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: _texto,
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  _moeda(_valor(servico['preco'])),
                  textAlign: TextAlign.end,
                  style: const TextStyle(
                    color: _verde,
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
              ),
            ],
          ),
          if (duracao.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 9,
                vertical: 7,
              ),
              decoration: BoxDecoration(
                color: _fundoEtiqueta,
                borderRadius: BorderRadius.circular(9),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.schedule,
                    color: _secundario,
                    size: 14,
                  ),
                  const SizedBox(width: 5),
                  Text(
                    duracao,
                    style: TextStyle(
                      color: _secundario,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          Divider(color: _borda, height: 1),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton.icon(
                onPressed: _excluindo
                    ? null
                    : () => _abrirFormulario(servico: servico),
                icon: const Icon(
                  Icons.edit_outlined,
                  size: 17,
                ),
                label: const Text('Editar'),
                style: TextButton.styleFrom(
                  foregroundColor: _texto,
                ),
              ),
              IconButton(
                tooltip: 'Excluir serviço',
                onPressed: _excluindo
                    ? null
                    : () => _excluir(servico),
                icon: const Icon(
                  Icons.delete_outline_rounded,
                  color: _vermelho,
                  size: 20,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _estadoVazio() {
    final buscando = _buscaController.text.trim().isNotEmpty;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: 24,
        vertical: 36,
      ),
      decoration: BoxDecoration(
        color: _painel,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _borda),
      ),
      child: Column(
        children: [
          Icon(
            buscando
                ? Icons.search_off_rounded
                : Icons.design_services_outlined,
            size: 45,
            color: _roxo,
          ),
          const SizedBox(height: 14),
          Text(
            buscando
                ? 'Nenhum serviço encontrado'
                : 'Nenhum serviço cadastrado',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _texto,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 7),
          Text(
            buscando
                ? 'Tente outro termo de busca.'
                : 'Cadastre seus serviços para usá-los na agenda.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _secundario,
              fontSize: 12,
              height: 1.5,
            ),
          ),
          if (!buscando) ...[
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: () => _abrirFormulario(),
              style: FilledButton.styleFrom(
                backgroundColor: _roxo,
                foregroundColor: Colors.white,
              ),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Novo serviço'),
            ),
          ],
        ],
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
              Icons.cloud_off_outlined,
              color: _vermelho,
              size: 45,
            ),
            const SizedBox(height: 14),
            Text(
              'Não foi possível carregar os serviços',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: _texto,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _erro ?? 'Tente novamente.',
              textAlign: TextAlign.center,
              style: TextStyle(color: _secundario),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _carregar,
              style: FilledButton.styleFrom(
                backgroundColor: _roxo,
                foregroundColor: Colors.white,
              ),
              icon: const Icon(Icons.refresh),
              label: const Text('Tentar novamente'),
            ),
          ],
        ),
      ),
    );
  }

  // ============================================================
  // TELA
  // ============================================================

  @override
  Widget build(BuildContext context) {
    final lista = _filtrados;

    final precos = _servicos
        .map((servico) => _valor(servico['preco']))
        .toList();

    final precoMedio = precos.isEmpty
        ? 0.0
        : precos.fold<double>(0, (a, b) => a + b) / precos.length;

    return Scaffold(
      backgroundColor: _fundo,
      appBar: AppBar(
        backgroundColor: _fundo,
        foregroundColor: _texto,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Serviços',
              style: TextStyle(
                color: _texto,
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              'Catálogo de serviços e preços',
              style: TextStyle(
                color: _secundario,
                fontSize: 12,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Atualizar',
            onPressed: _carregando ? null : _carregar,
            icon: const Icon(Icons.refresh_rounded),
          ),
          const SizedBox(width: 6),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _excluindo ? null : () => _abrirFormulario(),
        backgroundColor: _roxo,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Novo serviço'),
      ),
      body: SafeArea(
        child: _carregando
            ? const Center(
                child: CircularProgressIndicator(color: _roxo),
              )
            : _erro != null
                ? _estadoErro()
                : RefreshIndicator(
                    color: _roxo,
                    onRefresh: _carregar,
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(
                        18,
                        10,
                        18,
                        100,
                      ),
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: _indicador(
                                Icons.design_services_outlined,
                                'Serviços',
                                _servicos.length.toString(),
                                _roxo,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: _indicador(
                                Icons.sell_outlined,
                                'Preço médio',
                                _moeda(precoMedio),
                                _verde,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _buscaController,
                          style: TextStyle(color: _texto),
                          cursorColor: _roxo,
                          onChanged: (_) => setState(() {}),
                          decoration: _decoracao(
                            'Buscar serviço',
                            icone: Icons.search_rounded,
                          ).copyWith(
                            suffixIcon: _buscaController.text.isEmpty
                                ? null
                                : IconButton(
                                    onPressed: () {
                                      _buscaController.clear();
                                      setState(() {});
                                    },
                                    icon: Icon(
                                      Icons.close,
                                      color: _secundario,
                                    ),
                                  ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        if (lista.isEmpty)
                          _estadoVazio()
                        else ...[
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Text(
                              '${lista.length} '
                              '${lista.length == 1 ? 'serviço' : 'serviços'}',
                              style: TextStyle(
                                color: _secundario,
                                fontSize: 12,
                              ),
                            ),
                          ),
                          ...lista.map(_cartaoServico),
                        ],
                      ],
                    ),
                  ),
      ),
    );
  }
}
