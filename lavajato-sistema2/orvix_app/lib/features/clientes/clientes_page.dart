import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';

class ClientesPage extends StatefulWidget {
  const ClientesPage({super.key});

  @override
  State<ClientesPage> createState() => _ClientesPageState();
}

class _ClientesPageState extends State<ClientesPage> {
  static const Color _fundo = Color(0xFF0F1020);
  static const Color _painel = Color(0xFF191A30);
  static const Color _roxo = Color(0xFF8B5CF6);
  static const Color _texto = Color(0xFFF4F3FF);
  static const Color _secundario = Color(0xFFA6A4C2);
  static const Color _vermelho = Color(0xFFEF6464);

  final TextEditingController _buscaController = TextEditingController();

  List<Map<String, dynamic>> _clientes = [];
  bool _carregando = false;
  bool _salvando = false;
  bool _pesquisou = false;
  String? _erro;
  String _buscaAtual = '';

  @override
  void dispose() {
    _buscaController.dispose();
    super.dispose();
  }

  // CORRIGIDO: antes se chamava `_texto`, o mesmo nome da cor acima.
  String _s(dynamic valor, [String padrao = '']) {
    if (valor == null) return padrao;
    return valor.toString();
  }

  int? _id(dynamic valor) {
    if (valor is int) return valor;
    return int.tryParse(valor?.toString() ?? '');
  }

  double _numero(dynamic valor) {
    if (valor is num) return valor.toDouble();
    return double.tryParse(
          valor?.toString().replaceAll(',', '.') ?? '',
        ) ??
        0;
  }

