const RESEND_API_URL =
  'https://api.resend.com/emails';

// ============================================================
// ESCAPAR HTML
// ============================================================

function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
    escaparHtml(
      nome || 'usuário'
    );

  const linkSeguro =
    String(link || '');

  const html = `
<!DOCTYPE html>

<html
  lang="pt-BR"
>

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <meta
    name="color-scheme"
    content="light"
  >

  <title>
    Recuperação de senha | Orvix
  </title>

</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f3f4f6;
    font-family:Arial,Helvetica,sans-serif;
    color:#172033;
  "
>

  <table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="
      background:#f3f4f6;
      margin:0;
      padding:0;
    "
  >

    <tr>

      <td
        align="center"
        style="
          padding:40px 16px;
        "
      >

        <!-- ================================================= -->
        <!-- CONTAINER -->
        <!-- ================================================= -->

        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            max-width:600px;
            background:#ffffff;
            border-radius:16px;
            overflow:hidden;
            box-shadow:0 8px 30px rgba(0,0,0,0.08);
          "
        >

          <!-- ================================================= -->
          <!-- CABEÇALHO -->
          <!-- ================================================= -->

          <tr>

            <td
              style="
                padding:30px 32px;
                background:#111827;
                text-align:center;
              "
            >

              <div
                style="
                  font-size:28px;
                  line-height:1;
                  font-weight:700;
                  color:#ffffff;
                  letter-spacing:-0.5px;
                "
              >
                Orvix
              </div>

              <div
                style="
                  margin-top:8px;
                  font-size:13px;
                  color:#9ca3af;
                "
              >
                Gestão simples para sua empresa
              </div>

            </td>

          </tr>

          <!-- ================================================= -->
          <!-- CONTEÚDO -->
          <!-- ================================================= -->

          <tr>

            <td
              style="
                padding:36px 32px;
              "
            >

              <h1
                style="
                  margin:0 0 20px;
                  font-size:24px;
                  line-height:1.3;
                  font-weight:700;
                  color:#111827;
                "
              >
                Recuperação de senha
              </h1>

              <p
                style="
                  margin:0 0 16px;
                  font-size:15px;
                  line-height:1.7;
                  color:#4b5563;
                "
              >
                Olá,
                <strong>
                  ${nomeSeguro}
                </strong>!
              </p>

              <p
                style="
                  margin:0 0 20px;
                  font-size:15px;
                  line-height:1.7;
                  color:#4b5563;
                "
              >
                Recebemos uma solicitação para
                redefinir a senha da sua conta
                no Orvix.
              </p>

              <p
                style="
                  margin:0 0 28px;
                  font-size:15px;
                  line-height:1.7;
                  color:#4b5563;
                "
              >
                Clique no botão abaixo para criar
                uma nova senha.
              </p>

              <!-- ================================================= -->
              <!-- BOTÃO -->
              <!-- ================================================= -->

              <table
                cellpadding="0"
                cellspacing="0"
                border="0"
                width="100%"
                style="
                  margin:0 0 28px;
                "
              >

                <tr>

                  <td
                    align="center"
                  >

                    <a
                      href="${linkSeguro}"
                      target="_blank"
                      style="
                        display:inline-block;
                        padding:14px 26px;
                        background:#2563eb;
                        color:#ffffff;
                        text-decoration:none;
                        border-radius:10px;
                        font-size:15px;
                        font-weight:700;
                      "
                    >
                      Redefinir minha senha
                    </a>

                  </td>

                </tr>

              </table>

              <!-- ================================================= -->
              <!-- VALIDADE -->
              <!-- ================================================= -->

              <div
                style="
                  padding:16px;
                  background:#f9fafb;
                  border:1px solid #e5e7eb;
                  border-radius:10px;
                "
              >

                <p
                  style="
                    margin:0;
                    font-size:13px;
                    line-height:1.6;
                    color:#6b7280;
                  "
                >
                  Por segurança, este link ficará
                  disponível por
                  <strong>
                    30 minutos
                  </strong>
                  e poderá ser utilizado apenas
                  uma vez.
                </p>

              </div>

              <!-- ================================================= -->
              <!-- LINK MANUAL -->
              <!-- ================================================= -->

              <p
                style="
                  margin:28px 0 8px;
                  font-size:13px;
                  line-height:1.6;
                  color:#6b7280;
                "
              >
                Caso o botão não funcione,
                copie e cole o endereço abaixo
                no seu navegador:
              </p>

              <p
                style="
                  margin:0;
                  font-size:12px;
                  line-height:1.6;
                  word-break:break-all;
                "
              >

                <a
                  href="${linkSeguro}"
                  target="_blank"
                  style="
                    color:#2563eb;
                    text-decoration:none;
                  "
                >
                  ${linkSeguro}
                </a>

              </p>

              <!-- ================================================= -->
              <!-- SEGURANÇA -->
              <!-- ================================================= -->

              <p
                style="
                  margin:28px 0 0;
                  font-size:13px;
                  line-height:1.6;
                  color:#6b7280;
                "
              >
                Se você não solicitou a recuperação
                da senha, pode ignorar este e-mail.
                Sua senha atual continuará segura.
              </p>

            </td>

          </tr>

          <!-- ================================================= -->
          <!-- RODAPÉ -->
          <!-- ================================================= -->

          <tr>

            <td
              style="
                padding:24px 32px;
                background:#f9fafb;
                border-top:1px solid #e5e7eb;
                text-align:center;
              "
            >

              <p
                style="
                  margin:0 0 8px;
                  font-size:13px;
                  line-height:1.5;
                  color:#6b7280;
                "
              >
                Atenciosamente,
                <br>

                <strong
                  style="
                    color:#374151;
                  "
                >
                  Equipe Orvix
                </strong>

              </p>

              <p
                style="
                  margin:16px 0 0;
                  font-size:11px;
                  line-height:1.5;
                  color:#9ca3af;
                "
              >
                Este é um e-mail automático.
                Por favor, não responda diretamente
                a esta mensagem.
              </p>

              <p
                style="
                  margin:8px 0 0;
                  font-size:11px;
                  color:#9ca3af;
                "
              >
                © ${new Date().getFullYear()}
                Orvix.
                Todos os direitos reservados.
              </p>

            </td>

          </tr>

        </table>

      </td>

    </tr>

  </table>

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

// ============================================================
// EXPORTAR
// ============================================================

module.exports = {
  enviarEmail,
  enviarEmailRecuperacaoSenha
};