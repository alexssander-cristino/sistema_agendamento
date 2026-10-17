import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';

class FinanceiroPage extends StatefulWidget {
  const FinanceiroPage({super.key});

  @override
  State<FinanceiroPage> createState() => _FinanceiroPageState();
}

class _FinanceiroPageState extends State<FinanceiroPage> {
  static const Color _fundo = Color(0xFF0F1020);
  static const Color _painel = Color(0xFF191A30);
  static const Color _roxo = Color(0xFF8B5CF6);
  static const Color _texto = Color(0xFFF4F3FF);
  static const Color _secundario = Color(0xFFA6A4C2);
  static const Color _verde = Color(0xFF35C99A);
  static const Color _vermelho = Color(0xFFEF6464);
  static const Color _laranja = Color(0xFFFFB454);

  bool _carregando = false;
  bool _dadosIncompletos = false;
  String? _erro;
  String _periodo = '30 dias';

  List<Map<String, dynamic>> _agendamentos = [];
  List<Map<String, dynamic>> _despesas = [];
  List<Map<String, dynamic>> _contas = [];

  @override
  void initState() {
    super.initState();
    _carregarDados();
  }

  // CORRIGIDO: antes se chamava `_texto`, o mesmo nome da cor acima.
  String _s(dynamic valor, [String padrao = '']) {
    if (valor == null) return padrao;
    return valor.toString();
  }

  double _valor(dynamic valor) {
    if (valor is num) return valor.toDouble();
    return double.tryParse(
          valor?.toString().replaceAll(',', '.') ?? '',
        ) ??
        0;
  }

