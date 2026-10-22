import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/orvix_theme_controller.dart';

class AgendaPage extends StatefulWidget {
  const AgendaPage({super.key});

  @override
  State<AgendaPage> createState() => _AgendaPageState();
}

class _AgendaPageState extends State<AgendaPage> {
  bool get _temaEscuro => OrvixThemeController.instance.isDark;

  Color get _background =>
      _temaEscuro ? const Color(0xFF0B0B12) : const Color(0xFFF7F6FC);

  Color get _surface =>
      _temaEscuro ? const Color(0xFF151522) : Colors.white;

  Color get _surfaceAlt =>
      _temaEscuro ? const Color(0xFF1D1B2D) : const Color(0xFFEDEAF7);

  Color get _texto =>
      _temaEscuro ? const Color(0xFFF5F2FC) : const Color(0xFF262238);

  Color get _textoSecundario =>
      _temaEscuro ? const Color(0xFFAAA4BB) : const Color(0xFF777187);

  Color get _borda => _temaEscuro
      ? Colors.white.withValues(alpha: 0.08)
      : const Color(0xFFE5E0F0);

  static const Color _purple = Color(0xFF7965D8);
  static const Color _purpleDark = Color(0xFF6550C7);
  static const Color _green = Color(0xFF239B70);
  static const Color _red = Color(0xFFD94F68);
  static const Color _yellow = Color(0xFFB98220);
  static const Color _blue = Color(0xFF397DC4);

  static const List<String> _statusOpcoes = [
    'agendado',
    'confirmado',
    'em_andamento',
    'concluido',
    'cancelado',
  ];

  static const List<String> _pagamentoOpcoes = [
    'pendente',
    'pago',
    'parcial',
    'cancelado',
  ];

  static const List<String> _formasValidas = [
    '',
    'dinheiro',
    'pix',
    'cartao',
    'transferencia',
  ];

  final TextEditingController _searchController = TextEditingController();

  List<Map<String, dynamic>> _agendamentos = [];
  List<Map<String, dynamic>> _servicos = [];

  DateTime _dataSelecionada = DateTime.now();

  bool _carregando = true;
  bool _salvando = false;
  String? _erro;
  String _filtroStatus = 'todos';
  String _nichoEmpresa = 'generico';

  bool get _usaVeiculo =>
      _nichoEmpresa == 'lavajato' || _nichoEmpresa == 'oficina';

  String get _tituloCampoPrincipal {
    switch (_nichoEmpresa) {
      case 'lavajato':
      case 'oficina':
        return 'Veículo';
      case 'pet':
        return 'Nome do animal';
      case 'clinica':
        return 'Procedimento ou especialidade';
      case 'barbearia':
        return 'Profissional';
      case 'personal':
        return 'Atividade';
      default:
        return 'Detalhes do atendimento';
    }
  }

  String get _tituloCampoSecundario {
    switch (_nichoEmpresa) {
      case 'lavajato':
      case 'oficina':
        return 'Placa';
      case 'pet':
        return 'Raça ou porte';
      case 'clinica':
        return 'Profissional';
      case 'barbearia':
        return 'Tipo de atendimento';
      case 'personal':
        return 'Local do treino';
      default:
        return 'Informação adicional';
    }
  }

  IconData get _iconeCampoPrincipal {
    switch (_nichoEmpresa) {
      case 'lavajato':
      case 'oficina':
        return Icons.directions_car_outlined;
      case 'pet':
        return Icons.pets_outlined;
      case 'clinica':
        return Icons.medical_services_outlined;
      case 'barbearia':
        return Icons.content_cut_rounded;
      case 'personal':
        return Icons.fitness_center_outlined;
      default:
        return Icons.notes_outlined;
    }
  }

  String get _tituloAgenda {
    switch (_nichoEmpresa) {
      case 'lavajato':
        return 'Agendamentos de serviços automotivos';
      case 'barbearia':
        return 'Agendamentos de atendimentos';
      case 'clinica':
        return 'Agenda de consultas';
      case 'pet':
        return 'Agenda de atendimentos pet';
      case 'oficina':
        return 'Agenda da oficina';
      case 'personal':
        return 'Agenda de treinos';
      default:
        return 'Organize seus atendimentos';
    }
  }

  @override
  void initState() {
    super.initState();
    OrvixThemeController.instance.addListener(_atualizarTema);
    _carregarNichoEmpresa();
    _carregarDados();
  }

