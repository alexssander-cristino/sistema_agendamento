const pool = require('../db');

/**
 * ============================================================
 * SERVIÇO DE NOTIFICAÇÕES — ORVIX
 * ============================================================
 *
 * Cria notificações vinculadas a uma empresa.
 *
 * usuarioId = null:
 *   Notificação compartilhada por todos os usuários da empresa.
 *
 * usuarioId definido:
 *   Notificação direcionada a um usuário específico.
 *
 * Tipos aceitos:
 *   info, sucesso, alerta, erro, agendamento,
 *   financeiro, sistema, novidade.
 *
 * ============================================================
 */

const TIPOS_PERMITIDOS = [
    'info',
    'sucesso',
    'alerta',
    'erro',
    'agendamento',
    'financeiro',
    'sistema',
    'novidade'
];

const LIMITES = {
    titulo: 160,
    mensagem: 5000,
    link: 2048
};

/**
 * Valida um identificador numérico positivo.
 */
function identificadorValido(valor) {
    const numero = Number(valor);

    return (
        Number.isSafeInteger(numero) &&
        numero > 0
    );
}

/**
 * Valida e normaliza um link de notificação.
 *
 * Aceita caminhos internos, como:
 * /dashboard
 * /configuracoes
 *
 * Também aceita URLs HTTP/HTTPS válidas.
 */
function normalizarLink(link) {
    if (link === null || link === undefined || link === '') {
        return null;
    }

    if (typeof link !== 'string') {
        throw new Error('O link da notificação deve ser um texto.');
    }

    const valor = link.trim();

    if (!valor) {
        return null;
    }

    if (valor.length > LIMITES.link) {
        throw new Error('O link da notificação é muito longo.');
    }

    // Impede esquemas perigosos, como javascript: e data:.
    if (/^(javascript|data|vbscript):/i.test(valor)) {
        throw new Error('O esquema do link não é permitido.');
    }

    // Caminho relativo interno.
    if (valor.startsWith('/') && !valor.startsWith('//')) {
        return valor;
    }

    // URL absoluta: somente HTTP ou HTTPS.
    let url;

    try {
        url = new URL(valor);
    } catch {
        throw new Error('O link da notificação é inválido.');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Somente links HTTP ou HTTPS são permitidos.');
    }

    return url.toString();
}

/**
 * Cria uma notificação.
 *
 * @param {Object} dados
 * @param {number|string} dados.empresaId
 * @param {number|string|null} [dados.usuarioId=null]
 * @param {string} [dados.tipo='info']
 * @param {string} dados.titulo
 * @param {string} dados.mensagem
 * @param {string|null} [dados.link=null]
 *
 * @returns {Promise<Object|null>}
 */
async function criarNotificacao({
    empresaId,
    usuarioId = null,
    tipo = 'info',
    titulo,
    mensagem,
    link = null
} = {}) {
    // ========================================================
    // VALIDAÇÃO DOS IDENTIFICADORES
    // ========================================================

    if (!identificadorValido(Number(empresaId))) {
        console.warn(
            '[Notificações] Identificador de empresa inválido.'
        );

        return null;
    }

    if (
        usuarioId !== null &&
        usuarioId !== undefined &&
        !identificadorValido(Number(usuarioId))
    ) {
        console.warn(
            '[Notificações] Identificador de usuário inválido.'
        );

        return null;
    }

    // ========================================================
    // VALIDAÇÃO DO TÍTULO E DA MENSAGEM
    // ========================================================

    if (
        typeof titulo !== 'string' ||
        typeof mensagem !== 'string'
    ) {
        console.warn(
            '[Notificações] Título e mensagem devem ser textos.'
        );

        return null;
    }

    const tituloFinal = titulo.trim();
    const mensagemFinal = mensagem.trim();

    if (!tituloFinal || !mensagemFinal) {
        console.warn(
            '[Notificações] Título e mensagem são obrigatórios.'
        );

        return null;
    }

    if (tituloFinal.length > LIMITES.titulo) {
        console.warn(
            '[Notificações] O título excede o limite permitido.'
        );

        return null;
    }

    if (mensagemFinal.length > LIMITES.mensagem) {
        console.warn(
            '[Notificações] A mensagem excede o limite permitido.'
        );

        return null;
    }

    // ========================================================
    // TIPO
    // ========================================================

    const tipoFinal =
        typeof tipo === 'string' &&
        TIPOS_PERMITIDOS.includes(tipo.trim().toLowerCase())
            ? tipo.trim().toLowerCase()
            : 'info';

    // ========================================================
    // LINK
    // ========================================================

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

    // ========================================================
    // INSERÇÃO NO BANCO
    // ========================================================

    try {
        const resultado = await pool.query(
            `INSERT INTO public.notificacoes (
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
                usuarioId === null || usuarioId === undefined
                    ? null
                    : Number(usuarioId),
                tipoFinal,
                tituloFinal,
                mensagemFinal,
                linkFinal
            ]
        );

        return resultado.rows[0] || null;
    } catch (erro) {
        // Uma falha na notificação não deve impedir
        // a execução da operação principal do sistema.
        console.error(
            '[Notificações] Não foi possível criar o aviso:',
            {
                mensagem: erro.message,
                codigo: erro.code
            }
        );

        return null;
    }
}

/**
 * Cria notificações individuais para todos os usuários
 * ativos de uma empresa.
 *
 * Cada usuário terá seu próprio estado de leitura.
 */
async function notificarUsuariosDaEmpresa({
    empresaId,
    tipo = 'info',
    titulo,
    mensagem,
    link = null
} = {}) {
    if (!identificadorValido(Number(empresaId))) {
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

    const tipoFinal =
        typeof tipo === 'string' &&
        TIPOS_PERMITIDOS.includes(tipo.trim().toLowerCase())
            ? tipo.trim().toLowerCase()
            : 'info';

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
        const resultado = await pool.query(
            `INSERT INTO public.notificacoes (
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
            RETURNING id`,
            [
                Number(empresaId),
                tipoFinal,
                titulo.trim(),
                mensagem.trim(),
                linkFinal
            ]
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
                codigo: erro.code
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
