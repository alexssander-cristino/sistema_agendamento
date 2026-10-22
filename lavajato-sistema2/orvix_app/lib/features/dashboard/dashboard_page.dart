import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/orvix_theme_controller.dart';
import '../auth/auth_service.dart';
import '../auth/login_page.dart';
import '../agenda/agenda_page.dart';
import '../clientes/clientes_page.dart';
import '../financeiro/financeiro_page.dart';
import '../servicos/servicos_page.dart';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  static const Color _purple = Color(0xFF7965D8);
  static const Color _purpleDark = Color(0xFF6550C7);
  static const Color _green = Color(0xFF239B70);
  static const Color _red = Color(0xFFD94F68);
  static const Color _yellow = Color(0xFFB98220);

  bool _loading = true;
  bool _loggingOut = false;
  String? _error;

  Map<String, dynamic> _usuario = {};
  Map<String, dynamic> _empresa = {};
  Map<String, dynamic> _resumo = {};
  List<dynamic> _recentes = [];
  List<dynamic> _servicos = [];

  bool get _isDark => OrvixThemeController.instance.isDark;

  Color get _background =>
      _isDark ? const Color(0xFF0C0B12) : const Color(0xFFF6F5FB);

  Color get _surface =>
      _isDark ? const Color(0xFF15131E) : Colors.white;

  Color get _surface2 =>
      _isDark ? const Color(0xFF1D1929) : const Color(0xFFEDEAF7);

  Color get _text =>
      _isDark ? const Color(0xFFF5F2FC) : const Color(0xFF242033);

  Color get _muted =>
      _isDark ? const Color(0xFFAAA4BB) : const Color(0xFF777187);

  Color get _border => _isDark
      ? Colors.white.withValues(alpha: 0.065)
      : const Color(0xFFE4E0EF);

  @override
  void initState() {
    super.initState();
    OrvixThemeController.instance.addListener(_onThemeChanged);
    _carregarDashboard();
  }

  @override
  void dispose() {
    OrvixThemeController.instance.removeListener(_onThemeChanged);
    super.dispose();
  }

  void _onThemeChanged() {
    if (mounted) setState(() {});
  }

  void _alternarTema() {
    OrvixThemeController.instance.toggleTheme();
  }

  Future<void> _carregarDashboard() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final sessao = await ApiClient.get('/auth/me');

      final usuario = _asMap(sessao['usuario']);
      final empresa = _asMap(sessao['empresa']);

      if (usuario['perfil'] == 'dev') {
        throw const ApiException(
          'Esta conta é de desenvolvedor. '
          'O painel DEV será implementado separadamente.',
        );
      }

      final permissoes = usuario['permissoes'];

      final temPermissaoDashboard =
          usuario['perfil'] == 'administrador' ||
          (permissoes is List && permissoes.contains('agenda')) ||
          (permissoes is List && permissoes.contains('faturamento'));

      if (!temPermissaoDashboard) {
        throw const ApiException(
          'Seu usuário não possui permissão para acessar o painel.',
        );
      }

      final dashboard = await ApiClient.get('/dashboard');

      if (!mounted) return;

      setState(() {
        _usuario = usuario;
        _empresa = empresa;
        _resumo = _asMap(dashboard['resumo']);
        _recentes = _asList(dashboard['recentes']);
        _servicos = _asList(dashboard['servicos']);
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;

      if (e.statusCode == 401) {
        await AuthService.logout();

        if (!mounted) return;

        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute<void>(
            builder: (_) => const LoginPage(),
          ),
          (_) => false,
        );

        return;
      }

      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        _error = 'Não foi possível conectar à API do Orvix.';
        _loading = false;
      });
    }
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map) {
      return Map<String, dynamic>.from(value);
    }

    return {};
  }

  List<dynamic> _asList(dynamic value) {
    return value is List ? value : [];
  }

  double _number(String key) {
    final value = _resumo[key];

    if (value is num) return value.toDouble();

    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  String _money(dynamic value) {
    final number = value is num
        ? value.toDouble()
        : double.tryParse(value?.toString() ?? '') ?? 0;

    return 'R\$ ${number.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  String _date(dynamic value) {
    if (value == null) return 'Sem data';

    final raw = value.toString();
    final match =
        RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(raw);

    if (match == null) return raw;

    return '${match.group(3)}/${match.group(2)}/${match.group(1)}';
  }

  String _status(dynamic value) {
    final status = (value ?? '').toString().trim();

    if (status.isEmpty) return 'Sem status';

    return status
        .replaceAll('_', ' ')
        .split(' ')
        .map(
          (part) => part.isEmpty
              ? part
              : '${part[0].toUpperCase()}${part.substring(1)}',
        )
        .join(' ');
  }

  Color _statusColor(dynamic value) {
    final status = (value ?? '').toString().toLowerCase();

    if (status.contains('conclu') || status.contains('pago')) {
      return _green;
    }

    if (status.contains('cancel')) {
      return _red;
    }

    if (status.contains('andamento') || status.contains('confirm')) {
      return _purple;
    }

    return _yellow;
  }

  Future<void> _sair() async {
    if (_loggingOut) return;

    setState(() => _loggingOut = true);

    await AuthService.logout();

    if (!mounted) return;

    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => const LoginPage(),
      ),
      (_) => false,
    );
  }

  Future<void> _abrirPagina(Widget pagina) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => pagina),
    );

    if (mounted) _carregarDashboard();
  }

  void _mostrarModulo(String nome) {
    switch (nome) {
      case 'Agenda':
        _abrirPagina(const AgendaPage());
        return;
      case 'Clientes':
        _abrirPagina(const ClientesPage());
        return;
      case 'Serviços':
        _abrirPagina(const ServicosPage());
        return;
      case 'Financeiro':
        _abrirPagina(const FinanceiroPage());
        return;
    }

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('O módulo $nome será conectado na próxima etapa.'),
          backgroundColor: _surface2,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _background,
      appBar: AppBar(
        backgroundColor: _background,
        foregroundColor: _text,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        titleSpacing: 20,
        title: Row(
          children: [
            const _BrandMark(),
            const SizedBox(width: 10),
            Text(
              'orvix',
              style: TextStyle(
                color: _text,
                fontSize: 22,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.9,
              ),
            ),
          ],
        ),
        actions: [
          // Alternar entre tema claro e escuro.
          IconButton(
            tooltip: _isDark ? 'Ativar tema claro' : 'Ativar tema escuro',
            onPressed: _alternarTema,
            icon: Icon(
              _isDark
                  ? Icons.light_mode_outlined
                  : Icons.dark_mode_outlined,
              color: _text,
            ),
          ),

          // Atualizar o painel.
          IconButton(
            tooltip: 'Atualizar painel',
            onPressed: _loading ? null : _carregarDashboard,
            icon: const Icon(Icons.refresh_rounded),
          ),

          PopupMenuButton<String>(
            tooltip: 'Conta',
            color: _surface2,
            icon: Icon(
              Icons.account_circle_outlined,
              color: _text,
              size: 27,
            ),
            onSelected: (value) {
              if (value == 'sair') _sair();
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                value: 'sair',
                child: Row(
                  children: [
                    const Icon(
                      Icons.logout_rounded,
                      color: _red,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Text(
                      _loggingOut ? 'Saindo...' : 'Sair da conta',
                      style: TextStyle(color: _text),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? Center(
                child: CircularProgressIndicator(color: _purple),
              )
            : _error != null
                ? _buildError()
                : _buildContent(),
      ),
      bottomNavigationBar: _buildBottomNavigation(),
    );
  }

  Widget _buildError() {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Container(
            padding: const EdgeInsets.all(25),
            decoration: _cardDecoration(),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 66,
                  height: 66,
                  decoration: BoxDecoration(
                    color: _red.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(
                    Icons.cloud_off_rounded,
                    size: 32,
                    color: _red,
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  'Não foi possível carregar o painel',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: _text,
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: _muted,
                    height: 1.6,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 22),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _carregarDashboard,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Tentar novamente'),
                    style: FilledButton.styleFrom(
                      backgroundColor: _purpleDark,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(13),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildContent() {
    final nome = _usuario['nome']?.toString() ?? 'Usuário';
    final nomeEmpresa =
        _empresa['nome']?.toString() ?? 'Minha empresa';

    final primeiroNome = nome.trim().split(RegExp(r'\s+')).first;

    return RefreshIndicator(
      onRefresh: _carregarDashboard,
      color: _purple,
      backgroundColor: _surface,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final largura = constraints.maxWidth;
          final horizontal = largura >= 900 ? 32.0 : 18.0;

          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.fromLTRB(horizontal, 16, horizontal, 32),
            children: [
              _buildWelcome(
                primeiroNome.isEmpty ? 'Usuário' : primeiroNome,
                nomeEmpresa,
              ),
              const SizedBox(height: 26),
              _buildSectionHeading(
                'Visão geral',
                'Acompanhe os números da sua empresa.',
              ),
              const SizedBox(height: 15),
              _buildMetricGrid(largura),
              const SizedBox(height: 30),
              _buildSectionHeading(
                'Agendamentos recentes',
                'Acompanhe os últimos registros.',
                trailing: _buildCountBadge(_recentes.length),
              ),
              const SizedBox(height: 15),
              if (_recentes.isEmpty)
                _emptyCard(
                  icon: Icons.calendar_today_outlined,
                  message: 'Nenhum agendamento encontrado.',
                  description:
                      'Quando houver registros, eles aparecerão aqui.',
                )
              else
                ..._recentes.take(10).map(_buildAppointmentCard),
              const SizedBox(height: 30),
              _buildSectionHeading(
                'Serviços em destaque',
                'Resumo por faturamento.',
              ),
              const SizedBox(height: 15),
              if (_servicos.isEmpty)
                _emptyCard(
                  icon: Icons.design_services_outlined,
                  message: 'Nenhum serviço encontrado.',
                  description:
                      'Os serviços cadastrados aparecerão nesta seção.',
                )
              else
                ..._servicos.take(5).map(_buildServiceCard),
              const SizedBox(height: 30),
              _buildQuickActions(),
              const SizedBox(height: 12),
              Center(
                child: Text(
                  'Orvix · Gestão da sua empresa',
                  style: TextStyle(
                    color: _muted.withValues(alpha: 0.7),
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildWelcome(String nome, String empresa) {
    final gradientColors = _isDark
        ? const [
            Color(0xFF29203E),
            Color(0xFF191627),
            Color(0xFF171521),
          ]
        : const [
            Color(0xFFEAE4FF),
            Color(0xFFF5F1FF),
            Color(0xFFFFFFFF),
          ];

    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradientColors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(23),
        border: Border.all(
          color: _purple.withValues(alpha: 0.20),
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -30,
            top: -42,
            child: Container(
              width: 145,
              height: 145,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _purple.withValues(alpha: 0.07),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 37,
                    height: 37,
                    decoration: BoxDecoration(
                      color: _purple.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.waving_hand_rounded,
                      color: _purple,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      empresa,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: _purple,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: _green.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(30),
                      border: Border.all(
                        color: _green.withValues(alpha: 0.18),
                      ),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.circle, color: _green, size: 7),
                        SizedBox(width: 6),
                        Text(
                          'Conectado',
                          style: TextStyle(
                            color: _green,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 23),
              Text(
                'Olá, $nome!',
                style: TextStyle(
                  color: _text,
                  fontSize: 27,
                  height: 1.2,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.8,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Tudo o que acontece na sua empresa, '
                'em um só lugar.',
                style: TextStyle(
                  color: _muted,
                  fontSize: 13,
                  height: 1.6,
                ),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  const Icon(
                    Icons.auto_awesome_rounded,
                    size: 15,
                    color: _purple,
                  ),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      'Seu negócio. Sua gestão. Orvix.',
                      style: TextStyle(
                        color: _text,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Icon(
                    Icons.arrow_forward_rounded,
                    color: _purple.withValues(alpha: 0.8),
                    size: 18,
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeading(
    String title,
    String subtitle, {
    Widget? trailing,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: _text,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.35,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                subtitle,
                style: TextStyle(
                  color: _muted,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
        if (trailing != null) ...[
          const SizedBox(width: 10),
          trailing,
        ],
      ],
    );
  }

  Widget _buildCountBadge(int count) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
      decoration: BoxDecoration(
        color: _purple.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        '$count registros',
        style: const TextStyle(
          color: _purple,
          fontSize: 10,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  Widget _buildMetricGrid(double width) {
    final columns = width >= 1150
        ? 4
        : width >= 650
            ? 3
            : 2;

    final metrics = [
      _Metric(
        title: 'Faturamento',
        value: _money(_number('faturamento')),
        icon: Icons.trending_up_rounded,
        color: _green,
        description: 'Total faturado',
      ),
      _Metric(
        title: 'Despesas',
        value: _money(_number('despesas')),
        icon: Icons.receipt_long_rounded,
        color: _red,
        description: 'Total de despesas',
      ),
      _Metric(
        title: 'Resultado',
        value: _money(_number('resultado')),
        icon: Icons.account_balance_wallet_outlined,
        color: _purple,
        description: 'Saldo do período',
      ),
      _Metric(
        title: 'Agendamentos',
        value: _number('agendamentos').toInt().toString(),
        icon: Icons.calendar_month_rounded,
        color: _yellow,
        description: 'Total registrado',
      ),
      _Metric(
        title: 'Concluídos',
        value: _number('concluidos').toInt().toString(),
        icon: Icons.check_circle_outline_rounded,
        color: _green,
        description: 'Atendimentos concluídos',
      ),
      _Metric(
        title: 'Pendentes',
        value: _number('pendentes').toInt().toString(),
        icon: Icons.pending_actions_rounded,
        color: _yellow,
        description: 'Aguardando conclusão',
      ),
      _Metric(
        title: 'Recebido',
        value: _money(_number('valor_pago')),
        icon: Icons.payments_outlined,
        color: _purple,
        description: 'Valores recebidos',
      ),
      _Metric(
        title: 'A receber',
        value: _money(_number('valor_pendente')),
        icon: Icons.hourglass_bottom_rounded,
        color: _red,
        description: 'Valores pendentes',
      ),
    ];

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: metrics.length,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        mainAxisExtent: 143,
      ),
      itemBuilder: (context, index) => _buildMetricCard(metrics[index]),
    );
  }

  Widget _buildMetricCard(_Metric metric) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 37,
                height: 37,
                decoration: BoxDecoration(
                  color: metric.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(metric.icon, color: metric.color, size: 20),
              ),
              const Spacer(),
              Icon(
                Icons.more_horiz_rounded,
                color: _muted.withValues(alpha: 0.65),
                size: 19,
              ),
            ],
          ),
          const Spacer(),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              metric.value,
              maxLines: 1,
              style: TextStyle(
                color: _text,
                fontSize: 20,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.6,
              ),
            ),
          ),
          const SizedBox(height: 5),
          Text(
            metric.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: _muted,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppointmentCard(dynamic item) {
    final appointment = _asMap(item);
    final status = appointment['status'];
    final color = _statusColor(status);

    final cliente = appointment['cliente']?.toString() ?? 'Cliente';
    final servico =
        appointment['servico_nome']?.toString() ?? 'Serviço não informado';
    final hora = appointment['hora']?.toString() ?? '';
    final data = _date(appointment['data']);

    return Container(
      margin: const EdgeInsets.only(bottom: 11),
      padding: const EdgeInsets.all(15),
      decoration: _cardDecoration(),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 43,
            height: 43,
            decoration: BoxDecoration(
              color: _purple.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(13),
            ),
            child: const Icon(
              Icons.event_note_rounded,
              color: _purple,
              size: 21,
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
                    color: _text,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  servico,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: _muted, fontSize: 11),
                ),
                const SizedBox(height: 9),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _smallInfo(Icons.calendar_today_outlined, data),
                    if (hora.isNotEmpty)
                      _smallInfo(Icons.access_time_rounded, hora),
                  ],
                ),
                const SizedBox(height: 10),
                _statusBadge(status, color),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              _money(appointment['valor']),
              textAlign: TextAlign.end,
              style: TextStyle(
                color: _text,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _smallInfo(IconData icon, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: _muted),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(color: _muted, fontSize: 10),
        ),
      ],
    );
  }

  Widget _statusBadge(dynamic status, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.11),
        borderRadius: BorderRadius.circular(7),
      ),
      child: Text(
        _status(status),
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  Widget _buildServiceCard(dynamic item) {
    final service = _asMap(item);
    final nome = service['nome']?.toString() ?? 'Serviço';
    final quantidade = service['quantidade']?.toString() ?? '0';
    final faturamento = _money(service['faturamento']);

    return Container(
      margin: const EdgeInsets.only(bottom: 11),
      padding: const EdgeInsets.all(15),
      decoration: _cardDecoration(),
      child: Row(
        children: [
          Container(
            width: 43,
            height: 43,
            decoration: BoxDecoration(
              color: _purple.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(13),
            ),
            child: const Icon(
              Icons.design_services_outlined,
              color: _purple,
              size: 21,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  nome,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: _text,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  '$quantidade atendimentos',
                  style: TextStyle(color: _muted, fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              faturamento,
              textAlign: TextAlign.end,
              style: const TextStyle(
                color: _green,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptyCard({
    required IconData icon,
    required String message,
    required String description,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 25),
      decoration: _cardDecoration(),
      child: Column(
        children: [
          Container(
            width: 49,
            height: 49,
            decoration: BoxDecoration(
              color: _purple.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(15),
            ),
            child: Icon(icon, color: _purple, size: 23),
          ),
          const SizedBox(height: 13),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _text,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            description,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _muted,
              fontSize: 11,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActions() {
    final actions = [
      (
        'Agenda',
        Icons.calendar_month_outlined,
        () => _mostrarModulo('Agenda'),
      ),
      (
        'Clientes',
        Icons.people_outline_rounded,
        () => _mostrarModulo('Clientes'),
      ),
      (
        'Serviços',
        Icons.design_services_outlined,
        () => _mostrarModulo('Serviços'),
      ),
      (
        'Financeiro',
        Icons.account_balance_wallet_outlined,
        () => _mostrarModulo('Financeiro'),
      ),
    ];

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Acesso rápido',
            style: TextStyle(
              color: _text,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            'Encontre rapidamente as principais áreas.',
            style: TextStyle(color: _muted, fontSize: 12),
          ),
          const SizedBox(height: 17),
          ...actions.map((action) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 9),
              child: Material(
                color: _surface2,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  onTap: action.$3,
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 13,
                      vertical: 13,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 35,
                          height: 35,
                          decoration: BoxDecoration(
                            color: _purple.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            action.$2,
                            color: _purple,
                            size: 19,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            action.$1,
                            style: TextStyle(
                              color: _text,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        Icon(
                          Icons.arrow_forward_ios_rounded,
                          color: _muted,
                          size: 14,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildBottomNavigation() {
    return NavigationBar(
      backgroundColor: _surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: _purple.withValues(alpha: 0.15),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      onDestinationSelected: (index) {
        const names = [
          'Painel',
          'Agenda',
          'Clientes',
          'Financeiro',
        ];

        if (index != 0) _mostrarModulo(names[index]);
      },
      selectedIndex: 0,
      destinations: [
        NavigationDestination(
          icon: Icon(Icons.grid_view_rounded, color: _muted),
          selectedIcon: const Icon(
            Icons.grid_view_rounded,
            color: _purple,
          ),
          label: 'Painel',
        ),
        NavigationDestination(
          icon: Icon(Icons.calendar_month_outlined, color: _muted),
          label: 'Agenda',
        ),
        NavigationDestination(
          icon: Icon(Icons.people_outline_rounded, color: _muted),
          label: 'Clientes',
        ),
        NavigationDestination(
          icon: Icon(
            Icons.account_balance_wallet_outlined,
            color: _muted,
          ),
          label: 'Financeiro',
        ),
      ],
    );
  }

  BoxDecoration _cardDecoration() {
    return BoxDecoration(
      color: _surface,
      borderRadius: BorderRadius.circular(17),
      border: Border.all(color: _border),
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 35,
      height: 35,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [
            Color(0xFFB6A5FF),
            Color(0xFF8064EE),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Icon(
        Icons.blur_on_rounded,
        color: Colors.white,
        size: 24,
      ),
    );
  }
}

class _Metric {
  final String title;
  final String value;
  final IconData icon;
  final Color color;
  final String description;

  const _Metric({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
    required this.description,
  });
}
