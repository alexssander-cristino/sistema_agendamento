require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const pool = require('./db');

const registrarLogs =
  require('./middleware/logger');

const auditoriaAutomatica =
  require('./middleware/auditoriaAutomatica');  

const {
  apiRateLimit,
  authRateLimit,
  passwordResetRateLimit
} =
  require('./middleware/rateLimit');


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

const logsRouter = require('./routes/logs');  

const relatoriosRouter = require('./routes/relatorios');

const dashboardRouter = require('./routes/dashboard');

const notificacoesRouter =
  require('./routes/notificacoes');

// ============================================================
// APP
// ============================================================

const app = express();

const PORT = Number(process.env.PORT) || 3000;

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

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'https://sistemaagendamento-lavajato-sistema.vercel.app'
].filter(Boolean);


app.use(
  cors({
    origin: (origin, callback) => {

      // Requisições sem Origin.
      //
      // Exemplos:
      // - algumas chamadas internas
      // - ferramentas de servidor
      // - health checks
      //
      if (!origin) {
        return callback(
          null,
          true
        );
      }


      if (
        allowedOrigins.includes(origin)
      ) {
        return callback(
          null,
          true
        );
      }


      return callback(
        new Error(
          'Origem não permitida pelo CORS.'
        )
      );
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
  })
);


// ============================================================
// COOKIES
// ============================================================
//
// Necessário para ler:
// req.cookies.token
//
// O JWT de autenticação pode ficar em cookie HttpOnly,
// impedindo que o JavaScript leia diretamente o token.
// ============================================================

app.use(
  cookieParser()
);


// ============================================================
// JSON
// ============================================================

app.use(
  express.json()
);


// ============================================================
// FORM URLENCODED
// ============================================================

app.use(
  express.urlencoded({
    extended: true
  })
);


// ============================================================
// LOGGER
// ============================================================

app.use(
  registrarLogs
);

app.use(
  auditoriaAutomatica
);

// ============================================================
// RATE LIMIT — API
// ============================================================
//
// Protege as rotas da API.
//
// O limite geral está configurado em:
// server/middleware/rateLimit.js
//
// Atualmente:
// 120 requisições por minuto por IP.
//
// ============================================================

app.use(
  '/api',
  apiRateLimit
);


// ============================================================
// AUTENTICAÇÃO
// ============================================================
//
// As rotas /api/auth recebem um limite específico.
//
// Atualmente:
// 10 requisições por 15 minutos por IP.
//
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

app.use('/api/relatorios', relatoriosRouter);

app.use('/api/dashboard', dashboardRouter);

app.use(
  '/api/planos',
  planosRouter
);

app.use(
  '/api/notificacoes',
  notificacoesRouter
);


// ============================================================
// PRIVACIDADE — ADMINISTRADOR
// ============================================================
//
// Essas rotas precisam ficar antes de /api/admin.
//
// Caso contrário, o router DEV:
// /api/admin
//
// poderia interceptar:
//
// /api/admin/privacidade
// /api/admin/tratamentos
// /api/admin/incidentes
//
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
//
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


      return res.status(200).json({

        ok: true,

        banco:
          'conectado',

        ambiente:
          process.env.NODE_ENV ||
          'development'

      });

    } catch (err) {

      console.error(
        'Erro ao verificar banco:',
        err.message
      );


      return res.status(500).json({

        ok: false,

        banco:
          'erro',

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
// LOGS -  EMPRESAS
// ============================================================

app.use('/api/logs', logsRouter);


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

    return res.status(404).sendFile(
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


    return res.status(500).json({

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