  void _atualizarTema() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    OrvixThemeController.instance.removeListener(_atualizarTema);
    _searchController.dispose();
    super.dispose();
  }

  ThemeData _temaDosSeletores(ThemeData tema) {
    return tema.copyWith(
      colorScheme: ColorScheme(
        brightness: _temaEscuro ? Brightness.dark : Brightness.light,
        primary: _purple,
        onPrimary: Colors.white,
        secondary: _purpleDark,
        onSecondary: Colors.white,
        surface: _surface,
        onSurface: _texto,
        error: _red,
        onError: Colors.white,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: _surface,
        titleTextStyle: TextStyle(
          color: _texto,
          fontSize: 20,
          fontWeight: FontWeight.w700,
        ),
        contentTextStyle: TextStyle(color: _textoSecundario),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: _purple),
      ),
    );
  }

  InputDecoration _decoracaoCampo(
    String label, {
    IconData? icon,
  }) {
    return InputDecoration(
      labelText: label,
      prefixIcon: icon == null ? null : Icon(icon, size: 19),
      filled: true,
      fillColor: _surfaceAlt,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 14,
        vertical: 15,
      ),
      labelStyle: TextStyle(color: _textoSecundario),
      hintStyle: TextStyle(color: _textoSecundario),
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
        borderSide: const BorderSide(color: _purple, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: const BorderSide(color: _red),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: const BorderSide(color: _red),
      ),
    );
  }

  // ============================================================
  // EMPRESA E NICHO
  // ============================================================

  Future<void> _carregarNichoEmpresa() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonEmpresa = prefs.getString('orvix_empresa');

      if (jsonEmpresa == null || jsonEmpresa.isEmpty) return;

      final dados = jsonDecode(jsonEmpresa);
      if (dados is! Map) return;

      final nicho = (dados['nicho'] ?? 'generico')
          .toString()
          .trim()
          .toLowerCase();

      const nichosValidos = {
        'lavajato',
        'barbearia',
        'clinica',
        'pet',
        'oficina',
        'personal',
        'generico',
      };

      if (!mounted) return;

      setState(() {
        _nichoEmpresa = nichosValidos.contains(nicho) ? nicho : 'generico';
      });
    } catch (_) {
      // Mantém o modo genérico quando não há configuração local.
    }
  }

  // ============================================================
  // FORMATAÇÃO
  // ============================================================

  String _dataIso(DateTime data) {
    return '${data.year.toString().padLeft(4, '0')}-'
        '${data.month.toString().padLeft(2, '0')}-'
        '${data.day.toString().padLeft(2, '0')}';
  }

  DateTime? _parseData(dynamic valor) {
    if (valor == null) return null;

    final texto = valor.toString().trim();
    if (texto.isEmpty) return null;

    try {
      return DateTime.parse(
        texto.length >= 10 ? texto.substring(0, 10) : texto,
      );
    } catch (_) {
      return null;
    }
  }

  String _formatarData(DateTime data) {
    return '${data.day.toString().padLeft(2, '0')}/'
        '${data.month.toString().padLeft(2, '0')}/'
        '${data.year}';
  }

  String _nomeDia(DateTime data) {
    const dias = [
      'segunda-feira',
      'terça-feira',
      'quarta-feira',
      'quinta-feira',
      'sexta-feira',
      'sábado',
      'domingo',
    ];

    return dias[data.weekday - 1];
  }

  double _valorNumerico(dynamic valor) {
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

  String _moeda(dynamic valor) {
    final numero = _valorNumerico(valor);
    final partes = numero.toStringAsFixed(2).split('.');
    final inteiro = partes[0];
    final buffer = StringBuffer();

    for (var i = 0; i < inteiro.length; i++) {
      if (i > 0 && (inteiro.length - i) % 3 == 0) {
        buffer.write('.');
      }
      buffer.write(inteiro[i]);
    }

    return 'R\$ ${buffer.toString()},${partes[1]}';
  }

  String _hora(dynamic valor) {
    if (valor == null) return '--:--';

    final texto = valor.toString();
    return texto.length >= 5 ? texto.substring(0, 5) : texto;
  }

  String _statusLabel(String status) {
    switch (status.toLowerCase()) {
      case 'agendado':
        return 'Agendado';
      case 'confirmado':
        return 'Confirmado';
      case 'em_andamento':
        return 'Em andamento';
      case 'concluido':
        return 'Concluído';
      case 'cancelado':
        return 'Cancelado';
      default:
        return status.isEmpty ? 'Agendado' : status;
    }
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'confirmado':
        return _green;
      case 'em_andamento':
        return _blue;
      case 'concluido':
        return _purple;
      case 'cancelado':
        return _red;
      default:
        return _yellow;
    }
  }

  String _normalizarForma(String valor) {
    final v = valor.trim().toLowerCase();

    if (v == 'cartão' ||
        v == 'cartao' ||
        v == 'credito' ||
        v == 'crédito' ||
        v == 'debito' ||
        v == 'débito') {
      return 'cartao';
    }

    return _formasValidas.contains(v) ? v : '';
  }

  // ============================================================
  // CARREGAMENTO
  // ============================================================

  Future<void> _carregarDados() async {
    if (!mounted) return;

    setState(() {
      _carregando = true;
      _erro = null;
    });

    try {
      final resultados = await Future.wait([
        ApiClient.getList('/agendamentos'),
        ApiClient.getList('/servicos'),
      ]);

      if (!mounted) return;

      setState(() {
        _agendamentos = resultados[0]
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();

        _servicos = resultados[1]
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();

        _carregando = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;

      setState(() {
        _carregando = false;
        _erro = e.message;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _carregando = false;
        _erro = 'Não foi possível carregar a agenda. Verifique sua conexão.';
      });
    }
  }

  List<Map<String, dynamic>> get _agendamentosDoDia {
    final busca = _searchController.text.trim().toLowerCase();

    final lista = _agendamentos.where((item) {
      final data = _parseData(item['data']);

      if (data == null || _dataIso(data) != _dataIso(_dataSelecionada)) {
        return false;
      }

      final status = (item['status'] ?? 'agendado').toString().toLowerCase();

      if (_filtroStatus != 'todos' && status != _filtroStatus) {
        return false;
      }

      if (busca.isNotEmpty) {
        final campos = [
          item['cliente'],
          item['telefone'],
          item['servico_nome'],
          item['veiculo'],
          item['placa'],
        ].map((v) => (v ?? '').toString().toLowerCase());

        if (!campos.any((campo) => campo.contains(busca))) {
          return false;
        }
      }

      return true;
    }).toList();

    lista.sort((a, b) => _hora(a['hora']).compareTo(_hora(b['hora'])));
    return lista;
  }

  int _contarStatus(List<Map<String, dynamic>> lista, String status) {
    return lista.where((item) {
      return (item['status'] ?? 'agendado').toString().toLowerCase() == status;
    }).length;
  }

  double _totalPrevisto(List<Map<String, dynamic>> lista) {
    return lista.fold<double>(0, (total, item) {
      if ((item['status'] ?? '').toString().toLowerCase() == 'cancelado') {
        return total;
      }

      return total + _valorNumerico(item['valor']);
    });
  }

  // ============================================================
  // DATA E HORA
  // ============================================================

  Future<void> _selecionarData() async {
    final selecionada = await showDatePicker(
      context: context,
      initialDate: _dataSelecionada,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      helpText: 'Selecione o dia da agenda',
      cancelText: 'Cancelar',
      confirmText: 'Selecionar',
      builder: (context, child) {
        return Theme(
          data: _temaDosSeletores(Theme.of(context)),
          child: child!,
        );
      },
    );

    if (selecionada != null && mounted) {
      setState(() => _dataSelecionada = selecionada);
    }
  }

  Future<TimeOfDay?> _escolherHora(
    BuildContext context,
    String valorAtual,
  ) async {
    final partes = valorAtual.split(':');
    final hora = int.tryParse(partes.first) ?? 9;
    final minuto = partes.length > 1 ? int.tryParse(partes[1]) ?? 0 : 0;

    return showTimePicker(
      context: context,
      initialTime: TimeOfDay(
        hour: hora.clamp(0, 23),
        minute: minuto.clamp(0, 59),
      ),
      builder: (context, child) {
        return Theme(
          data: _temaDosSeletores(Theme.of(context)),
          child: child!,
        );
      },
    );
  }

  // ============================================================
  // FORMULÁRIO
  // ============================================================

  Future<void> _abrirFormulario({Map<String, dynamic>? agendamento}) async {
    await _carregarNichoEmpresa();

    if (!mounted) return;

    if (_servicos.isEmpty) {
      _mensagem('Cadastre ao menos um serviço antes de criar um agendamento.');
      return;
    }

    final formKey = GlobalKey<FormState>();

    final clienteController = TextEditingController(
      text: agendamento?['cliente']?.toString() ?? '',
    );
    final telefoneController = TextEditingController(
      text: agendamento?['telefone']?.toString() ?? '',
    );
    final veiculoController = TextEditingController(
      text: agendamento?['veiculo']?.toString() ?? '',
    );
    final placaController = TextEditingController(
      text: agendamento?['placa']?.toString() ?? '',
    );
    final valorController = TextEditingController(
      text: agendamento == null
          ? ''
          : _valorNumerico(agendamento['valor']).toStringAsFixed(2),
    );
    final observacoesController = TextEditingController(
      text: agendamento?['observacoes']?.toString() ?? '',
    );
    final dataController = TextEditingController(
      text: _dataIso(_parseData(agendamento?['data']) ?? _dataSelecionada),
    );
    final horaController = TextEditingController(
      text: _hora(agendamento?['hora'] ?? '09:00'),
    );

    int? servicoId = int.tryParse(agendamento?['servico_id']?.toString() ?? '');
    final clienteId = agendamento?['cliente_id'];

    final statusBruto = (agendamento?['status'] ?? 'agendado')
        .toString()
        .toLowerCase();
    String status = _statusOpcoes.contains(statusBruto)
        ? statusBruto
        : 'agendado';

    final pagamentoBruto = (agendamento?['status_pagamento'] ?? 'pendente')
        .toString()
        .toLowerCase();
    String statusPagamento = _pagamentoOpcoes.contains(pagamentoBruto)
        ? pagamentoBruto
        : 'pendente';

    String formaPagamento = _normalizarForma(
      (agendamento?['forma_pagamento'] ?? '').toString(),
    );

    final servicosIds = _servicos
        .map((s) => int.tryParse(s['id']?.toString() ?? ''))
        .whereType<int>()
        .toSet();

    if (!servicosIds.contains(servicoId)) {
      servicoId = servicosIds.firstOrNull;
    }

    if (agendamento == null && servicoId != null) {
      final servico = _servicos.firstWhere(
        (s) => int.tryParse(s['id']?.toString() ?? '') == servicoId,
        orElse: () => <String, dynamic>{},
      );

      valorController.text = _valorNumerico(
        servico['preco'],
      ).toStringAsFixed(2);
    }

    bool salvandoDialog = false;

    try {
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) {
          return StatefulBuilder(
            builder: (context, setDialogState) {
              final tamanho = MediaQuery.sizeOf(context);
              final alturaMaxima = (tamanho.height - 150).clamp(250.0, 700.0);

              Widget campo(
                TextEditingController controller,
                String label, {
                IconData? icon,
                TextInputType? keyboardType,
                int maxLines = 1,
                String? Function(String?)? validator,
                bool readOnly = false,
                VoidCallback? onTap,
              }) {
                return TextFormField(
                  controller: controller,
                  keyboardType: keyboardType,
                  maxLines: maxLines,
                  validator: validator,
                  readOnly: readOnly,
                  onTap: onTap,
                  style: TextStyle(color: _texto, fontSize: 14),
                  decoration: _decoracaoCampo(label, icon: icon),
                );
              }

              return Dialog(
                backgroundColor: _surface,
                insetPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 18,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(22),
                  side: BorderSide(color: _borda),
                ),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: 520,
                    maxHeight: alturaMaxima,
                  ),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 14, 12, 12),
                        child: Row(
                          children: [
                            Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                color: _purple.withValues(alpha: 0.14),
                                borderRadius: BorderRadius.circular(13),
                              ),
                              child: const Icon(
                                Icons.event_note_rounded,
                                color: _purple,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    agendamento == null
                                        ? 'Novo agendamento'
                                        : 'Editar agendamento',
                                    style: TextStyle(
                                      color: _texto,
                                      fontSize: 17,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    _tituloAgenda,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: _textoSecundario,
                                      fontSize: 11,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            IconButton(
                              tooltip: 'Fechar',
                              onPressed: salvandoDialog
                                  ? null
                                  : () => Navigator.of(dialogContext).pop(),
                              icon: Icon(
                                Icons.close_rounded,
                                color: _textoSecundario,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Divider(height: 1, color: _borda),
                      Flexible(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.all(18),
                          child: Form(
                            key: formKey,
                            child: Column(
                              children: [
                                campo(
                                  clienteController,
                                  'Nome do cliente *',
                                  icon: Icons.person_outline,
                                  validator: (v) =>
                                      v == null || v.trim().isEmpty
                                      ? 'Informe o nome do cliente.'
                                      : null,
                                ),
                                const SizedBox(height: 13),
                                campo(
                                  telefoneController,
                                  'Telefone',
                                  icon: Icons.phone_outlined,
                                  keyboardType: TextInputType.phone,
                                ),
                                const SizedBox(height: 13),
                                DropdownButtonFormField<int>(
                                  initialValue: servicoId,
                                  isExpanded: true,
                                  dropdownColor: _surface,
                                  style: TextStyle(
                                    color: _texto,
                                    fontSize: 13,
                                  ),
                                  decoration: _decoracaoCampo(
                                    'Serviço *',
                                    icon: Icons.design_services_outlined,
                                  ),
                                  items: _servicos
                                      .map((servico) {
                                        final id = int.tryParse(
                                          servico['id']?.toString() ?? '',
                                        );

                                        if (id == null) return null;

                                        return DropdownMenuItem<int>(
                                          value: id,
                                          child: Text(
                                            '${servico['nome'] ?? 'Serviço'} · '
                                            '${_moeda(servico['preco'])}',
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        );
                                      })
                                      .whereType<DropdownMenuItem<int>>()
                                      .toList(),
                                  onChanged: salvandoDialog
                                      ? null
                                      : (value) {
                                          setDialogState(() {
                                            servicoId = value;

                                            final servico = _servicos.firstWhere(
                                              (s) =>
                                                  int.tryParse(
                                                    s['id']?.toString() ?? '',
                                                  ) ==
                                                  value,
                                              orElse: () => <String, dynamic>{},
                                            );

                                            valorController.text =
                                                _valorNumerico(
                                                  servico['preco'],
                                                ).toStringAsFixed(2);
                                          });
                                        },
                                  validator: (value) => value == null
                                      ? 'Selecione um serviço.'
                                      : null,
                                ),
                                const SizedBox(height: 13),
                                LayoutBuilder(
                                  builder: (context, constraints) {
                                    final empilhar = constraints.maxWidth < 360;

                                    final campoData = campo(
                                      dataController,
                                      'Data *',
                                      icon: Icons.calendar_month_outlined,
                                      readOnly: true,
                                      onTap: salvandoDialog
                                          ? null
                                          : () async {
                                              final atual =
                                                  _parseData(
                                                    dataController.text,
                                                  ) ??
                                                  _dataSelecionada;

                                              final data = await showDatePicker(
                                                context: context,
                                                initialDate: atual,
                                                firstDate: DateTime(2020),
                                                lastDate: DateTime(2100),
                                                cancelText: 'Cancelar',
                                                confirmText: 'Selecionar',
                                                builder: (context, child) {
                                                  return Theme(
                                                    data: _temaDosSeletores(
                                                      Theme.of(context),
                                                    ),
                                                    child: child!,
                                                  );
                                                },
                                              );

                                              if (!context.mounted ||
                                                  data == null) {
                                                return;
                                              }

                                              dataController.text = _dataIso(
                                                data,
                                              );
                                              setDialogState(() {});
                                            },
                                    );

                                    final campoHora = campo(
                                      horaController,
                                      'Horário *',
                                      icon: Icons.schedule,
                                      readOnly: true,
                                      onTap: salvandoDialog
                                          ? null
                                          : () async {
                                              final hora = await _escolherHora(
                                                context,
                                                horaController.text,
                                              );

                                              if (!context.mounted ||
                                                  hora == null) {
                                                return;
                                              }

                                              horaController.text =
                                                  '${hora.hour.toString().padLeft(2, '0')}:'
                                                  '${hora.minute.toString().padLeft(2, '0')}';

                                              setDialogState(() {});
                                            },
                                    );

                                    if (empilhar) {
                                      return Column(
                                        children: [
                                          campoData,
                                          const SizedBox(height: 13),
                                          campoHora,
                                        ],
                                      );
                                    }

                                    return Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Expanded(child: campoData),
                                        const SizedBox(width: 10),
                                        Expanded(child: campoHora),
                                      ],
                                    );
                                  },
                                ),
                                const SizedBox(height: 13),
                                campo(
                                  valorController,
                                  'Valor (R\$) *',
                                  icon: Icons.payments_outlined,
                                  keyboardType:
                                      const TextInputType.numberWithOptions(
                                        decimal: true,
                                      ),
                                  validator: (v) {
                                    if (v == null || v.trim().isEmpty) {
                                      return 'Informe um valor.';
                                    }
                                    if (_valorNumerico(v) < 0) {
                                      return 'O valor não pode ser negativo.';
                                    }
                                    return null;
                                  },
                                ),
                                const SizedBox(height: 13),
                                campo(
                                  veiculoController,
                                  _usaVeiculo
                                      ? _tituloCampoPrincipal
                                      : '$_tituloCampoPrincipal (opcional)',
                                  icon: _iconeCampoPrincipal,
                                ),
                                const SizedBox(height: 13),
                                campo(
                                  placaController,
                                  '$_tituloCampoSecundario (opcional)',
                                  icon: _usaVeiculo
                                      ? Icons.pin_outlined
                                      : Icons.info_outline,
                                ),
                                const SizedBox(height: 13),
                                campo(
                                  observacoesController,
                                  'Observações',
                                  icon: Icons.notes_outlined,
                                  maxLines: 3,
                                ),
                                if (agendamento != null) ...[
                                  const SizedBox(height: 18),
                                  Align(
                                    alignment: Alignment.centerLeft,
                                    child: Text(
                                      'Status do agendamento',
                                      style: TextStyle(
                                        color: _textoSecundario,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  DropdownButtonFormField<String>(
                                    initialValue: status,
                                    isExpanded: true,
                                    dropdownColor: _surface,
                                    style: TextStyle(
                                      color: _texto,
                                      fontSize: 13,
                                    ),
                                    decoration: _decoracaoCampo('Status'),
                                    items: const [
                                      DropdownMenuItem(
                                        value: 'agendado',
                                        child: Text('Agendado'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'confirmado',
                                        child: Text('Confirmado'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'em_andamento',
                                        child: Text('Em andamento'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'concluido',
                                        child: Text('Concluído'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'cancelado',
                                        child: Text('Cancelado'),
                                      ),
                                    ],
                                    onChanged: salvandoDialog
                                        ? null
                                        : (value) {
                                            if (value != null) {
                                              setDialogState(
                                                () => status = value,
                                              );
                                            }
                                          },
                                  ),
                                  const SizedBox(height: 13),
                                  DropdownButtonFormField<String>(
                                    initialValue: statusPagamento,
                                    isExpanded: true,
                                    dropdownColor: _surface,
                                    style: TextStyle(
                                      color: _texto,
                                      fontSize: 13,
                                    ),
                                    decoration: _decoracaoCampo('Pagamento'),
                                    items: const [
                                      DropdownMenuItem(
                                        value: 'pendente',
                                        child: Text('Pendente'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'pago',
                                        child: Text('Pago'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'parcial',
                                        child: Text('Parcial'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'cancelado',
                                        child: Text('Cancelado'),
                                      ),
                                    ],
                                    onChanged: salvandoDialog
                                        ? null
                                        : (value) {
                                            if (value != null) {
                                              setDialogState(
                                                () => statusPagamento = value,
                                              );
                                            }
                                          },
                                  ),
                                  const SizedBox(height: 13),
                                  DropdownButtonFormField<String>(
                                    initialValue: formaPagamento,
                                    isExpanded: true,
                                    dropdownColor: _surface,
                                    style: TextStyle(
                                      color: _texto,
                                      fontSize: 13,
                                    ),
                                    decoration: _decoracaoCampo(
                                      'Forma de pagamento',
                                    ),
                                    items: const [
                                      DropdownMenuItem(
                                        value: '',
                                        child: Text('Não definida'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'dinheiro',
                                        child: Text('Dinheiro'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'pix',
                                        child: Text('Pix'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'cartao',
                                        child: Text('Cartão'),
                                      ),
                                      DropdownMenuItem(
                                        value: 'transferencia',
                                        child: Text('Transferência'),
                                      ),
                                    ],
                                    onChanged: salvandoDialog
                                        ? null
                                        : (value) {
                                            if (value != null) {
                                              setDialogState(
                                                () => formaPagamento = value,
                                              );
                                            }
                                          },
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                      ),
                      Divider(height: 1, color: _borda),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
                        child: Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: salvandoDialog
                                    ? null
                                    : () => Navigator.of(dialogContext).pop(),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: _textoSecundario,
                                  side: BorderSide(color: _borda),
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 13,
                                  ),
                                ),
                                child: const Text('Cancelar'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              flex: 2,
                              child: FilledButton.icon(
                                style: FilledButton.styleFrom(
                                  backgroundColor: _purpleDark,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 13,
                                  ),
                                ),
                                onPressed: salvandoDialog
                                    ? null
                                    : () async {
                                        if (!(formKey.currentState
                                                ?.validate() ??
                                            false)) {
                                          return;
                                        }

                                        if (servicoId == null) {
                                          _mensagem('Selecione um serviço.');
                                          return;
                                        }

                                        final payload = <String, dynamic>{
                                          if (clienteId != null)
                                            'cliente_id': clienteId,
                                          'cliente': clienteController.text
                                              .trim(),
                                          'telefone': telefoneController.text
                                              .trim(),
                                          'veiculo': veiculoController.text
                                              .trim(),
                                          'placa': placaController.text.trim(),
                                          'servico_id': servicoId,
                                          'data': dataController.text.trim(),
                                          'hora': horaController.text.trim(),
                                          'valor': _valorNumerico(
                                            valorController.text,
                                          ),
                                          'observacoes': observacoesController
                                              .text
                                              .trim(),
                                          if (agendamento != null) ...{
                                            'status': status,
                                            'status_pagamento': statusPagamento,
                                            'forma_pagamento': formaPagamento,
                                          },
                                        };

                                        setDialogState(
                                          () => salvandoDialog = true,
                                        );

                                        final sucesso =
                                            await _salvarAgendamento(
                                              payload,
                                              id: agendamento?['id'],
                                            );

                                        if (!context.mounted ||
                                            !dialogContext.mounted) {
                                          return;
                                        }

                                        if (sucesso) {
                                          Navigator.of(dialogContext).pop();
                                        } else {
                                          setDialogState(
                                            () => salvandoDialog = false,
                                          );
                                        }
                                      },
                                icon: salvandoDialog
                                    ? const SizedBox(
                                        width: 17,
                                        height: 17,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : const Icon(Icons.check_rounded, size: 18),
                                label: Text(
                                  salvandoDialog
                                      ? 'Salvando...'
                                      : agendamento == null
                                      ? 'Criar'
                                      : 'Salvar',
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
            },
          );
        },
      );
    } finally {
      Future<void>.delayed(const Duration(milliseconds: 500), () {
        clienteController.dispose();
        telefoneController.dispose();
        veiculoController.dispose();
        placaController.dispose();
        valorController.dispose();
        observacoesController.dispose();
        dataController.dispose();
        horaController.dispose();
      });
    }
  }

  // ============================================================
  // SALVAR AGENDAMENTO
  // ============================================================

  Future<bool> _salvarAgendamento(
    Map<String, dynamic> payload, {
    dynamic id,
  }) async {
    if (_salvando || !mounted) return false;

    setState(() => _salvando = true);

    try {
      if (id == null) {
        await ApiClient.post('/agendamentos', payload);
      } else {
        await ApiClient.patch('/agendamentos/$id', payload);
      }

      if (!mounted) return false;

      final data = _parseData(payload['data']);

      setState(() {
        _salvando = false;
        if (data != null) _dataSelecionada = data;
      });

      await _carregarDados();

      if (!mounted) return true;

      _mensagem(
        id == null
            ? 'Agendamento criado com sucesso.'
            : 'Agendamento atualizado com sucesso.',
      );

      return true;
    } on ApiException catch (e) {
      if (mounted) setState(() => _salvando = false);

      if (e.statusCode == 409 && mounted) {
        final continuar = await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (dialogContext) => AlertDialog(
            backgroundColor: _surface,
            title: Text(
              'Conflito de horário',
              style: TextStyle(color: _texto),
            ),
            content: Text(
              '${e.message}\n\nDeseja forçar este agendamento mesmo assim?',
              style: TextStyle(color: _textoSecundario),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: const Text('Escolher outro horário'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(dialogContext).pop(true),
                child: const Text('Forçar horário'),
              ),
            ],
          ),
        );

        if (!mounted) return false;

        if (continuar == true) {
          return _salvarForcandoConflito(payload, id: id);
        }

        return false;
      }

      if (mounted) _mensagem(e.message);
      return false;
    } catch (_) {
      if (mounted) {
        setState(() => _salvando = false);
        _mensagem('Não foi possível salvar o agendamento.');
      }

      return false;
    }
  }

  Future<bool> _salvarForcandoConflito(
    Map<String, dynamic> payload, {
    dynamic id,
  }) async {
    if (_salvando || !mounted) return false;

    setState(() => _salvando = true);

    try {
      final body = <String, dynamic>{...payload, 'forcar_conflito': true};

      if (id == null) {
        await ApiClient.post('/agendamentos', body);
      } else {
        await ApiClient.patch('/agendamentos/$id', body);
      }

      if (!mounted) return false;

      final data = _parseData(payload['data']);

      setState(() {
        _salvando = false;
        if (data != null) _dataSelecionada = data;
      });

      await _carregarDados();

      if (!mounted) return true;

      _mensagem('Agendamento salvo com conflito de horário autorizado.');
      return true;
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _salvando = false);
        _mensagem(e.message);
      }

      return false;
    } catch (_) {
      if (mounted) {
        setState(() => _salvando = false);
        _mensagem('Não foi possível salvar o agendamento.');
      }

      return false;
    }
  }

  // ============================================================
  // EXCLUIR E ALTERAR STATUS
  // ============================================================

  Future<void> _excluirAgendamento(Map<String, dynamic> item) async {
    final id = item['id'];

    if (id == null || _salvando) return;

    final confirmar = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: _surface,
        title: Text(
          'Excluir agendamento?',
          style: TextStyle(color: _texto),
        ),
        content: Text(
          'O agendamento de ${item['cliente'] ?? 'cliente'} '
          'será excluído permanentemente.',
          style: TextStyle(color: _textoSecundario),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: _red),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Excluir'),
          ),
        ],
      ),
    );

    if (confirmar != true || !mounted) return;

    try {
      await ApiClient.delete('/agendamentos/$id');

      if (!mounted) return;

      _mensagem('Agendamento excluído.');
      await _carregarDados();
    } on ApiException catch (e) {
      if (mounted) _mensagem(e.message);
    } catch (_) {
      if (mounted) _mensagem('Não foi possível excluir o agendamento.');
    }
  }

  Future<void> _alterarStatus(
    Map<String, dynamic> item,
    String status,
  ) async {
    if (_salvando) return;

    try {
      await ApiClient.patch('/agendamentos/${item['id']}', {
        'status': status,
      });

      if (!mounted) return;

      _mensagem('Status atualizado.');
      await _carregarDados();
    } on ApiException catch (e) {
      if (mounted) _mensagem(e.message);
    } catch (_) {
      if (mounted) _mensagem('Não foi possível atualizar o status.');
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
          backgroundColor: _surfaceAlt,
          showCloseIcon: true,
        ),
      );
  }

  // ============================================================
  // TELA PRINCIPAL
  // ============================================================

  @override
  Widget build(BuildContext context) {
    final lista = _agendamentosDoDia;

    return Scaffold(
      backgroundColor: _background,
      appBar: AppBar(
        backgroundColor: _background,
        foregroundColor: _texto,
        elevation: 0,
        titleSpacing: 20,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Agenda',
              style: TextStyle(
                color: _texto,
                fontWeight: FontWeight.w800,
                fontSize: 22,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              _tituloAgenda,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: _textoSecundario),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Atualizar',
            onPressed: _salvando ? null : _carregarDados,
            icon: const Icon(Icons.refresh_rounded),
          ),
          const SizedBox(width: 6),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _salvando ? null : () => _abrirFormulario(),
        backgroundColor: _purpleDark,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Novo agendamento'),
      ),
      body: SafeArea(
        child: _carregando
            ? const Center(child: CircularProgressIndicator(color: _purple))
            : _erro != null
            ? _estadoErro()
            : RefreshIndicator(
                color: _purple,
                onRefresh: _carregarDados,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(18, 8, 18, 100),
                  children: [
                    _cabecalhoData(),
                    const SizedBox(height: 18),
                    _resumo(lista),
                    const SizedBox(height: 22),
                    _campoPesquisa(),
                    const SizedBox(height: 12),
                    _filtros(),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Atendimentos do dia',
                            style: TextStyle(
                              color: _texto,
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        Text(
                          '${lista.length} '
                          '${lista.length == 1 ? 'registro' : 'registros'}',
                          style: TextStyle(
                            color: _textoSecundario,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (lista.isEmpty)
                      _estadoVazio()
                    else
                      ...lista.map(_cartaoAgendamento),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _cabecalhoData() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: _temaEscuro
              ? const [
                  Color(0xFF282044),
                  Color(0xFF171523),
                ]
              : const [
                  Color(0xFFEAE4FF),
                  Color(0xFFF5F1FF),
                ],
        ),
        border: Border.all(
          color: _temaEscuro
              ? _purple.withValues(alpha: 0.25)
              : const Color(0xFFDED5FF),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: _purple.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: const Icon(
                  Icons.calendar_month_rounded,
                  color: _purple,
                  size: 25,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _nomeDia(_dataSelecionada),
                      style: TextStyle(
                        color: _temaEscuro
                            ? Colors.white70
                            : const Color(0xFF655B7F),
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      _formatarData(_dataSelecionada),
                      style: TextStyle(
                        color: _temaEscuro ? Colors.white : _texto,
                        fontWeight: FontWeight.w800,
                        fontSize: 20,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: _selecionarData,
                tooltip: 'Selecionar data',
                style: IconButton.styleFrom(
                  backgroundColor: _temaEscuro
                      ? Colors.white.withValues(alpha: 0.07)
                      : _purple.withValues(alpha: 0.09),
                ),
                icon: Icon(
                  Icons.edit_calendar_outlined,
                  color: _temaEscuro ? Colors.white : _purpleDark,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _atalhoDia(
                  'Ontem',
                  Icons.chevron_left_rounded,
                  () => setState(
                    () => _dataSelecionada = DateTime.now().subtract(
                      const Duration(days: 1),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _atalhoDia(
                  'Hoje',
                  Icons.today_outlined,
                  () => setState(() => _dataSelecionada = DateTime.now()),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _atalhoDia(
                  'Amanhã',
                  Icons.chevron_right_rounded,
                  () => setState(
                    () => _dataSelecionada = DateTime.now().add(
                      const Duration(days: 1),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _atalhoDia(String texto, IconData icone, VoidCallback acao) {
    return OutlinedButton.icon(
      onPressed: acao,
      icon: Icon(icone, size: 16),
      label: Text(texto),
      style: OutlinedButton.styleFrom(
        foregroundColor: _temaEscuro ? Colors.white : _purpleDark,
        side: BorderSide(
          color: _temaEscuro
              ? Colors.white.withValues(alpha: 0.12)
              : _purple.withValues(alpha: 0.22),
        ),
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
        textStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  Widget _resumo(List<Map<String, dynamic>> lista) {
    final total = lista.length;
    final confirmados = _contarStatus(lista, 'confirmado');
    final pendentes = _contarStatus(lista, 'agendado');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Resumo do dia',
          style: TextStyle(
            color: _texto,
            fontWeight: FontWeight.w800,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _cardResumo(
                'Agendamentos',
                '$total',
                Icons.event_note_rounded,
                _purple,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _cardResumo(
                'Confirmados',
                '$confirmados',
                Icons.check_circle_outline_rounded,
                _green,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _cardResumo(
                'Pendentes',
                '$pendentes',
                Icons.hourglass_empty_rounded,
                _yellow,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _cardResumo(
                'Valor previsto',
                _moeda(_totalPrevisto(lista)),
                Icons.payments_outlined,
                _blue,
                compacto: true,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _cardResumo(
    String titulo,
    String valor,
    IconData icone,
    Color cor, {
    bool compacto = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _borda),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icone, color: cor, size: 20),
          const SizedBox(height: 12),
          Text(
            valor,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: _texto,
              fontSize: compacto ? 16 : 23,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            titulo,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: _textoSecundario, fontSize: 11),
          ),
        ],
      ),
    );
  }

  Widget _campoPesquisa() {
    return TextField(
      controller: _searchController,
      onChanged: (_) => setState(() {}),
      style: TextStyle(color: _texto),
      decoration: InputDecoration(
        hintText: _usaVeiculo
            ? 'Buscar cliente, telefone, serviço ou placa...'
            : 'Buscar cliente, telefone ou serviço...',
        hintStyle: TextStyle(color: _textoSecundario, fontSize: 13),
        prefixIcon: Icon(Icons.search_rounded, color: _textoSecundario),
        suffixIcon: _searchController.text.isEmpty
            ? null
            : IconButton(
                onPressed: () {
                  _searchController.clear();
                  setState(() {});
                },
                icon: Icon(Icons.close, color: _textoSecundario),
              ),
        filled: true,
        fillColor: _surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: BorderSide(color: _borda),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: const BorderSide(color: _purple),
        ),
      ),
    );
  }

  Widget _filtros() {
    const filtros = <String, String>{
      'todos': 'Todos',
      'agendado': 'Agendados',
      'confirmado': 'Confirmados',
      'em_andamento': 'Em andamento',
      'concluido': 'Concluídos',
      'cancelado': 'Cancelados',
    };

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: filtros.entries.map((entry) {
          final ativo = _filtroStatus == entry.key;

          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Text(entry.value),
              selected: ativo,
              onSelected: (_) => setState(() => _filtroStatus = entry.key),
              selectedColor: _purpleDark,
              backgroundColor: _surface,
              labelStyle: TextStyle(
                color: ativo
                    ? Colors.white
                    : _textoSecundario,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
              side: BorderSide(
                color: ativo ? _purple : _borda,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              showCheckmark: false,
            ),
          );
        }).toList(),
      ),
    );
  }

  // ============================================================
  // CARTÃO DE AGENDAMENTO
  // ============================================================

  Widget _cartaoAgendamento(Map<String, dynamic> item) {
    final status = (item['status'] ?? 'agendado').toString().toLowerCase();
    final cor = _statusColor(status);
    final servico = (item['servico_nome'] ?? 'Serviço').toString();
    final cliente = (item['cliente'] ?? 'Cliente').toString();
    final telefone = (item['telefone'] ?? '').toString();
    final placa = (item['placa'] ?? '').toString();
    final veiculo = (item['veiculo'] ?? '').toString();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(19),
        border: Border.all(color: _borda),
      ),
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Column(
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 58,
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  decoration: BoxDecoration(
                    color: _purple.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    children: [
                      const Icon(Icons.schedule, color: _purple, size: 18),
                      const SizedBox(height: 5),
                      Text(
                        _hora(item['hora']),
                        style: TextStyle(
                          color: _texto,
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        cliente,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: _texto,
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        servico,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: _textoSecundario,
                          fontSize: 12,
                        ),
                      ),
                      if (telefone.isNotEmpty) ...[
                        const SizedBox(height: 5),
                        Text(
                          telefone,
                          style: TextStyle(
                            color: _textoSecundario,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      _moeda(item['valor']),
                      style: TextStyle(
                        color: _texto,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: cor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Text(
                        _statusLabel(status),
                        style: TextStyle(
                          color: cor,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            if (_usaVeiculo && (veiculo.isNotEmpty || placa.isNotEmpty)) ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: 12,
                  runSpacing: 5,
                  children: [
                    if (veiculo.isNotEmpty)
                      _info(Icons.directions_car_outlined, veiculo),
                    if (placa.isNotEmpty)
                      _info(Icons.pin_outlined, placa.toUpperCase()),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            Divider(color: _borda, height: 1),
            const SizedBox(height: 8),
            Row(
              children: [
                _acao(
                  'Editar',
                  Icons.edit_outlined,
                  () => _abrirFormulario(agendamento: item),
                ),
                const SizedBox(width: 8),
                _acao(
                  'Excluir',
                  Icons.delete_outline_rounded,
                  () => _excluirAgendamento(item),
                  cor: _red,
                ),
                const Spacer(),
                if (status != 'confirmado' &&
                    status != 'concluido' &&
                    status != 'cancelado')
                  IconButton(
                    tooltip: 'Confirmar agendamento',
                    visualDensity: VisualDensity.compact,
                    onPressed: _salvando
                        ? null
                        : () => _alterarStatus(item, 'confirmado'),
                    icon: const Icon(
                      Icons.check_circle_outline_rounded,
                      color: _green,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _info(IconData icon, String texto) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: _textoSecundario, size: 14),
        const SizedBox(width: 5),
        Text(
          texto,
          style: TextStyle(color: _textoSecundario, fontSize: 11),
        ),
      ],
    );
  }

  Widget _acao(
    String texto,
    IconData icone,
    VoidCallback acao, {
    Color? cor,
  }) {
    return TextButton.icon(
      onPressed: _salvando ? null : acao,
      icon: Icon(icone, size: 16),
      label: Text(texto),
      style: TextButton.styleFrom(
        foregroundColor: cor ?? _textoSecundario,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }

  // ============================================================
  // ESTADOS VAZIO E ERRO
  // ============================================================

  Widget _estadoVazio() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 34),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _borda),
      ),
      child: Column(
        children: [
          Container(
            width: 62,
            height: 62,
            decoration: BoxDecoration(
              color: _purple.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.event_available_outlined,
              color: _purple,
              size: 30,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Nenhum agendamento encontrado',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _texto,
              fontWeight: FontWeight.w800,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Mude a data ou os filtros, ou crie um novo agendamento.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _textoSecundario,
              fontSize: 12,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _salvando ? null : () => _abrirFormulario(),
            style: FilledButton.styleFrom(
              backgroundColor: _purpleDark,
              foregroundColor: Colors.white,
            ),
            icon: const Icon(Icons.add_rounded),
            label: const Text('Criar agendamento'),
          ),
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
            const Icon(Icons.cloud_off_outlined, size: 48, color: _red),
            const SizedBox(height: 14),
            Text(
              'Não foi possível abrir a agenda',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: _texto,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _erro ?? 'Tente novamente.',
              textAlign: TextAlign.center,
              style: TextStyle(color: _textoSecundario),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: _carregarDados,
              style: FilledButton.styleFrom(
                backgroundColor: _purpleDark,
                foregroundColor: Colors.white,
              ),
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Tentar novamente'),
            ),
          ],
        ),
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;
    if (!iterator.moveNext()) return null;
    return iterator.current;
  }
}