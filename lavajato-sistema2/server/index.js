require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const registrarLogs = require('./middleware/logger');

const {
  apiRateLimit,
  authRateLimit,
  passwordResetRateLimit
} = require('./middleware/rateLimit');


// ============================================================
// ROTAS
// ============================================================

const servicosRouter =
  require('./routes/servicos');

const agendamentosRouter =
  require('./routes/agendamentos');

const despesasRouter =
  require('./routes/despesas');

const authRouter =
  require('./routes/auth');

const usuariosRouter =
  require('./routes/usuarios');

const configuracoesRouter =
  require('./routes/configuracoes');

const planosRouter =
  require('./routes/planos');

const adminRouter =
  require('./routes/admin');

const mercadoPagoRouter =
  require('./routes/mercadoPago');

const mercadoPagoWebhookRouter =
  require('./routes/mercadoPagoWebhook');

const adminAssinaturasRouter =
  require('./routes/adminAssinaturas');

const privacidadeRouter =
  require('./routes/privacidade');

const adminPrivacidadeRouter =
  require('./routes/adminPrivacidade');

const adminTratamentosRouter =
  require('./routes/adminTratamentos');

const adminIncidentesRouter =
  require('./routes/adminIncidentes');

const cookieParser = require('cookie-parser');  


// ============================================================
// APP
// ============================================================

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'https://sistemaagendamento-lavajato-sistema.vercel.app'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Permite requisições sem Origin
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origem não permitida pelo CORS'));
  },

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS'
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization'
  ],

  credentials: true,

  optionsSuccessStatus: 204
}));

app.use(cookieParser());

const PORT =
  process.env.PORT || 3000;


// ============================================================
// PROXY
// ============================================================
//
// O Orvix roda atrás da infraestrutura da Vercel.
//
// O trust proxy permite que o Express utilize corretamente
// o IP encaminhado pelo proxy para o rate limit.
//
// Não usar "true" aqui.
// ============================================================

app.set(
  'trust proxy',
  1
);


// ============================================================
// CORS
// ============================================================

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
  express.json()
);

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(
  registrarLogs
);


// ============================================================
// RATE LIMIT — API
// ============================================================
//
// Protege todas as rotas abaixo de /api.
//
// Limite configurado no:
// server/middleware/rateLimit.js
//
// Atualmente:
// 120 requisições por minuto por IP.
//
// Arquivos estáticos do /public não passam por esse limite.
// ============================================================

app.use(
  '/api/auth',
  authRateLimit,
  (req, res, next) => {

    if (
      req.path === '/esqueci-senha' &&
      req.method === 'POST'
    ) {
      return passwordResetRateLimit(
        req,
        res,
        next
      );
    }

    next();
  },
  authRouter
);


// ============================================================
// AUTENTICAÇÃO
// ============================================================
//
// O authRateLimit é aplicado especificamente às rotas
// de autenticação.
//
// Além do limite geral da API, as rotas /api/auth recebem
// um limite mais restritivo.
//
// Atualmente:
// 10 requisições por 15 minutos por IP.
//
// Isso ajuda a proteger principalmente:
// - login
// - cadastro
// - recuperação de acesso
// - outras rotas sensíveis de autenticação
// ============================================================

app.use(
  '/api/auth',
  authRateLimit,
  authRouter
);


// ============================================================
// API — EMPRESA
// ============================================================

app.use(
  '/api/servicos',
  servicosRouter
);

app.use(
  '/api/agendamentos',
  agendamentosRouter
);

app.use(
  '/api/despesas',
  despesasRouter
);

app.use(
  '/api/usuarios',
  usuariosRouter
);

app.use(
  '/api/configuracoes',
  configuracoesRouter
);

app.use(
  '/api/planos',
  planosRouter
);


// ============================================================
// PRIVACIDADE — ADMINISTRADOR
// ============================================================
//
// Essas rotas precisam ficar ANTES de /api/admin.
//
// Caso contrário, o router DEV:
// /api/admin
//
// poderia interceptar:
// /api/admin/privacidade
// /api/admin/tratamentos
// /api/admin/incidentes
// ============================================================

app.use(
  '/api/admin/privacidade',
  adminPrivacidadeRouter
);

app.use(
  '/api/admin/tratamentos',
  adminTratamentosRouter
);

app.use(
  '/api/admin/incidentes',
  adminIncidentesRouter
);


// ============================================================
// ADMIN — DEV
// ============================================================
//
// Router exclusivo do desenvolvedor.
// O próprio router possui o middleware somenteDev.
// ============================================================

app.use(
  '/api/admin',
  adminRouter
);


// ============================================================
// MERCADO PAGO
// ============================================================

app.use(
  '/api/mercado-pago',
  mercadoPagoRouter
);

app.use(
  '/api/mercado-pago/webhook',
  mercadoPagoWebhookRouter
);


// ============================================================
// ASSINATURAS — ADMIN DEV
// ============================================================

app.use(
  '/api/admin/assinaturas',
  adminAssinaturasRouter
);


// ============================================================
// PRIVACIDADE — USUÁRIO
// ============================================================

app.use(
  '/api/privacidade',
  privacidadeRouter
);


// ============================================================
// STATUS DA API / BANCO
// ============================================================

app.get(
  '/api/status',
  async (req, res) => {

    try {

      await pool.query(
        'SELECT 1'
      );


      res.status(200).json({
        ok: true,
        banco: 'conectado',
        ambiente:
          process.env.NODE_ENV ||
          'development'
      });


    } catch (err) {

      console.error(
        'Erro ao verificar banco:',
        err.message
      );


      res.status(500).json({
        ok: false,
        banco: 'erro',
        detalhe:
          process.env.NODE_ENV ===
          'production'
            ? 'Erro ao conectar ao banco de dados.'
            : err.message
      });

    }

  }
);


// ============================================================
// FRONT-END
// ============================================================

const publicPath =
  path.join(
    __dirname,
    '..',
    'public'
  );


app.use(
  express.static(
    publicPath
  )
);


// ============================================================
// FALLBACK
// ============================================================

app.get(
  '*',
  (req, res) => {

    // Se for uma rota da API que não existe,
    // retorna JSON em vez de tentar entregar HTML.

    if (
      req.path.startsWith('/api/')
    ) {

      return res.status(404).json({
        erro:
          'Rota da API não encontrada.'
      });

    }


    // Para páginas inexistentes,
    // entrega o 404.html.

    res.status(404).sendFile(
      path.join(
        publicPath,
        '404.html'
      )
    );

  }
);


// ============================================================
// ERROS
// ============================================================

app.use(
  (err, req, res, next) => {

    console.error(
      'Erro interno:',
      err
    );


    res.status(500).json({
      erro:
        process.env.NODE_ENV ===
        'production'
          ? 'Erro interno do servidor.'
          : err.message
    });

  }
);


// ============================================================
// SERVIDOR LOCAL
// ============================================================
//
// Na Vercel, NODE_ENV será production e o app será exportado
// pelo api/index.js.
//
// Localmente, inicia o servidor normalmente.
// ============================================================

if (
  process.env.NODE_ENV !==
  'production'
) {

  app.listen(
    PORT,
    () => {

      console.log(
        `Orvix rodando em http://localhost:${PORT}`
      );

    }
  );

}


// ============================================================
// EXPORT
// ============================================================

module.exports = app;
