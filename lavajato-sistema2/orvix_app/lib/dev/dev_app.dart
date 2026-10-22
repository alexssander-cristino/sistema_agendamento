import 'dart:async';

import 'package:flutter/material.dart';

import '../core/network/api_client.dart';

const Color bg = Color(0xFF080A12);
const Color panel = Color(0xFF121626);
const Color panel2 = Color(0xFF1B2033);
const Color purple = Color(0xFF9B7BFF);
const Color cyan = Color(0xFF54E4D3);
const Color red = Color(0xFFFF647C);
const Color amber = Color(0xFFFFC76A);
const Color muted = Color(0xFF929BB2);

Map<String, dynamic> asMap(dynamic value) {
  if (value is Map) {
    return Map<String, dynamic>.from(value);
  }
  return <String, dynamic>{};
}

List<Map<String, dynamic>> asList(dynamic value) {
  if (value is! List) return [];

  return value
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList();
}

String display(dynamic value) => value?.toString() ?? '—';

int number(dynamic value) {
  if (value is num) return value.toInt();
  return int.tryParse('$value') ?? 0;
}

String errorMessage(Object error) {
  if (error is ApiException) return error.message;
  return error.toString().replaceFirst('Exception: ', '');
}

enum DevSection {
  dashboard,
  companies,
  users,
  subscriptions,
  payments,
  monitoring,
  logs,
  incidents,
  treatments,
  updates,
}

extension DevSectionInfo on DevSection {
  String get label {
    switch (this) {
      case DevSection.dashboard:
        return 'Visão geral';
      case DevSection.companies:
        return 'Empresas';
      case DevSection.users:
        return 'Usuários';
      case DevSection.subscriptions:
        return 'Assinaturas';
      case DevSection.payments:
        return 'Pagamentos';
      case DevSection.monitoring:
        return 'Monitoramento';
      case DevSection.logs:
        return 'Logs do sistema';
      case DevSection.incidents:
        return 'Incidentes';
      case DevSection.treatments:
        return 'Tratamento de dados';
      case DevSection.updates:
        return 'Central de novidades';
    }
  }

  IconData get icon {
    switch (this) {
      case DevSection.dashboard:
        return Icons.grid_view_rounded;
      case DevSection.companies:
        return Icons.apartment_rounded;
      case DevSection.users:
        return Icons.people_alt_outlined;
      case DevSection.subscriptions:
        return Icons.autorenew_rounded;
      case DevSection.payments:
        return Icons.receipt_long_outlined;
      case DevSection.monitoring:
        return Icons.monitor_heart_outlined;
      case DevSection.logs:
        return Icons.article_outlined;
      case DevSection.incidents:
        return Icons.health_and_safety_outlined;
      case DevSection.treatments:
        return Icons.shield_outlined;
      case DevSection.updates:
        return Icons.campaign_outlined;
    }
  }
}

class OrvixDevApp extends StatelessWidget {
  const OrvixDevApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Orvix Dev',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: purple,
          brightness: Brightness.dark,
          surface: panel,
        ),
        scaffoldBackgroundColor: bg,
        appBarTheme: const AppBarTheme(
          backgroundColor: bg,
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: panel2,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide.none,
          ),
        ),
        cardTheme: CardThemeData(
          color: panel,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: BorderSide(
              color: Colors.white.withValues(alpha: 0.06),
            ),
          ),
        ),
      ),
      home: const DevGate(),
    );
  }
}

class DevGate extends StatefulWidget {
  const DevGate({super.key});

  @override
  State<DevGate> createState() => _DevGateState();
}

class _DevGateState extends State<DevGate> {
  bool checking = true;
  bool authenticated = false;

  @override
  void initState() {
    super.initState();
    verifySession();
  }