  String _moeda(dynamic valor) {
    final numero = _numero(valor);
    final partes = numero.toStringAsFixed(2).split('.');
    final inteiro = partes[0].replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => '.',
    );
    return 'R\$ $inteiro,${partes[1]}';
  }

  String _data(dynamic valor) {
    if (valor == null || valor.toString().isEmpty) return 'Nunca';
    try {
      final data = DateTime.parse(valor.toString());
      return '${data.day.toString().padLeft(2, '0')}/'
          '${data.month.toString().padLeft(2, '0')}/'
          '${data.year}';
    } catch (_) {
      return valor.toString();
    }
  }

  bool _historico(Map<String, dynamic> cliente) {
    return cliente['id'] == null;
  }

  List<Map<String, dynamic>> _comoMapas(List<dynamic> lista) {
    return lista
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<void> _buscar() async {
    final termo = _buscaController.text.trim();

    if (termo.isEmpty) {
      setState(() {
        _clientes = [];
        _erro = null;
        _pesquisou = false;
        _buscaAtual = '';
      });
      return;
    }

    FocusScope.of(context).unfocus();

    setState(() {
      _carregando = true;
      _erro = null;
      _pesquisou = true;
      _buscaAtual = termo;
    });

    try {
      // CORRIGIDO: ApiClient.get só devolve Map; listas exigem getList.
      final lista = await ApiClient.getList(
        '/clientes?busca=${Uri.encodeQueryComponent(termo)}',
      );

      if (!mounted) return;

      setState(() {
        _clientes = _comoMapas(lista);
        _carregando = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _erro = e is ApiException
            ? e.message
            : 'Não foi possível carregar os clientes.';
      });
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
          backgroundColor: _painel,
        ),
      );
  }

  InputDecoration _decoracao(String rotulo, {IconData? icone}) {
    return InputDecoration(
      labelText: rotulo,
      prefixIcon: icone == null ? null : Icon(icone, size: 20),
      labelStyle: const TextStyle(color: _secundario),
      prefixIconColor: _secundario,
      filled: true,
      fillColor: _fundo,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.07)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: const BorderSide(color: _roxo),
      ),
    );
  }

  Future<void> _abrirFormulario({Map<String, dynamic>? cliente}) async {
    if (_salvando) return;

    final formKey = GlobalKey<FormState>();
    final nome = TextEditingController(
      text: _s(cliente?['nome'] ?? cliente?['cliente']),
    );
    final telefone = TextEditingController(text: _s(cliente?['telefone']));
    final email = TextEditingController(text: _s(cliente?['email']));
    final documento = TextEditingController(
      text: _s(cliente?['documento']),
    );
    final nascimento = TextEditingController(
      text: _s(cliente?['data_nascimento']).split('T').first,
    );
    final endereco = TextEditingController(text: _s(cliente?['endereco']));
    final observacoes = TextEditingController(
      text: _s(cliente?['observacoes']),
    );

    try {
      await showDialog<void>(
        context: context,
        barrierDismissible: !_salvando,
        builder: (dialogContext) {
          return StatefulBuilder(
            builder: (context, setDialogState) {
              return AlertDialog(
                backgroundColor: _painel,
                title: Text(
                  cliente == null ? 'Novo cliente' : 'Editar cliente',
                  style: const TextStyle(
                    color: _texto,
                    fontWeight: FontWeight.w800,
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
                            style: const TextStyle(color: _texto),
                            decoration: _decoracao(
                              'Nome completo *',
                              icone: Icons.person_outline,
                            ),
                            validator: (v) {
                              if (v == null || v.trim().isEmpty) {
                                return 'Informe o nome do cliente.';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: telefone,
                            maxLength: 30,
                            keyboardType: TextInputType.phone,
                            style: const TextStyle(color: _texto),
                            decoration: _decoracao(
                              'Telefone',
                              icone: Icons.phone_outlined,
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: email,
                            maxLength: 254,
                            keyboardType: TextInputType.emailAddress,
                            style: const TextStyle(color: _texto),
                            decoration: _decoracao(
                              'E-mail',
                              icone: Icons.email_outlined,
                            ),
                            validator: (v) {
                              final valor = v?.trim() ?? '';
                              if (valor.isNotEmpty &&
                                  !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                                      .hasMatch(valor)) {
                                return 'Informe um e-mail válido.';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: documento,
                            maxLength: 18,
                            style: const TextStyle(color: _texto),
                            decoration: _decoracao(
                              'CPF/CNPJ ou documento',
                              icone: Icons.badge_outlined,
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: nascimento,
                            readOnly: true,
                            style: const TextStyle(color: _texto),
                            decoration: _decoracao(
                              'Data de nascimento',
                              icone: Icons.calendar_month_outlined,
                            ).copyWith(
                              suffixIcon: nascimento.text.isNotEmpty
                                  ? IconButton(
                                      onPressed: () {
                                        nascimento.clear();
                                        setDialogState(() {});
                                      },
                                      icon: const Icon(
                                        Icons.close,
                                        color: _secundario,
                                      ),
                                    )
                                  : null,
                            ),
                            onTap: () async {
                              DateTime inicial;
                              try {
                                inicial = DateTime.parse(nascimento.text);
                              } catch (_) {
                                inicial = DateTime(2000);
                              }

                              final data = await showDatePicker(
                                context: dialogContext,
                                initialDate: inicial,
                                firstDate: DateTime(1900),
                                lastDate: DateTime.now(),
                                builder: (context, child) {
                                  return Theme(
                                    data: Theme.of(context).copyWith(
                                      colorScheme: const ColorScheme.dark(
                                        primary: _roxo,
                                        surface: _painel,
                                      ),
                                    ),
                                    child: child!,
                                  );
                                },
                              );

                              // CORRIGIDO: o diálogo pode ter sido fechado
                              // enquanto o seletor de data estava aberto.
                              if (data == null || !dialogContext.mounted) {
                                return;
                              }

                              nascimento.text =
                                  '${data.year}-'
                                  '${data.month.toString().padLeft(2, '0')}-'
                                  '${data.day.toString().padLeft(2, '0')}';
                              setDialogState(() {});
                            },
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: endereco,
                            maxLength: 250,
                            style: const TextStyle(color: _texto),
                            decoration: _decoracao(
                              'Endereço',
                              icone: Icons.location_on_outlined,
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: observacoes,
                            maxLength: 5000,
                            maxLines: 3,
                            style: const TextStyle(color: _texto),
                            decoration: _decoracao(
                              'Observações',
                              icone: Icons.notes_outlined,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: _salvando
                        ? null
                        : () => Navigator.of(dialogContext).pop(),
                    child: const Text(
                      'Cancelar',
                      style: TextStyle(color: _secundario),
                    ),
                  ),
                  FilledButton.icon(
                    onPressed: _salvando
                        ? null
                        : () async {
                            if (!(formKey.currentState?.validate() ?? false)) {
                              return;
                            }

                            final id = _id(cliente?['id']);
                            if (cliente != null && id == null) return;

                            setState(() => _salvando = true);
                            setDialogState(() {});

                            final dados = <String, dynamic>{
                              'nome': nome.text.trim(),
                              'telefone': telefone.text.trim(),
                              'email': email.text.trim(),
                              'documento': documento.text.trim(),
                              'data_nascimento': nascimento.text.trim(),
                              'endereco': endereco.text.trim(),
                              'observacoes': observacoes.text.trim(),
                            };

                            try {
                              if (id == null) {
                                await ApiClient.post('/clientes', dados);
                              } else {
                                await ApiClient.patch('/clientes/$id', dados);
                              }

                              if (!mounted || !dialogContext.mounted) return;

                              Navigator.of(dialogContext).pop();
                              _mensagem(
                                id == null
                                    ? 'Cliente cadastrado com sucesso.'
                                    : 'Cliente atualizado com sucesso.',
                              );

                              if (_buscaController.text.trim().isNotEmpty) {
                                await _buscar();
                              }
                            } catch (e) {
                              if (!mounted) return;
                              _mensagem(
                                e is ApiException
                                    ? e.message
                                    : 'Não foi possível salvar o cliente.',
                              );
                            } finally {
                              if (mounted) {
                                setState(() => _salvando = false);
                              }
                              if (dialogContext.mounted) {
                                setDialogState(() {});
                              }
                            }
                          },
                    style: FilledButton.styleFrom(
                      backgroundColor: _roxo,
                      foregroundColor: Colors.white,
                    ),
                    icon: _salvando
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.save_outlined),
                    label: Text(_salvando ? 'Salvando...' : 'Salvar'),
                  ),
                ],
              );
            },
          );
        },
      );
    } finally {
      // O showDialog completa ao fechar a rota, mas a animação de saída ainda
      // usa os controllers. Por isso o descarte é adiado.
      Future<void>.delayed(const Duration(milliseconds: 500), () {
        nome.dispose();
        telefone.dispose();
        email.dispose();
        documento.dispose();
        nascimento.dispose();
        endereco.dispose();
        observacoes.dispose();
      });
    }
  }

  Future<void> _verHistorico(Map<String, dynamic> cliente) async {
    final clienteId = _id(cliente['id']);
    final telefone = _s(cliente['telefone']).trim();
    final nome = _s(cliente['nome'] ?? cliente['cliente']).trim();

    final parametros = <String, String>{};
    if (clienteId != null) {
      parametros['cliente_id'] = clienteId.toString();
    } else if (telefone.isNotEmpty) {
      parametros['telefone'] = telefone;
    } else {
      parametros['cliente'] = nome;
    }

    setState(() => _carregando = true);

    try {
      final query = Uri(queryParameters: parametros).query;

      // CORRIGIDO: getList em vez de get.
      final resposta = await ApiClient.getList('/clientes/historico?$query');

      if (!mounted) return;

      final lista = _comoMapas(resposta);

      await showDialog<void>(
        context: context,
        builder: (dialogContext) {
          return AlertDialog(
            backgroundColor: _painel,
            title: Text(
              'Histórico de $nome',
              style: const TextStyle(
                color: _texto,
                fontWeight: FontWeight.w800,
              ),
            ),
            content: SizedBox(
              width: 520,
              height: 400,
              child: lista.isEmpty
                  ? const Center(
                      child: Text(
                        'Nenhum atendimento encontrado.',
                        style: TextStyle(color: _secundario),
                      ),
                    )
                  : ListView.separated(
                      itemCount: lista.length,
                      separatorBuilder: (_, __) => Divider(
                        color: Colors.white.withValues(alpha: 0.08),
                      ),
                      itemBuilder: (context, index) {
                        final item = lista[index];
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const CircleAvatar(
                            backgroundColor: Color(0x3328C7A1),
                            child: Icon(
                              Icons.history,
                              color: Color(0xFF28C7A1),
                            ),
                          ),
                          title: Text(
                            _s(
                              item['servico_nome'] ??
                                  item['servico'] ??
                                  item['veiculo'],
                              'Atendimento',
                            ),
                            style: const TextStyle(
                              color: _texto,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          subtitle: Text(
                            '${_data(item['data'])} • '
                            '${_s(item['hora'])}\n'
                            'Status: ${_s(item['status'], 'Não informado')}',
                            style: const TextStyle(
                              color: _secundario,
                              height: 1.5,
                            ),
                          ),
                          trailing: Text(
                            _moeda(item['valor']),
                            style: const TextStyle(
                              color: _texto,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        );
                      },
                    ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text(
                  'Fechar',
                  style: TextStyle(color: _roxo),
                ),
              ),
            ],
          );
        },
      );
    } catch (e) {
      if (mounted) {
        _mensagem(
          e is ApiException
              ? e.message
              : 'Não foi possível carregar o histórico.',
        );
      }
    } finally {
      if (mounted) setState(() => _carregando = false);
    }
  }

  Future<void> _desativar(Map<String, dynamic> cliente) async {
    final id = _id(cliente['id']);
    if (id == null || _salvando) return;

    final nome = _s(cliente['nome'] ?? cliente['cliente'], 'este cliente');

    final confirmar = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: _painel,
        title: const Text(
          'Desativar cliente?',
          style: TextStyle(color: _texto),
        ),
        content: Text(
          'O cadastro de "$nome" será desativado. '
          'O histórico de atendimentos será preservado.',
          style: const TextStyle(color: _secundario, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text(
              'Cancelar',
              style: TextStyle(color: _secundario),
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: _vermelho),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Desativar'),
          ),
        ],
      ),
    );

    if (confirmar != true || !mounted) return;

    setState(() => _salvando = true);

    try {
      await ApiClient.delete('/clientes/$id');
      if (!mounted) return;

      _mensagem('Cliente desativado.');
      await _buscar();
    } catch (e) {
      if (mounted) {
        _mensagem(
          e is ApiException
              ? e.message
              : 'Não foi possível desativar o cliente.',
        );
      }
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  Widget _indicador(
    IconData icone,
    String titulo,
    String valor,
  ) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _painel,
        borderRadius: BorderRadius.circular(17),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: _roxo.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icone, color: _roxo, size: 21),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: const TextStyle(color: _secundario, fontSize: 11),
                ),
                const SizedBox(height: 4),
                Text(
                  valor,
                  style: const TextStyle(
                    color: _texto,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _cartaoCliente(Map<String, dynamic> cliente) {
    final historico = _historico(cliente);
    final nome = _s(
      cliente['nome'] ?? cliente['cliente'],
      'Cliente sem nome',
    );
    final telefone = _s(cliente['telefone']);
    final totalAtendimentos = _s(cliente['total_atendimentos'], '0');
    final concluidos = _s(cliente['atendimentos_concluidos'], '0');

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _painel,
        borderRadius: BorderRadius.circular(19),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 23,
                backgroundColor: _roxo.withValues(alpha: 0.17),
                child: Text(
                  nome.trim().isEmpty ? '?' : nome.trim()[0].toUpperCase(),
                  style: const TextStyle(
                    color: _roxo,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      nome,
                      style: const TextStyle(
                        color: _texto,
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 5),
                    if (telefone.isNotEmpty)
                      Text(
                        telefone,
                        style: const TextStyle(
                          color: _secundario,
                          fontSize: 12,
                        ),
                      ),
                    if (_s(cliente['email']).isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Text(
                          _s(cliente['email']),
                          style: const TextStyle(
                            color: _secundario,
                            fontSize: 12,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (historico)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.orange.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'Histórico',
                    style: TextStyle(
                      color: Colors.orangeAccent,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _tag(Icons.event_available_outlined, '$totalAtendimentos atend.'),
              _tag(Icons.check_circle_outline, '$concluidos concluídos'),
              _tag(
                Icons.payments_outlined,
                _moeda(cliente['total_gasto']),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Última visita: ${_data(cliente['ultima_visita'])}',
            style: const TextStyle(color: _secundario, fontSize: 11),
          ),
          const SizedBox(height: 14),
          Divider(color: Colors.white.withValues(alpha: 0.07), height: 1),
          const SizedBox(height: 8),
          Wrap(
            alignment: WrapAlignment.end,
            spacing: 4,
            children: [
              TextButton.icon(
                onPressed: _carregando ? null : () => _verHistorico(cliente),
                icon: const Icon(Icons.history, size: 17),
                label: const Text('Histórico'),
                style: TextButton.styleFrom(foregroundColor: _roxo),
              ),
              if (!historico) ...[
                TextButton.icon(
                  onPressed: _salvando
                      ? null
                      : () => _abrirFormulario(cliente: cliente),
                  icon: const Icon(Icons.edit_outlined, size: 17),
                  label: const Text('Editar'),
                  style: TextButton.styleFrom(foregroundColor: _texto),
                ),
                IconButton(
                  tooltip: 'Desativar cliente',
                  onPressed: _salvando ? null : () => _desativar(cliente),
                  icon: const Icon(
                    Icons.person_off_outlined,
                    color: _vermelho,
                    size: 20,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _tag(IconData icone, String texto) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icone, color: _secundario, size: 14),
          const SizedBox(width: 5),
          Text(
            texto,
            style: const TextStyle(color: _secundario, fontSize: 11),
          ),
        ],
      ),
    );
  }

  Widget _estadoVazio() {
    final semBusca = !_pesquisou;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 36),
      decoration: BoxDecoration(
        color: _painel,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        children: [
          Icon(
            semBusca
                ? Icons.person_search_outlined
                : Icons.person_off_outlined,
            size: 45,
            color: _roxo,
          ),
          const SizedBox(height: 14),
          Text(
            semBusca ? 'Encontre seus clientes' : 'Nenhum cliente encontrado',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: _texto,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 7),
          Text(
            semBusca
                ? 'Digite um nome, telefone, e-mail ou documento para pesquisar.'
                : 'Tente outro termo ou cadastre um novo cliente.',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: _secundario,
              fontSize: 12,
              height: 1.5,
            ),
          ),
          if (!semBusca) ...[
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: () => _abrirFormulario(),
              style: FilledButton.styleFrom(
                backgroundColor: _roxo,
                foregroundColor: Colors.white,
              ),
              icon: const Icon(Icons.person_add_alt_1),
              label: const Text('Novo cliente'),
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
            const Icon(Icons.cloud_off_outlined, color: _vermelho, size: 45),
            const SizedBox(height: 14),
            const Text(
              'Não foi possível carregar os clientes',
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
              style: const TextStyle(color: _secundario),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _buscar,
              style: FilledButton.styleFrom(backgroundColor: _roxo),
              icon: const Icon(Icons.refresh),
              label: const Text('Tentar novamente'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cadastrados = _clientes.where((c) => !_historico(c)).length;
    final historicos = _clientes.where(_historico).length;

    return Scaffold(
      backgroundColor: _fundo,
      appBar: AppBar(
        backgroundColor: _fundo,
        foregroundColor: _texto,
        elevation: 0,
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Clientes',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 2),
            Text(
              'Cadastros e histórico de atendimentos',
              style: TextStyle(color: _secundario, fontSize: 12),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Atualizar busca',
            onPressed: _carregando || _buscaController.text.trim().isEmpty
                ? null
                : _buscar,
            icon: const Icon(Icons.refresh_rounded),
          ),
          const SizedBox(width: 6),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _salvando ? null : () => _abrirFormulario(),
        backgroundColor: _roxo,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('Novo cliente'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 12),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: _indicador(
                          Icons.people_outline,
                          'Cadastrados',
                          cadastrados.toString(),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _indicador(
                          Icons.history,
                          'Históricos',
                          historicos.toString(),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _buscaController,
                    style: const TextStyle(color: _texto),
                    textInputAction: TextInputAction.search,
                    onChanged: (_) => setState(() {}),
                    onSubmitted: (_) => _buscar(),
                    decoration: _decoracao(
                      'Buscar por nome, telefone, e-mail ou documento',
                      icone: Icons.search_rounded,
                    ).copyWith(
                      suffixIcon: IconButton(
                        tooltip: 'Pesquisar',
                        onPressed: _carregando ? null : _buscar,
                        icon: const Icon(Icons.arrow_forward_rounded),
                        color: _roxo,
                      ),
                    ),
                  ),
                  if (_buscaAtual.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Resultados para "$_buscaAtual"',
                          style: const TextStyle(
                            color: _secundario,
                            fontSize: 11,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: _carregando
                  ? const Center(
                      child: CircularProgressIndicator(color: _roxo),
                    )
                  : _erro != null
                      ? _estadoErro()
                      : RefreshIndicator(
                          color: _roxo,
                          onRefresh: _buscar,
                          child: ListView(
                            // Permite puxar para atualizar mesmo com poucos itens.
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.fromLTRB(18, 4, 18, 100),
                            children: [
                              if (_clientes.isEmpty)
                                _estadoVazio()
                              else ...[
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 12),
                                  child: Text(
                                    '${_clientes.length} '
                                    '${_clientes.length == 1 ? 'resultado' : 'resultados'}',
                                    style: const TextStyle(
                                      color: _secundario,
                                      fontSize: 12,
                                    ),
                                  ),
                                ),
                                ..._clientes.map(_cartaoCliente),
                              ],
                            ],
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}