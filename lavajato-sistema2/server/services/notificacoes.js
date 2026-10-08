
const pool = require('../db');

/**
 * Cria uma notificação para uma empresa.
 *
 * usuarioId = null: notificação visível a todos os usuários
 * da empresa.
 *
 * usuarioId definido: notificação direcionada a um usuário.
 */
async function criarNotificacao({
    empresaId,
    usuarioId = null,
    tipo = 'info',
    titulo,
    mensagem,
    link = null
}) {
    if (!empresaId || !titulo || !mensagem) {
        console.warn(
            '[Notificações] Empresa, título e mensagem são obrigatórios.'
        );
        return null;
    }

    const tiposPermitidos = [
        'info',
        'sucesso',
        'alerta',
        'erro',
        'agendamento',
        'financeiro',
        'sistema'
    ];

    if (
        typeof titulo !== 'string' ||
        typeof mensagem !== 'string' ||
        titulo.trim().length === 0 ||
        mensagem.trim().length === 0 ||
        titulo.length > 160
    ) {
        console.warn('[Notificações] Dados inválidos.');
        return null;
    }

    const tipoFinal = tiposPermitidos.includes(tipo) ? tipo : 'info';

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
            RETURNING id, criado_em`,
            [
                empresaId,
                usuarioId,
                tipoFinal,
                titulo.trim(),
                mensagem.trim(),
                link
            ]
        );

        return resultado.rows[0];
    } catch (erro) {
        // Uma falha na notificação não deve impedir a ação principal.
        console.error(
            '[Notificações] Não foi possível criar o aviso:',
            erro.message
        );

        return null;
    }
}

module.exports = {
    criarNotificacao
};