  Future<void> verifySession() async {
    try {
      final token = await ApiClient.getToken();

      if (token != null && token.isNotEmpty) {
        final response = await ApiClient.get('/auth/me');
        final user = asMap(response['usuario']);

        authenticated = user['perfil'] == 'dev';

        if (!authenticated) {
          await ApiClient.clearSession();
        }
      }
    } catch (_) {
      authenticated = false;
      await ApiClient.clearSession();
    }

    if (mounted) {
      setState(() => checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (checking) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (authenticated) return const DevHome();

    return DevLogin(
      onSuccess: () {
        setState(() => authenticated = true);
      },
    );
  }
}

class DevLogin extends StatefulWidget {
  const DevLogin({super.key, required this.onSuccess});

  final VoidCallback onSuccess;

  @override
  State<DevLogin> createState() => _DevLoginState();
}

class _DevLoginState extends State<DevLogin> {
  final email = TextEditingController();
  final password = TextEditingController();

  bool loading = false;
  bool obscure = true;
  String? error;

  Future<void> login() async {
    if (email.text.trim().isEmpty || password.text.isEmpty) {
      setState(() => error = 'Informe seu e-mail e senha.');
      return;
    }

    setState(() {
      loading = true;
      error = null;
    });

    try {
      final response = await ApiClient.post(
        '/auth/login',
        {
          'email': email.text.trim(),
          'senha': password.text,
        },
        authenticated: false,
      );

      final token = response['token']?.toString();
      final user = asMap(response['usuario']);

      if (token == null || token.isEmpty) {
        throw const ApiException('A API não retornou um token válido.');
      }

      if (user['perfil'] != 'dev') {
        await ApiClient.clearSession();

        throw const ApiException(
          'Acesso negado. Entre com uma conta de desenvolvedor.',
        );
      }

      await ApiClient.saveToken(token);

      // O perfil é conferido novamente no servidor.
      final me = await ApiClient.get('/auth/me');

      if (asMap(me['usuario'])['perfil'] != 'dev') {
        await ApiClient.clearSession();

        throw const ApiException(
          'O servidor não confirmou o perfil dev.',
        );
      }

      if (mounted) widget.onSuccess();
    } catch (e) {
      if (mounted) {
        setState(() => error = errorMessage(e));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 54,
                    height: 54,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [purple, Color(0xFF5542C7)],
                      ),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(
                      Icons.bubble_chart_rounded,
                      size: 32,
                    ),
                  ),
                  const SizedBox(height: 28),
                  const Text(
                    'ORVIX DEV',
                    style: TextStyle(
                      color: cyan,
                      letterSpacing: 3,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Console de controle',
                    style: TextStyle(
                      fontSize: 29,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Acesso restrito à equipe de desenvolvimento.',
                    style: TextStyle(color: muted),
                  ),
                  const SizedBox(height: 28),
                  TextField(
                    controller: email,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      labelText: 'E-mail',
                      prefixIcon: Icon(Icons.alternate_email),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: password,
                    obscureText: obscure,
                    onSubmitted: (_) => login(),
                    decoration: InputDecoration(
                      labelText: 'Senha',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        onPressed: () {
                          setState(() => obscure = !obscure);
                        },
                        icon: Icon(
                          obscure
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 14),
                    Text(error!, style: const TextStyle(color: red)),
                  ],
                  const SizedBox(height: 22),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: FilledButton(
                      onPressed: loading ? null : login,
                      child: loading
                          ? const CircularProgressIndicator()
                          : const Text('Entrar com segurança'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class DevHome extends StatefulWidget {
  const DevHome({super.key});

  @override
  State<DevHome> createState() => _DevHomeState();
}

class _DevHomeState extends State<DevHome> {
  DevSection section = DevSection.dashboard;

  final search = TextEditingController();

  bool loading = false;
  String? error;
  DateTime? lastRefresh;
  Timer? timer;

  Map<String, dynamic> dashboard = {};
  Map<String, dynamic> status = {};
  Map<String, dynamic> logSummary = {};

  List<Map<String, dynamic>> companies = [];
  List<Map<String, dynamic>> users = [];
  List<Map<String, dynamic>> subscriptions = [];
  List<Map<String, dynamic>> payments = [];
  List<Map<String, dynamic>> logs = [];
  List<Map<String, dynamic>> incidents = [];
  List<Map<String, dynamic>> treatments = [];
  List<Map<String, dynamic>> updates = [];

  @override
  void initState() {
    super.initState();
    refreshData();

    timer = Timer.periodic(const Duration(seconds: 45), (_) {
      if (mounted && section == DevSection.dashboard) {
        refreshData(silent: true);
      }
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    search.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> safeGet(String path) async {
    try {
      return await ApiClient.get(path);
    } catch (e) {
      return {'_error': errorMessage(e)};
    }
  }

  Future<List<Map<String, dynamic>>> safeList(String path) async {
    try {
      final items = await ApiClient.getList(path);
      return items
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    } catch (_) {
      return <Map<String, dynamic>>[];
    }
  }

  Future<void> refreshData({bool silent = false}) async {
    if (loading) return;

    setState(() {
      loading = true;
      if (!silent) error = null;
    });

    try {
      // Todas estas rotas existem no backend consultado.
      final results = await Future.wait<dynamic>([
        safeGet('/admin/dashboard'),
        safeGet('/admin/status'),
        safeGet('/admin/empresas'),
        safeGet('/admin/usuarios'),
        safeGet('/admin/assinaturas'),
        safeGet('/admin/pagamentos'),
        safeGet('/admin/logs'),
        safeGet('/admin/logs/resumo'),
        safeGet('/admin/info'),
        safeList('/admin/incidentes'),
        safeList('/admin/tratamentos'),
        safeGet('/admin/novidades'),
      ]);

      if (!mounted) return;

      setState(() {
        dashboard = asMap(results[0]);
        status = asMap(results[1]);
        companies = asList(asMap(results[2])['empresas']);
        users = asList(asMap(results[3])['usuarios']);
        subscriptions = asList(asMap(results[4])['assinaturas']);
        payments = asList(asMap(results[5])['pagamentos']);
        logs = asList(asMap(results[6])['logs']);
        logSummary = asMap(results[7]);
        incidents = asList(results[9]);
        treatments = asList(results[10]);
        updates = asList(asMap(results[11])['novidades']);

        final failures = results
            .whereType<Map>()
            .where((result) => result.containsKey('_error'));

        if (failures.isNotEmpty && !silent) {
          error = '${failures.length} consulta(s) falharam. '
              'Confira a conexão e os logs.';
        }

        lastRefresh = DateTime.now();
      });
    } catch (e) {
      if (mounted) setState(() => error = errorMessage(e));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  List<Map<String, dynamic>> get currentItems {
    switch (section) {
      case DevSection.companies:
        return companies;
      case DevSection.users:
        return users;
      case DevSection.subscriptions:
        return subscriptions;
      case DevSection.payments:
        return payments;
      case DevSection.logs:
        return logs;
      case DevSection.incidents:
        return incidents;
      case DevSection.treatments:
        return treatments;
      case DevSection.updates:
        return updates;
      default:
        return [];
    }
  }

  String itemTitle(Map<String, dynamic> item) {
    switch (section) {
      case DevSection.companies:
        return display(item['nome']);
      case DevSection.users:
        return display(item['nome'] ?? item['email']);
      case DevSection.subscriptions:
        return 'Assinatura #${display(item['id'])}';
      case DevSection.payments:
        return display(item['empresa_nome'] ?? item['descricao']);
      case DevSection.logs:
        return display(item['acao'] ?? item['descricao']);
      case DevSection.incidents:
        return display(item['titulo']);
      case DevSection.treatments:
        return display(item['processo']);
      case DevSection.updates:
        return display(item['titulo']);
      default:
        return 'Registro';
    }
  }

  String itemSubtitle(Map<String, dynamic> item) {
    switch (section) {
      case DevSection.companies:
        return '${display(item['email'])} • ID ${display(item['id'])}';
      case DevSection.users:
        return '${display(item['email'])} • ${display(item['perfil'])}';
      case DevSection.subscriptions:
        return '${display(item['status'])} • ${display(item['plano_nome'])}';
      case DevSection.payments:
        return '${display(item['status'])} • Valor ${display(item['valor'])}';
      case DevSection.logs:
        return '${display(item['metodo'])} ${display(item['rota'])} • HTTP ${display(item['status_http'])}';
      case DevSection.incidents:
        return '${display(item['gravidade'])} • ${display(item['status'])}';
      case DevSection.treatments:
        return '${display(item['finalidade'])} • Ativo: ${display(item['ativo'])}';
      case DevSection.updates:
        return '${display(item['categoria'])} • ${display(item['status'])}';
      default:
        return '';
    }
  }

  Future<void> perform(
    String successMessage,
    Future<void> Function() action,
  ) async {
    try {
      await action();

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(successMessage)),
      );

      await refreshData();
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(errorMessage(e)),
          backgroundColor: red,
        ),
      );
    }
  }

  Future<bool> confirm(String title, String message) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirmar'),
          ),
        ],
      ),
    );

    return result == true;
  }

  Future<void> subscriptionAction(
    Map<String, dynamic> item,
    String action,
  ) async {
    final id = item['id'];

    final labels = {
      'cancelar': 'Cancelar assinatura',
      'pausar': 'Pausar assinatura',
      'reativar': 'Reativar assinatura',
    };

    final label = labels[action]!;

    final ok = await confirm(
      label,
      'Assinatura #$id\n'
          'Empresa: ${display(item['empresa_nome'])}\n'
          'Status: ${display(item['status'])}\n\n'
          'A API fará a operação correspondente no Mercado Pago. '
          'Confirme apenas se deseja continuar.',
    );

    if (!ok) return;

    await perform(label, () async {
      await ApiClient.patch('/admin/assinaturas/$id/$action', {});
    });
  }

  Future<void> createIncident() async {
    final title = TextEditingController();
    final type = TextEditingController(text: 'operacional');
    final description = TextEditingController();

    String severity = 'media';

    final payload = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Registrar incidente'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: title,
                  decoration: const InputDecoration(labelText: 'Título'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: type,
                  decoration: const InputDecoration(labelText: 'Tipo'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: description,
                  minLines: 3,
                  maxLines: 5,
                  decoration: const InputDecoration(
                    labelText: 'Descrição',
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: severity,
                  decoration: const InputDecoration(
                    labelText: 'Gravidade',
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'baixa',
                      child: Text('Baixa'),
                    ),
                    DropdownMenuItem(
                      value: 'media',
                      child: Text('Média'),
                    ),
                    DropdownMenuItem(
                      value: 'alta',
                      child: Text('Alta'),
                    ),
                    DropdownMenuItem(
                      value: 'critica',
                      child: Text('Crítica'),
                    ),
                  ],
                  onChanged: (value) {
                    setLocal(() => severity = value ?? 'media');
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () {
                if (title.text.trim().isEmpty ||
                    type.text.trim().isEmpty ||
                    description.text.trim().isEmpty) {
                  return;
                }

                Navigator.pop(context, {
                  'titulo': title.text.trim(),
                  'tipo': type.text.trim(),
                  'descricao': description.text.trim(),
                  'gravidade': severity,
                  'status': 'aberto',
                });
              },
              child: const Text('Registrar'),
            ),
          ],
        ),
      ),
    );

    final titleText = title.text;
    title.dispose();
    type.dispose();
    description.dispose();

    if (payload == null || titleText.isEmpty) return;

    await perform('Incidente registrado.', () async {
      await ApiClient.post('/admin/incidentes', payload);
    });
  }

  Future<void> createUpdate() async {
    final title = TextEditingController();
    final summary = TextEditingController();
    final message = TextEditingController();

    String category = 'melhoria';

    final payload = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Criar rascunho'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: title,
                  decoration: const InputDecoration(labelText: 'Título'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: summary,
                  decoration: const InputDecoration(labelText: 'Resumo'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: message,
                  minLines: 3,
                  maxLines: 6,
                  decoration: const InputDecoration(labelText: 'Mensagem'),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: category,
                  decoration: const InputDecoration(
                    labelText: 'Categoria',
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'novidade',
                      child: Text('Novidade'),
                    ),
                    DropdownMenuItem(
                      value: 'melhoria',
                      child: Text('Melhoria'),
                    ),
                    DropdownMenuItem(
                      value: 'correcao',
                      child: Text('Correção'),
                    ),
                    DropdownMenuItem(
                      value: 'aviso',
                      child: Text('Aviso'),
                    ),
                  ],
                  onChanged: (value) {
                    setLocal(() => category = value ?? 'melhoria');
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () {
                if (title.text.trim().isEmpty ||
                    message.text.trim().isEmpty) {
                  return;
                }

                Navigator.pop(context, {
                  'titulo': title.text.trim(),
                  'resumo': summary.text.trim(),
                  'mensagem': message.text.trim(),
                  'categoria': category,
                });
              },
              child: const Text('Salvar rascunho'),
            ),
          ],
        ),
      ),
    );

    title.dispose();
    summary.dispose();
    message.dispose();

    if (payload == null) return;

    await perform('Rascunho criado.', () async {
      await ApiClient.post('/admin/novidades', payload);
    });
  }

