const RESEND_API_URL =
  'https://api.resend.com/emails';

// ============================================================
// ENVIAR E-MAIL PELO RESEND
// ============================================================

async function enviarEmail({
  para,
  assunto,
  html
}) {

  const apiKey =
    process.env.RESEND_API_KEY;

  const emailFrom =
    process.env.EMAIL_FROM;

  if (!apiKey) {

    throw new Error(
      'RESEND_API_KEY não configurada.'
    );
  }

  if (!emailFrom) {

    throw new Error(
      'EMAIL_FROM não configurado.'
    );
  }

  if (!para) {

    throw new Error(
      'Destinatário do e-mail não informado.'
    );
  }

  const resposta =
    await fetch(
      RESEND_API_URL,
      {
        method: 'POST',

        headers: {
          'Authorization':
            `Bearer ${apiKey}`,

          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify({
            from:
              emailFrom,

            to: [
              para
            ],

            subject:
              assunto,

            html
          })
      }
    );

  let dados = null;

  try {

    dados =
      await resposta.json();

  } catch {
    dados = null;
  }

  if (!resposta.ok) {

    const mensagem =
      dados?.message ||
      dados?.error ||
      `Erro ao enviar e-mail. HTTP ${resposta.status}.`;

    throw new Error(
      mensagem
    );
  }

  return dados;
}

// ============================================================
// E-MAIL DE RECUPERAÇÃO DE SENHA
// ============================================================

async function enviarEmailRecuperacaoSenha({
  para,
  nome,
  link
}) {

  const nomeSeguro =
    String(
      nome || 'usuário'
    );

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">

<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>Recuperação de senha | Orvix</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f6f8;
    font-family:Arial,Helvetica,sans-serif;
  "
>

  <div
    style="
      max-width:600px;
      margin:40px auto;
      padding:0 20px;
    "
  >

    <div
      style="
        background:#ffffff;
        border-radius:14px;
        padding:36px;
        box-shadow:0 4px 20px rgba(0,0,0,.08);
      "
    >

      <div
        style="
          font-size:26px;
          font-weight:700;
          color:#111827;
          margin-bottom:24px;
        "
      >
        Orvix
      </div>

      <h1
        style="
          margin:0 0 16px;
          font-size:24px;
          color:#111827;
        "
      >
        Recuperação de senha
      </h1>

      <p
        style="
          margin:0 0 16px;
          font-size:16px;
          line-height:1.6;
          color:#4b5563;
        "
      >
        Olá, ${nomeSeguro}.
      </p>

      <p
        style="
          margin:0 0 24px;
          font-size:16px;
          line-height:1.6;
          color:#4b5563;
        "
      >
        Recebemos uma solicitação para redefinir
        a senha da sua conta no Orvix.
      </p>

      <div
        style="
          margin:30px 0;
          text-align:center;
        "
      >

        <a
          href="${link}"
          style="
            display:inline-block;
            padding:14px 24px;
            background:#111827;
            color:#ffffff;
            text-decoration:none;
            border-radius:8px;
            font-size:15px;
            font-weight:600;
          "
        >
          Redefinir minha senha
        </a>

      </div>

      <p
        style="
          margin:0 0 12px;
          font-size:14px;
          line-height:1.6;
          color:#6b7280;
        "
      >
        Este link ficará disponível por 30 minutos
        e poderá ser utilizado apenas uma vez.
      </p>

      <p
        style="
          margin:0 0 20px;
          font-size:14px;
          line-height:1.6;
          color:#6b7280;
        "
      >
        Se você não solicitou a recuperação da senha,
        pode ignorar este e-mail.
      </p>

      <hr
        style="
          border:0;
          border-top:1px solid #e5e7eb;
          margin:24px 0;
        "
      >

      <p
        style="
          margin:0;
          font-size:12px;
          line-height:1.5;
          color:#9ca3af;
        "
      >
        Este é um e-mail automático do Orvix.
        Não responda a esta mensagem.
      </p>

    </div>

  </div>

</body>

</html>
`;

  return await enviarEmail({
    para,
    assunto:
      'Recuperação de senha | Orvix',
    html
  });
}

module.exports = {
  enviarEmail,
  enviarEmailRecuperacaoSenha
};