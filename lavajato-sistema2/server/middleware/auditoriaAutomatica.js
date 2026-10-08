const { registrarAuditoria } = require('../service/auditoria');

/**
 * ============================================================
 * AUDITORIA AUTOMÁTICA
 * ============================================================
 *
 * Registra automaticamente operações de:
 *
 * POST   -> criação
 * PUT    -> atualização
 * PATCH  -> atualização
 * DELETE -> exclusão
 *
 * O registro acontece somente quando a requisição termina
 * com sucesso (2xx ou 3xx).
 *
 * Não registra:
 * - GET
 * - OPTIONS
 * - requisições sem usuário autenticado
 * - respostas de erro
 *
 * A auditoria nunca deve derrubar a operação principal.
 * ============================================================
 */

function auditoriaAutomatica(req, res, next) {

  const metodo = String(
    req.method || ''
  ).toUpperCase();

  const metodosAuditaveis = [
    'POST',
    'PUT',
    'PATCH',
    'DELETE'
  ];

  if (
    !metodosAuditaveis.includes(metodo)
  ) {
    return next();
  }

  /**
   * Alguns endpoints não representam alteração de dados
   * da empresa e não devem poluir os logs.
   */
  const caminho = String(
    req.originalUrl ||
    req.path ||
    ''
  );

  const caminhosIgnorados = [
    '/api/auth/login',
    '/api/auth/cadastro',
    '/api/auth/esqueci-senha',
    '/api/auth/redefinir-senha',
    '/api/mercado-pago/webhook'
  ];

  const ignorado = caminhosIgnorados.some(
    rota => caminho.startsWith(rota)
  );

  /**
   * Mesmo ignorado, continua normalmente.
   */
  if (ignorado) {
    return next();
  }

  /**
   * IMPORTANTE:
   *
   * O middleware fica antes das rotas.
   * A autenticação de cada rota pode preencher
   * req.usuario somente depois.
   *
   * Por isso o registro é feito no evento "finish".
   */
  res.on('finish', async () => {

    try {

      /**
       * Só audita respostas bem-sucedidas.
       *
       * 200 - OK
       * 201 - Created
       * 202 - Accepted
       * 204 - No Content
       * etc.
       */
      if (
        res.statusCode < 200 ||
        res.statusCode >= 400
      ) {
        return;
      }

      /**
       * Sem usuário autenticado, não há empresa segura
       * para associar ao log.
       */
      if (
        !req.usuario ||
        !req.usuario.id ||
        !req.usuario.empresa_id
      ) {
        return;
      }

      const entidade =
        identificarEntidade(caminho);

      const acao =
        identificarAcao(metodo);

      const entidadeId =
        identificarEntidadeId(req);

      const campos =
        obterCamposAlterados(req);

      await registrarAuditoria(
        req,
        {
          acao,
          entidade,
          entidadeId,

          detalhes: {
            origem: 'auditoria_automatica',

            metodo,

            rota: limparRota(caminho),

            status: res.statusCode,

            ...(campos.length > 0
              ? {
                  campos
                }
              : {})
          }
        }
      );

    } catch (erro) {

      /**
       * Auditoria jamais pode quebrar o sistema.
       */
      console.error(
        '[AUDITORIA AUTOMATICA] Erro:',
        erro.message
      );
    }

  });

  next();
}


/**
 * ============================================================
 * IDENTIFICAR AÇÃO
 * ============================================================
 */

function identificarAcao(metodo) {

  switch (metodo) {

    case 'POST':
      return 'criacao';

    case 'PUT':
    case 'PATCH':
      return 'atualizacao';

    case 'DELETE':
      return 'exclusao';

    default:
      return 'operacao';

  }
}


/**
 * ============================================================
 * IDENTIFICAR ENTIDADE
 * ============================================================
 */

function identificarEntidade(caminho) {

  const partes =
    caminho
      .split('?')[0]
      .split('/')
      .filter(Boolean);

  /**
   * Procura o primeiro segmento depois de /api.
   */
  const indiceApi =
    partes.indexOf('api');

  if (
    indiceApi === -1 ||
    !partes[indiceApi + 1]
  ) {
    return 'sistema';
  }

  let entidade =
    partes[indiceApi + 1];

  /**
   * Remove nomes técnicos muito específicos.
   */
  entidade =
    entidade
      .replace(/-/g, '_')
      .toLowerCase();

  /**
   * Padronizações.
   */
  const mapa = {

    servicos: 'servico',

    agendamentos: 'agendamento',

    despesas: 'despesa',

    usuarios: 'usuario',

    configuracoes: 'empresa',

    clientes: 'cliente',

    faturamento: 'faturamento',

    financeiro: 'financeiro',

    planos: 'plano',

    'mercado-pago': 'mercado_pago',

    privacidade: 'privacidade',

    admin: 'administracao'

  };

  return mapa[entidade] || entidade;
}


/**
 * ============================================================
 * IDENTIFICAR ID
 * ============================================================
 */

function identificarEntidadeId(req) {

  const parametros =
    req.params || {};

  const candidatos = [
    parametros.id,
    parametros.id_usuario,
    parametros.usuario_id,
    parametros.servico_id,
    parametros.agendamento_id,
    parametros.despesa_id,
    parametros.cliente_id
  ];

  for (
    const valor of candidatos
  ) {

    if (
      valor === undefined ||
      valor === null ||
      valor === ''
    ) {
      continue;
    }

    const numero =
      Number(valor);

    if (
      Number.isInteger(numero) &&
      numero > 0
    ) {
      return numero;
    }
  }

  return null;
}


/**
 * ============================================================
 * CAMPOS ALTERADOS
 * ============================================================
 *
 * NÃO salva senha, token ou dados secretos.
 *
 * O objetivo é mostrar no log:
 *
 * "O usuário alterou: nome, preço, duração"
 *
 * em vez de guardar dados sensíveis da requisição.
 * ============================================================
 */

function obterCamposAlterados(req) {

  const body =
    req.body;

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return [];
  }

  const camposBloqueados =
    new Set([

      'senha',

      'password',

      'nova_senha',

      'senha_atual',

      'confirmar_senha',

      'token',

      'access_token',

      'refresh_token',

      'reset_token',

      'codigo',

      'authorization',

      'cookie',

      'jwt',

      'secret',

      'client_secret',

      'senha_hash'

    ]);

  return Object.keys(body)
    .filter(
      campo =>
        !camposBloqueados.has(
          String(campo)
            .toLowerCase()
        )
    )
    .slice(0, 50);
}


/**
 * ============================================================
 * LIMPAR ROTA
 * ============================================================
 *
 * Não registra query string porque ela pode conter
 * informações desnecessárias.
 * ============================================================
 */

function limparRota(url) {

  return String(
    url || ''
  )
    .split('?')[0]
    .slice(0, 300);
}


module.exports = auditoriaAutomatica;