
'use strict';

const pool = require('../db');

const {
  enviarPushParaEmpresa,
  enviarPushParaUsuario
} = require('./push');

const TIPOS_PERMITIDOS = [
  'info',
  'sucesso',
  'alerta',
  'erro',
  'agendamento',
  'financeiro',
  'sistema',
  'novidade',
  'cliente',
  'meta'
];

const LIMITES = {
  titulo: 160,
  mensagem: 5000,
  link: 2048
};

function identificadorValido(valor) {
  const n = Number(valor);

  return Number.isSafeInteger(n) && n > 0;
}

function normalizarLink(link) {
  if (link === null || link === undefined || link === '') {
    return null;
  }

  if (typeof link !== 'string') {
    throw new Error(
      'O link da notificação deve ser um texto.'
    );
  }

  const valor = link.trim();

  if (!valor) return null;

  if (valor.length > LIMITES.link) {
    throw new Error(
      'O link da notificação é muito longo.'
    );
  }

  if (
    /^(javascript|data|vbscript):/i.test(valor) ||
    valor.startsWith('//')
  ) {
    throw new Error(
      'O link da notificação não é permitido.'
    );
  }

  if (valor.startsWith('/')) {
    return valor;
  }

  let url;

  try {
    url = new URL(valor);
  } catch {
    throw new Error(
      'O link da notificação é inválido.'
    );
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(
      'Somente links HTTP ou HTTPS são permitidos.'
    );
  }

  return url.toString();
}

function normalizarTipo(tipo) {
  const valor =
    typeof tipo === 'string'
      ? tipo.trim().toLowerCase()
      : 'info';

  return TIPOS_PERMITIDOS.includes(valor)
    ? valor
    : 'info';
}

/**
 * Envia o push sem impedir que a notificação interna
 * já gravada seja mantida.
 *
 * IMPORTANTE:
 * O resultado do serviço push é registrado nos logs.
 * A ausência de tokens não é tratada como envio realizado.
 */
async function enviarPushSemBloquear({
  empresaId,
  usuarioId,
  titulo,
  mensagem,
  link
}) {
  const destino = {
    empresaId,
    usuarioId: usuarioId ?? null
  };

  try {
    const opcoes = {
      title: titulo,
      body: mensagem,
      route: link || '/'
    };

    let resultado;

    if (usuarioId !== null && usuarioId !== undefined) {
      resultado = await enviarPushParaUsuario({
        ...opcoes,
        usuarioId
      });
    } else {
      resultado = await enviarPushParaEmpresa({
        ...opcoes,
        empresaId
      });
    }

    if (!resultado || typeof resultado !== 'object') {
      console.error(
        '[ORVIX PUSH] O serviço não retornou um resultado válido:',
        JSON.stringify(destino)
      );

      return {
        sucesso: false,
        motivo: 'RESULTADO_INVALIDO'
      };
    }

    const resumo = {
      ...destino,
      sucesso: resultado.sucesso === true,
      total: resultado.total ?? 0,
      enviados: resultado.enviados ?? 0,
      falhas: resultado.falhas ?? 0,
      motivo: resultado.motivo ?? null
    };

    if (
      resultado.sucesso !== true ||
      Number(resultado.total ?? 0) === 0 ||
      Number(resultado.falhas ?? 0) > 0
    ) {
      console.warn(
        '[ORVIX PUSH] Envio não confirmado:',
        JSON.stringify(resumo)
      );
    } else {
      console.info(
        '[ORVIX PUSH] Resultado por destino:',
        JSON.stringify(resumo)
      );
    }

    return resultado;
  } catch (erro) {
    console.error(
      '[ORVIX PUSH] Erro inesperado ao enviar push:',
      JSON.stringify({
        ...destino,
        codigo: erro.code || null,
        mensagem: erro.message || String(erro)
      })
    );

    return {
      sucesso: false,
      motivo: erro.code || 'ERRO_INESPERADO',
      erro: erro.message || String(erro)
    };
  }
}

