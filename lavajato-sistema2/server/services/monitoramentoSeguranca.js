'use strict';

const { enviarAlertaSeguranca } = require('./firebaseNotific');

const janelas = new Map();
const ultimoAlerta = new Map();

const JANELA_MS = 5 * 60 * 1000;
const INTERVALO_ALERTA_MS = 15 * 60 * 1000;

function obterIp(req) {
  // req.ip depende da configuração correta de trust proxy.
  return String(req.ip || req.socket?.remoteAddress || 'desconhecido')
    .slice(0, 100);
}

function obterRota(req) {
  return String(req.originalUrl || req.path || '/')
    .split('?')[0]
    .slice(0, 180);
}

function enviarSemBloquear(chave, titulo, corpo) {
  const agora = Date.now();
  const ultimo = ultimoAlerta.get(chave) || 0;

  if (agora - ultimo < INTERVALO_ALERTA_MS) return;

  // Define o cooldown antes do envio para evitar disparos simultâneos.
  ultimoAlerta.set(chave, agora);

  enviarAlertaSeguranca({
    titulo,
    corpo,
    link: '/admin/logs'
  }).catch((erro) => {
    console.error('[ORVIX SEGURANÇA] Falha no alerta:', {
      codigo: erro?.codigoDiagnostico || erro?.code || null
    });
  });
}

function contarEvento(chave, limite, agora = Date.now()) {
  const anteriores = janelas.get(chave) || [];

  const recentes = anteriores.filter(
    (tempo) => agora - tempo < JANELA_MS
  );

  recentes.push(agora);
  janelas.set(chave, recentes);

  // Limita o tamanho do armazenamento em memória.
  if (janelas.size > 5000) {
    for (const [key, tempos] of janelas) {
      if (!tempos.length || agora - tempos[tempos.length - 1] > JANELA_MS) {
        janelas.delete(key);
      }
    }
  }

  return recentes.length >= limite;
}

function registrarRateLimit(req, codigo = 'RATE_LIMIT') {
  const ip = obterIp(req);
  const rota = obterRota(req);
  const chave = `rate-limit:${codigo}:${ip}`;

  enviarSemBloquear(
    chave,
    'Orvix — Limite de requisições atingido',
    `Tipo: ${codigo}. Rota: ${rota}. Método: ${req.method}. HTTP 429.`
  );
}

function analisarRequisicao(req, status) {
  const metodo = String(req.method || '').toUpperCase();
  const rota = obterRota(req);
  const ip = obterIp(req);
  const caminho = rota.toLowerCase();

  // Login recusado: alerta após várias falhas no período.
  const ehLogin =
    metodo === 'POST' &&
    (
      caminho === '/api/auth/login' ||
      caminho === '/api/auth'
    );

  if (ehLogin && status >= 400 && status < 500 && status !== 429) {
    const chave = `login:${ip}`;

    if (contarEvento(chave, 5)) {
      enviarSemBloquear(
        `alerta-login:${ip}`,
        'Orvix — Múltiplas falhas de login',
        `Foram detectadas várias tentativas de login recusadas. Rota: ${rota}. HTTP ${status}.`
      );
    }
  }

  // Cadastro concluído: registrar um aviso de segurança.
  const ehCadastro =
    metodo === 'POST' &&
    (
      caminho === '/api/auth/cadastro' ||
      caminho === '/api/auth/register'
    );

  if (ehCadastro && status >= 200 && status < 300) {
    enviarSemBloquear(
      'novo-cadastro',
      'Orvix — Novo cadastro',
      'Um novo cadastro foi concluído. Consulte os logs do sistema para verificar os detalhes.'
    );
  }

  // Detecta erros repetidos sem alertar a cada requisição.
  if ([401, 403, 500, 502, 503].includes(status)) {
    const categoria = status >= 500 ? 'erro-servidor' : 'acesso-negado';
    const chave = `${categoria}:${status}:${ip}`;

    if (contarEvento(chave, 5)) {
      enviarSemBloquear(
        `alerta:${chave}`,
        status >= 500
          ? 'Orvix — Erros de servidor recorrentes'
          : 'Orvix — Padrão suspeito de acesso',
        `Foram detectadas ocorrências repetidas. Rota: ${rota}. Método: ${metodo}. HTTP ${status}.`
      );
    }
  }

  // Alterações administrativas bem-sucedidas.
  const rotaAdministrativa =
    caminho.startsWith('/api/admin/') ||
    caminho.startsWith('/api/usuarios/') ||
    caminho.startsWith('/api/configuracoes/');

  const metodoAlteracao = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo);

  if (
    rotaAdministrativa &&
    metodoAlteracao &&
    status >= 200 &&
    status < 300
  ) {
    const chave = `admin:${metodo}:${rota}`;

    enviarSemBloquear(
      chave,
      'Orvix — Alteração administrativa',
      `Uma alteração administrativa foi concluída. Método: ${metodo}. Rota: ${rota}. HTTP ${status}.`
    );
  }
}

module.exports = {
  analisarRequisicao,
  registrarRateLimit
};