  String _moeda(num valor) {
    final partes = valor.toStringAsFixed(2).split('.');
    final inteiro = partes[0].replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => '.',
    );
    return 'R\$ $inteiro,${partes[1]}';
  }

  // Usa só a parte da data (AAAA-MM-DD) para evitar deslocamento de fuso.
  DateTime? _data(dynamic valor) {
    final texto = valor?.toString().trim() ?? '';
    if (texto.isEmpty) return null;

    try {
      return DateTime.parse(
        texto.length >= 10 ? texto.substring(0, 10) : texto,
      );
    } catch (_) {
      return null;
    }
  }

  String _dataFormatada(dynamic valor) {
    final data = _data(valor);
    if (data == null) return 'Sem data';

    return '${data.day.toString().padLeft(2, '0')}/'
        '${data.month.toString().padLeft(2, '0')}/'
        '${data.year}';
  }

  bool _concluido(Map<String, dynamic> item) {
    final status = _s(item['status']).toLowerCase().trim();
    return status == 'concluido' || status == 'concluído';
  }

  bool _cancelado(Map<String, dynamic> item) {
    return _s(item['status']).toLowerCase().trim() == 'cancelado';
  }

  bool _dentroDoPeriodo(dynamic valor) {
    final data = _data(valor);
    if (data == null) return false;

    final agora = DateTime.now();
    final hoje = DateTime(agora.year, agora.month, agora.day);

    final inicio = switch (_periodo) {
      '7 dias' => hoje.subtract(const Duration(days: 7)),
      '90 dias' => hoje.subtract(const Duration(days: 90)),
      'Este ano' => DateTime(agora.year),
      _ => hoje.subtract(const Duration(days: 30)),
    };

    return !data.isBefore(inicio) && !data.isAfter(hoje);
  }

  List<Map<String, dynamic>> _comoMapas(List<dynamic> lista) {
    return lista
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<void> _carregarDados() async {
    setState(() {
      _carregando = true;
      _erro = null;
      _dadosIncompletos = false;
    });

    try {
      // CORRIGIDO: ApiClient.get só devolve Map; listas exigem getList.
      // Os agendamentos são obrigatórios (são a base das receitas).
      final agendamentos = await ApiClient.getList('/agendamentos');

      // Despesas e contas são opcionais: se a rota não existir no backend,
      // a tela continua funcionando e avisa que os dados estão incompletos.
      // Confirme os caminhos abaixo com as rotas registradas no backend.
      var falhouOpcional = false;

      Future<List<dynamic>> opcional(String rota) async {
        try {
          return await ApiClient.getList(rota);
        } catch (_) {
          falhouOpcional = true;
          return <dynamic>[];
        }
      }

      final extras = await Future.wait([
        opcional('/despesas'),
        opcional('/contas-financeiras'),
      ]);

      if (!mounted) return;

      setState(() {
        _agendamentos = _comoMapas(agendamentos);
        _despesas = _comoMapas(extras[0]);
        _contas = _comoMapas(extras[1]);
        _dadosIncompletos = falhouOpcional;
        _carregando = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _carregando = false;
        _erro = e is ApiException
            ? e.message
            : 'Não foi possível carregar os dados financeiros.';
      });
    }
  }

  List<Map<String, dynamic>> get _agendamentosPeriodo {
    return _agendamentos.where((item) {
      return _dentroDoPeriodo(item['data']) && !_cancelado(item);
    }).toList();
  }

  List<Map<String, dynamic>> get _despesasPeriodo {
    return _despesas.where((item) {
      return _dentroDoPeriodo(item['data']);
    }).toList();
  }

  double get _receitas {
    return _agendamentosPeriodo
        .where(_concluido)
        .fold<double>(0, (total, item) => total + _valor(item['valor']));
  }

  double get _despesasTotal {
    return _despesasPeriodo.fold<double>(
      0,
      (total, item) => total + _valor(item['valor']),
    );
  }

  double get _saldo => _receitas - _despesasTotal;

  double get _totalContasPagar {
    return _contas.where((item) {
      final tipo = _s(item['tipo']).toLowerCase();
      final status = _s(item['status']).toLowerCase();
      return tipo.contains('pagar') &&
          !status.contains('pago') &&
          !status.contains('cancelado');
    }).fold<double>(0, (total, item) => total + _valor(item['valor']));
  }

  double get _totalContasReceber {
    return _contas.where((item) {
      final tipo = _s(item['tipo']).toLowerCase();
      final status = _s(item['status']).toLowerCase();
      return tipo.contains('receber') &&
          !status.contains('recebido') &&
          !status.contains('cancelado');
    }).fold<double>(0, (total, item) => total + _valor(item['valor']));
  }

  Widget _indicador({
    required String titulo,
    required String valor,
    required IconData icone,
    required Color cor,
    String? descricao,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _painel,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: cor.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icone, color: cor, size: 20),
              ),
            ],
          ),
          const Spacer(),
          Text(
            titulo,
            style: const TextStyle(color: _secundario, fontSize: 12),
          ),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              valor,
              style: const TextStyle(
                color: _texto,
                fontSize: 23,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          if (descricao != null) ...[
            const SizedBox(height: 5),
            Text(
              descricao,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: _secundario, fontSize: 10),
            ),
          ],
        ],
      ),
    );
  }

  Widget _secaoTitulo(String titulo, {String? subtitulo}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            titulo,
            style: const TextStyle(
              color: _texto,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (subtitulo != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitulo,
              style: const TextStyle(color: _secundario, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }

  Widget _cartaoMovimentacao({
    required IconData icone,
    required Color cor,
    required String titulo,
    required String subtitulo,
    required String valor,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _painel,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: cor.withValues(alpha: 0.13),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icone, color: cor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _texto,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  subtitulo,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: _secundario, fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            valor,
            style: TextStyle(
              color: cor,
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }

  Widget _estadoVazio(String mensagem) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(25),
      decoration: BoxDecoration(
        color: _painel,
        borderRadius: BorderRadius.circular(17),
      ),
      child: Column(
        children: [
          const Icon(
            Icons.receipt_long_outlined,
            color: _roxo,
            size: 36,
          ),
          const SizedBox(height: 10),
          Text(
            mensagem,
            textAlign: TextAlign.center,
            style: const TextStyle(color: _secundario, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _avisoDadosIncompletos() {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: _laranja.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: _laranja.withValues(alpha: 0.30)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.warning_amber_rounded, color: _laranja, size: 19),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Não foi possível carregar as despesas ou as contas '
              'financeiras. Os valores abaixo podem estar incompletos.',
              style: TextStyle(color: _laranja, fontSize: 11, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }

  Widget _conteudo() {
    final movimentacoes = <Map<String, dynamic>>[];

    for (final item in _agendamentosPeriodo.where(_concluido)) {
      movimentacoes.add({
        ...item,
        '_origem': 'receita',
        '_data_movimento': item['data'],
        '_titulo': item['cliente'] ??
            item['servico_nome'] ??
            item['servico'] ??
            'Atendimento',
      });
    }

    for (final item in _despesasPeriodo) {
      movimentacoes.add({
        ...item,
        '_origem': 'despesa',
        '_data_movimento': item['data'],
        '_titulo': item['descricao'] ?? item['categoria'] ?? 'Despesa',
      });
    }

    movimentacoes.sort((a, b) {
      final dataA = _data(a['_data_movimento']) ?? DateTime(1970);
      final dataB = _data(b['_data_movimento']) ?? DateTime(1970);
      return dataB.compareTo(dataA);
    });

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 100),
      children: [
        if (_dadosIncompletos) _avisoDadosIncompletos(),
        Container(
          padding: const EdgeInsets.all(17),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF292047), Color(0xFF191A30)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: _roxo.withValues(alpha: 0.25)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.account_balance_wallet_outlined, color: _roxo),
                  SizedBox(width: 9),
                  Text(
                    'Resultado do período',
                    style: TextStyle(color: _secundario, fontSize: 12),
                  ),
                ],
              ),
              const SizedBox(height: 13),
              Text(
                _moeda(_saldo),
                style: TextStyle(
                  color: _saldo >= 0 ? _verde : _vermelho,
                  fontSize: 30,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Receitas concluídas menos despesas registradas.',
                style: TextStyle(color: _secundario, fontSize: 11),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        _secaoTitulo(
          'Visão geral',
          subtitulo: 'Indicadores do período selecionado',
        ),
        // CORRIGIDO: altura fixa em vez de childAspectRatio, que causava
        // overflow em telas estreitas.
        GridView(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            mainAxisExtent: 150,
          ),
          children: [
            _indicador(
              titulo: 'Receitas',
              valor: _moeda(_receitas),
              icone: Icons.south_west_rounded,
              cor: _verde,
              descricao: 'Atendimentos concluídos',
            ),
            _indicador(
              titulo: 'Despesas',
              valor: _moeda(_despesasTotal),
              icone: Icons.north_east_rounded,
              cor: _vermelho,
              descricao: 'Despesas registradas',
            ),
            _indicador(
              titulo: 'A pagar',
              valor: _moeda(_totalContasPagar),
              icone: Icons.schedule_rounded,
              cor: _laranja,
              descricao: 'Contas pendentes',
            ),
            _indicador(
              titulo: 'A receber',
              valor: _moeda(_totalContasReceber),
              icone: Icons.payments_outlined,
              cor: _roxo,
              descricao: 'Contas pendentes',
            ),
          ],
        ),
        const SizedBox(height: 24),
        _secaoTitulo('Movimentações recentes'),
        if (movimentacoes.isEmpty)
          _estadoVazio('Nenhuma movimentação encontrada neste período.')
        else
          ...movimentacoes.take(30).map((item) {
            final receita = item['_origem'] == 'receita';
            return _cartaoMovimentacao(
              icone: receita
                  ? Icons.south_west_rounded
                  : Icons.north_east_rounded,
              cor: receita ? _verde : _vermelho,
              titulo: _s(item['_titulo'], 'Movimentação'),
              subtitulo: '${receita ? 'Receita' : 'Despesa'} • '
                  '${_dataFormatada(item['_data_movimento'])}',
              valor: '${receita ? '+' : '-'}'
                  '${_moeda(_valor(item['valor']))}',
            );
          }),
        const SizedBox(height: 14),
        _secaoTitulo('Contas financeiras'),
        if (_contas.isEmpty)
          _estadoVazio(
            _dadosIncompletos
                ? 'Não foi possível carregar as contas financeiras.'
                : 'Nenhuma conta financeira cadastrada.',
          )
        else
          ..._contas.take(10).map((item) {
            final status = _s(item['status'], 'Pendente');
            final tipo = _s(item['tipo'], 'Conta');
            return _cartaoMovimentacao(
              icone: Icons.receipt_long_outlined,
              cor: status.toLowerCase().contains('vencid')
                  ? _vermelho
                  : _laranja,
              titulo: _s(
                item['descricao'] ?? item['titulo'] ?? item['nome'],
                tipo,
              ),
              subtitulo: '$tipo • $status • '
                  '${_dataFormatada(item['vencimento'] ?? item['data'])}',
              valor: _moeda(_valor(item['valor'])),
            );
          }),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
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
              'Financeiro',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 2),
            Text(
              'Receitas, despesas e contas',
              style: TextStyle(color: _secundario, fontSize: 12),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Atualizar dados',
            onPressed: _carregando ? null : _carregarDados,
            icon: const Icon(Icons.refresh_rounded),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 4),
              child: Row(
                children: [
                  const Icon(
                    Icons.calendar_month_outlined,
                    color: _secundario,
                    size: 19,
                  ),
                  const SizedBox(width: 9),
                  const Expanded(
                    child: Text(
                      'Período de análise',
                      style: TextStyle(color: _secundario, fontSize: 12),
                    ),
                  ),
                  DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _periodo,
                      dropdownColor: _painel,
                      style: const TextStyle(
                        color: _texto,
                        fontSize: 12,
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: '7 dias',
                          child: Text('7 dias'),
                        ),
                        DropdownMenuItem(
                          value: '30 dias',
                          child: Text('30 dias'),
                        ),
                        DropdownMenuItem(
                          value: '90 dias',
                          child: Text('90 dias'),
                        ),
                        DropdownMenuItem(
                          value: 'Este ano',
                          child: Text('Este ano'),
                        ),
                      ],
                      onChanged: (valor) {
                        if (valor != null) {
                          setState(() => _periodo = valor);
                        }
                      },
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
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.cloud_off_outlined,
                                  color: _vermelho,
                                  size: 42,
                                ),
                                const SizedBox(height: 12),
                                const Text(
                                  'Falha ao carregar o financeiro',
                                  style: TextStyle(
                                    color: _texto,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  _erro!,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(color: _secundario),
                                ),
                                const SizedBox(height: 16),
                                FilledButton.icon(
                                  onPressed: _carregarDados,
                                  style: FilledButton.styleFrom(
                                    backgroundColor: _roxo,
                                  ),
                                  icon: const Icon(Icons.refresh),
                                  label: const Text('Tentar novamente'),
                                ),
                              ],
                            ),
                          ),
                        )
                      : RefreshIndicator(
                          color: _roxo,
                          onRefresh: _carregarDados,
                          child: _conteudo(),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}