async function criarNotificacao({
  empresaId,
  usuarioId = null,
  tipo = 'info',
  titulo,
  mensagem,
  link = null
} = {}) {
  if (!identificadorValido(empresaId)) {
    console.warn(
      '[Notificações] Identificador de empresa inválido.'
    );

    return null;
  }

  if (
    usuarioId !== null &&
    usuarioId !== undefined &&
    !identificadorValido(usuarioId)
  ) {
    console.warn(
      '[Notificações] Identificador de usuário inválido.'
    );

    return null;
  }

  if (
    typeof titulo !== 'string' ||
    typeof mensagem !== 'string'
  ) {
    return null;
  }

  const tituloFinal = titulo.trim();
  const mensagemFinal = mensagem.trim();

  if (
    !tituloFinal ||
    !mensagemFinal ||
    tituloFinal.length > LIMITES.titulo ||
    mensagemFinal.length > LIMITES.mensagem
  ) {
    console.warn(
      '[Notificações] Título ou mensagem inválidos.'
    );

    return null;
  }

  let linkFinal;

  try {
    linkFinal = normalizarLink(link);
  } catch (erro) {
    console.warn(
      '[Notificações] Link inválido:',
      erro.message
    );

    return null;
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO public.notificacoes
        (
          empresa_id,
          usuario_id,
          tipo,
          titulo,
          mensagem,
          link
        )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
          id,
          empresa_id,
          usuario_id,
          tipo,
          titulo,
          mensagem,
          link,
          criado_em,
          lida_em`,
      [
        Number(empresaId),
        usuarioId == null ? null : Number(usuarioId),
        normalizarTipo(tipo),
        tituloFinal,
        mensagemFinal,
        linkFinal
      ]
    );

    const notificacao = resultado.rows[0] || null;

    if (notificacao) {
      // O push é iniciado sem atrasar a resposta principal.
      // A função trata internamente os erros de envio.
      void enviarPushSemBloquear({
        empresaId: Number(empresaId),
        usuarioId:
          usuarioId == null ? null : Number(usuarioId),
        titulo: tituloFinal,
        mensagem: mensagemFinal,
        link: linkFinal
      });
    }

    return notificacao;
  } catch (erro) {
    console.error(
      '[Notificações] Não foi possível criar o aviso:',
      {
        mensagem: erro.message,
        codigo: erro.code || null
      }
    );

    return null;
  }
}

async function notificarUsuariosDaEmpresa({
  empresaId,
  tipo = 'info',
  titulo,
  mensagem,
  link = null
} = {}) {
  if (!identificadorValido(empresaId)) {
    return {
      sucesso: false,
      quantidade: 0,
      erro: 'Identificador de empresa inválido.'
    };
  }

  if (
    typeof titulo !== 'string' ||
    typeof mensagem !== 'string' ||
    !titulo.trim() ||
    !mensagem.trim() ||
    titulo.trim().length > LIMITES.titulo ||
    mensagem.trim().length > LIMITES.mensagem
  ) {
    return {
      sucesso: false,
      quantidade: 0,
      erro: 'Título ou mensagem inválidos.'
    };
  }

  let linkFinal;

  try {
    linkFinal = normalizarLink(link);
  } catch (erro) {
    return {
      sucesso: false,
      quantidade: 0,
      erro: erro.message
    };
  }

  try {
    const tituloFinal = titulo.trim();
    const mensagemFinal = mensagem.trim();

    const resultado = await pool.query(
      `INSERT INTO public.notificacoes
        (
          empresa_id,
          usuario_id,
          tipo,
          titulo,
          mensagem,
          link
        )
       SELECT
          u.empresa_id,
          u.id,
          $2,
          $3,
          $4,
          $5
       FROM public.usuarios u
       WHERE u.empresa_id = $1
         AND u.ativo = TRUE
       RETURNING id, usuario_id`,
      [
        Number(empresaId),
        normalizarTipo(tipo),
        tituloFinal,
        mensagemFinal,
        linkFinal
      ]
    );

    const envios = await Promise.allSettled(
      resultado.rows.map((row) =>
        enviarPushSemBloquear({
          empresaId: Number(empresaId),
          usuarioId: row.usuario_id,
          titulo: tituloFinal,
          mensagem: mensagemFinal,
          link: linkFinal
        })
      )
    );

    const rejeitados = envios.filter(
      (item) => item.status === 'rejected'
    ).length;

    console.info(
      '[Notificações] Resultado da notificação em massa:',
      JSON.stringify({
        empresaId: Number(empresaId),
        notificacoesCriadas: resultado.rowCount,
        tentativasPush: envios.length,
        promessasRejeitadas: rejeitados
      })
    );

    return {
      sucesso: true,
      quantidade: resultado.rowCount
    };
  } catch (erro) {
    console.error(
      '[Notificações] Falha ao notificar usuários da empresa:',
      {
        mensagem: erro.message,
        codigo: erro.code || null
      }
    );

    return {
      sucesso: false,
      quantidade: 0,
      erro: 'Não foi possível criar as notificações.'
    };
  }
}

module.exports = {
  criarNotificacao,
  notificarUsuariosDaEmpresa,
  TIPOS_PERMITIDOS
};