  Future<void> publishUpdate(Map<String, dynamic> item) async {
    final id = item['id'];
    if (id == null) return;

    final ok = await confirm(
      'Publicar novidade',
      'Deseja publicar "${display(item['titulo'])}"? '
          'Essa ação pode disparar notificações para usuários.',
    );

    if (!ok) return;

    await perform('Novidade publicada.', () async {
      await ApiClient.post('/admin/novidades/$id/publicar', {});
    });
  }

  Future<void> archiveUpdate(Map<String, dynamic> item) async {
    final id = item['id'];
    if (id == null) return;

    final ok = await confirm(
      'Arquivar novidade',
      'Confirma o arquivamento de "${display(item['titulo'])}"?',
    );

    if (!ok) return;

    await perform('Novidade arquivada.', () async {
      await ApiClient.post('/admin/novidades/$id/arquivar', {});
    });
  }

  Future<void> updateIncident(Map<String, dynamic> item) async {
    final id = item['id'];
    if (id == null) return;

    final statuses = [
      'aberto',
      'em_analise',
      'contido',
      'resolvido',
      'encerrado',
    ];

    String selected = statuses.contains(item['status'])
        ? item['status'].toString()
        : 'aberto';

    final newStatus = await showDialog<String>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: Text('Incidente #$id'),
          content: DropdownButtonFormField<String>(
            initialValue: selected,
            decoration: const InputDecoration(labelText: 'Novo status'),
            items: statuses
                .map(
                  (s) => DropdownMenuItem(
                    value: s,
                    child: Text(s.replaceAll('_', ' ')),
                  ),
                )
                .toList(),
            onChanged: (v) {
              if (v != null) setLocal(() => selected = v);
            },
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, selected),
              child: const Text('Atualizar'),
            ),
          ],
        ),
      ),
    );

    if (newStatus == null) return;

    await perform('Incidente atualizado.', () async {
      await ApiClient.patch('/admin/incidentes/$id', {
        'titulo': item['titulo'],
        'tipo': item['tipo'],
        'descricao': item['descricao'],
        'gravidade': item['gravidade'],
        'status': newStatus,
        'data_identificacao': item['data_identificacao'],
        'sistemas_afetados': item['sistemas_afetados'],
        'dados_afetados': item['dados_afetados'],
        'titulares_afetados': item['titulares_afetados'],
        'medidas_adotadas': item['medidas_adotadas'],
        'responsavel': item['responsavel'],
        'conclusao': item['conclusao'],
      });
    });
  }

  Future<void> logout() async {
    try {
      await ApiClient.post('/auth/logout', {});
    } catch (_) {
      // A limpeza local continua mesmo se a API estiver indisponível.
    }

    await ApiClient.clearSession();

    if (!mounted) return;

    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const DevGate()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 850;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          section.label,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          if (loading)
            const Padding(
              padding: EdgeInsets.all(14),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          IconButton(
            tooltip: 'Atualizar',
            onPressed: loading ? null : refreshData,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      drawer: wide ? null : Drawer(child: SafeArea(child: navigation())),
      body: Row(
        children: [
          if (wide) SizedBox(width: 240, child: navigation()),
          Expanded(
            child: RefreshIndicator(
              onRefresh: refreshData,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (error != null) ...[
                    Text(error!, style: const TextStyle(color: amber)),
                    const SizedBox(height: 12),
                  ],
                  if (section == DevSection.dashboard) dashboardView(),
                  if (section == DevSection.monitoring) monitoringView(),
                  if (section != DevSection.dashboard &&
                      section != DevSection.monitoring)
                    recordsView(),
                  if (lastRefresh != null) ...[
                    const SizedBox(height: 20),
                    Text(
                      'Sincronizado às '
                      '${lastRefresh!.hour.toString().padLeft(2, '0')}:'
                      '${lastRefresh!.minute.toString().padLeft(2, '0')}:'
                      '${lastRefresh!.second.toString().padLeft(2, '0')}',
                      style: const TextStyle(color: muted, fontSize: 11),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget navigation() {
    return Container(
      color: bg,
      padding: const EdgeInsets.all(10),
      child: ListView(
        children: [
          const Padding(
            padding: EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'ORVIX',
                  style: TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 3,
                  ),
                ),
                Text(
                  'DEV CONSOLE',
                  style: TextStyle(
                    color: cyan,
                    fontSize: 10,
                    letterSpacing: 2,
                  ),
                ),
              ],
            ),
          ),
          for (final item in DevSection.values)
            ListTile(
              selected: section == item,
              selectedTileColor: purple.withValues(alpha: 0.16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              leading: Icon(
                item.icon,
                color: section == item ? purple : muted,
                size: 20,
              ),
              title: Text(
                item.label,
                style: TextStyle(
                  fontSize: 12,
                  color: section == item ? Colors.white : muted,
                ),
              ),
              onTap: () {
                setState(() {
                  section = item;
                  searchClear();
                });
                if (MediaQuery.sizeOf(context).width < 850) {
                  Navigator.pop(context);
                }
              },
            ),
          const Divider(color: panel2),
          ListTile(
            leading: const Icon(Icons.logout, color: red),
            title: const Text('Sair'),
            onTap: logout,
          ),
        ],
      ),
    );
  }

  void searchClear() {
    // Mantido como ponto único para limpar filtros ao trocar de área.
  }

  Widget dashboardView() {
    final companiesData = asMap(dashboard['empresas']);
    final usersData = asMap(dashboard['usuarios']);
    final plansData = asMap(dashboard['planos']);
    final subsData = asMap(dashboard['assinaturas']);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF28204D), Color(0xFF101626)],
            ),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: purple.withValues(alpha: 0.25)),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'PLATFORM OPERATIONS',
                style: TextStyle(
                  color: cyan,
                  fontSize: 10,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w800,
                ),
              ),
              SizedBox(height: 10),
              Text(
                'Controle operacional',
                style: TextStyle(fontSize: 25, fontWeight: FontWeight.w800),
              ),
              SizedBox(height: 7),
              Text(
                'Indicadores, operações administrativas e saúde do sistema.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'Indicadores principais',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 12),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: MediaQuery.sizeOf(context).width > 650 ? 4 : 2,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: 1.35,
          children: [
            metric('Empresas', companiesData['total'], Icons.apartment, purple),
            metric('Usuários', usersData['total'], Icons.people, cyan),
            metric('Planos ativos', plansData['ativos'], Icons.layers, amber),
            metric('Assinaturas ativas', subsData['ativas'], Icons.autorenew, cyan),
            metric('Pendentes', subsData['pendentes'], Icons.hourglass_top, amber),
            metric('Inadimplentes', subsData['inadimplentes'], Icons.warning, red),
            metric('Requisições hoje', logSummary['requisicoes_hoje'], Icons.bolt, cyan),
            metric('Requisições com erro', logSummary['requisicoes_com_erro'], Icons.error_outline, red),
          ],
        ),
        const SizedBox(height: 22),
        const Text(
          'Saúde da plataforma',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        healthRow('API', status['api']),
        healthRow('Banco PostgreSQL', status['banco']),
        healthRow('Ambiente', status['ambiente']),
        healthRow('Tempo de resposta', '${display(status['tempo_resposta_ms'])} ms'),
        const SizedBox(height: 22),
        const Text(
          'Atividade recente',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        if (logs.isEmpty)
          const Text('Nenhum log disponível.', style: TextStyle(color: muted))
        else
          ...logs.take(6).map(
            (item) => Card(
              child: ListTile(
                leading: const Icon(Icons.bolt, color: purple),
                title: Text(display(item['acao'] ?? item['descricao'])),
                subtitle: Text(
                  '${display(item['metodo'])} ${display(item['rota'])}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: Text(display(item['status_http'])),
              ),
            ),
          ),
        const SizedBox(height: 22),
        const Text(
          'Distribuição de assinaturas',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        subscriptionBars(subsData),
      ],
    );
  }

  Widget metric(
    String label,
    dynamic value,
    IconData icon,
    Color color,
  ) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(13),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Icon(icon, color: color),
            Text(
              display(value),
              style: const TextStyle(
                fontSize: 25,
                fontWeight: FontWeight.w800,
              ),
            ),
            Text(
              label,
              style: const TextStyle(color: muted, fontSize: 11),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  Widget healthRow(String label, dynamic value) {
    final text = display(value);
    final good = text == 'online';

    return Card(
      child: ListTile(
        leading: Icon(
          good ? Icons.check_circle_outline : Icons.monitor_heart_outlined,
          color: good ? cyan : amber,
        ),
        title: Text(label),
        trailing: Text(
          text,
          style: TextStyle(
            color: good ? cyan : Colors.white70,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Widget subscriptionBars(Map<String, dynamic> data) {
    final active = number(data['ativas']);
    final pending = number(data['pendentes']);
    final late = number(data['inadimplentes']);
    final maxValue = [active, pending, late, 1].reduce((a, b) => a > b ? a : b);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            bar('Ativas', active, maxValue, cyan),
            bar('Pendentes', pending, maxValue, amber),
            bar('Inadimplentes', late, maxValue, red),
          ],
        ),
      ),
    );
  }

  Widget bar(String label, int value, int maxValue, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(child: Text(label, style: const TextStyle(color: muted))),
              Text('$value', style: const TextStyle(fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 7),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              height: 7,
              child: Stack(
                children: [
                  Container(color: Colors.white10),
                  FractionallySizedBox(
                    widthFactor: value / maxValue,
                    child: Container(color: color),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget monitoringView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Diagnóstico do sistema',
          style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text(
          'Dados retornados pelos endpoints existentes.',
          style: TextStyle(color: muted),
        ),
        const SizedBox(height: 14),
        healthRow('API', status['api']),
        healthRow('Banco de dados', status['banco']),
        healthRow('Ambiente', status['ambiente']),
        healthRow('Latência', '${display(status['tempo_resposta_ms'])} ms'),
        const SizedBox(height: 20),
        metric(
          'Total de requisições',
          logSummary['total_requisicoes'],
          Icons.all_inclusive,
          purple,
        ),
        metric(
          'Requisições de hoje',
          logSummary['requisicoes_hoje'],
          Icons.today,
          cyan,
        ),
        metric(
          'Respostas com erro',
          logSummary['requisicoes_com_erro'],
          Icons.error_outline,
          red,
        ),
        metric(
          'IPs únicos registrados',
          logSummary['ips_unicos'],
          Icons.hub_outlined,
          amber,
        ),
        const SizedBox(height: 16),
        const Text(
          'Limite do diagnóstico',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text(
          'Esta tela consulta a API, o banco e os logs. '
          'Ela não executa restauração de backup, reinício de serviços '
          'ou reparo automático, porque essas operações não estão '
          'disponíveis nas rotas confirmadas.',
          style: TextStyle(color: muted, height: 1.5),
        ),
      ],
    );
  }

  Widget recordsView() {
    final items = currentItems;
    final filtered = items.where((item) {
      final q = search.text.trim().toLowerCase();
      return q.isEmpty || item.toString().toLowerCase().contains(q);
    }).toList();

    final canCreateIncident = section == DevSection.incidents;
    final canCreateUpdate = section == DevSection.updates;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                section.label,
                style: const TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            if (canCreateIncident)
              IconButton.filledTonal(
                onPressed: createIncident,
                icon: const Icon(Icons.add),
                tooltip: 'Novo incidente',
              ),
            if (canCreateUpdate)
              IconButton.filledTonal(
                onPressed: createUpdate,
                icon: const Icon(Icons.add),
                tooltip: 'Novo rascunho',
              ),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          controller: search,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: 'Pesquisar ${section.label.toLowerCase()}...',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: IconButton(
              onPressed: () {
                search.clear();
                setState(() {});
              },
              icon: const Icon(Icons.close),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          '${filtered.length} registro(s)',
          style: const TextStyle(color: muted, fontSize: 12),
        ),
        const SizedBox(height: 8),
        if (filtered.isEmpty)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(
              child: Text(
                'Nenhum registro encontrado ou a API não retornou dados.',
                textAlign: TextAlign.center,
                style: TextStyle(color: muted),
              ),
            ),
          )
        else
          ...filtered.map((item) {
            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                onTap: () => openRecord(item),
                leading: Icon(section.icon, color: purple),
                title: Text(
                  itemTitle(item),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    itemSubtitle(item),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                trailing: section == DevSection.updates &&
                        item['status'] == 'rascunho'
                    ? PopupMenuButton<String>(
                        onSelected: (value) {
                          if (value == 'publicar') publishUpdate(item);
                          if (value == 'arquivar') archiveUpdate(item);
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(
                            value: 'publicar',
                            child: Text('Publicar'),
                          ),
                          PopupMenuItem(
                            value: 'arquivar',
                            child: Text('Arquivar'),
                          ),
                        ],
                      )
                    : section == DevSection.incidents
                        ? const Icon(Icons.chevron_right)
                        : const Icon(Icons.open_in_new, size: 17),
              ),
            );
          }),
        if (section == DevSection.subscriptions) ...[
          const SizedBox(height: 12),
          const Text(
            'Abra uma assinatura para consultar os detalhes e executar '
            'ações confirmadas. A API decide se a operação é permitida.',
            style: TextStyle(color: muted, fontSize: 12, height: 1.5),
          ),
        ],
      ],
    );
  }

  void openRecord(Map<String, dynamic> item) {
    if (section == DevSection.subscriptions) {
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: panel,
        builder: (context) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Assinatura #${display(item['id'])}',
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 12),
                Text('Empresa: ${display(item['empresa_nome'])}'),
                Text('Plano: ${display(item['plano_nome'])}'),
                Text('Status: ${display(item['status'])}'),
                Text('ID Mercado Pago: ${display(item['mercado_pago_id'])}'),
                const SizedBox(height: 18),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (item['status'] == 'ativa')
                      OutlinedButton(
                        onPressed: () {
                          Navigator.pop(context);
                          subscriptionAction(item, 'pausar');
                        },
                        child: const Text('Pausar'),
                      ),
                    if ([
                      'ativa',
                      'pendente',
                      'inadimplente',
                      'pausada',
                    ].contains(item['status']))
                      FilledButton.tonal(
                        onPressed: () {
                          Navigator.pop(context);
                          subscriptionAction(item, 'cancelar');
                        },
                        child: const Text('Cancelar'),
                      ),
                    if (['pausada', 'inadimplente'].contains(item['status']))
                      FilledButton(
                        onPressed: () {
                          Navigator.pop(context);
                          subscriptionAction(item, 'reativar');
                        },
                        child: const Text('Reativar'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
      return;
    }

    if (section == DevSection.incidents) {
      updateIncident(item);
      return;
    }

    if (section == DevSection.companies && item['id'] != null) {
      perform('Detalhes consultados.', () async {
        final result = await ApiClient.get('/admin/empresas/${item['id']}');
        if (mounted) showJsonDetails(result);
      });
      return;
    }

    if (section == DevSection.users && item['id'] != null) {
      perform('Detalhes consultados.', () async {
        final result = await ApiClient.get('/admin/usuarios/${item['id']}');
        if (mounted) showJsonDetails(result);
      });
      return;
    }

    if (section == DevSection.logs && item['id'] != null) {
      perform('Log consultado.', () async {
        final result = await ApiClient.get('/admin/logs/${item['id']}');
        if (mounted) showJsonDetails(result);
      });
      return;
    }

    showJsonDetails(item);
  }

  void showJsonDetails(Map<String, dynamic> data) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Detalhes'),
        content: SizedBox(
          width: 500,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: data.entries.map((entry) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry.key.replaceAll('_', ' ').toUpperCase(),
                        style: const TextStyle(
                          color: muted,
                          fontSize: 10,
                          letterSpacing: 1,
                        ),
                      ),
                      const SizedBox(height: 3),
                      SelectableText(display(entry.value)),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Fechar'),
          ),
        ],
      ),
    );
  }
}
