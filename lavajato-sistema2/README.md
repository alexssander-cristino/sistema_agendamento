# Lavajato — Agenda &amp; Faturamento

Sistema de agendamento e faturamento para lavação automotiva, com banco de
dados PostgreSQL, API própria em Node.js e front-end responsivo (funciona
bem em computador, tablet e celular).

## Estrutura do projeto

```
lavajato/
├── database/schema.sql     → script para rodar no pgAdmin
├── server/                 → API em Node.js + Express
│   ├── index.js
│   ├── db.js
│   └── routes/
├── public/                 → front-end (HTML/CSS/JS puro, responsivo)
├── package.json
└── .env.example
```

## 1. Criar o banco de dados no pgAdmin

1. Abra o pgAdmin e conecte no seu servidor PostgreSQL.
2. Clique com o botão direito em **Databases** → **Create** → **Database…**
   e chame de `lavajato` (pode usar outro nome, mas lembre de ajustar o `.env`).
3. Clique com o botão direito no banco `lavajato` → **Query Tool**.
4. Abra o arquivo `database/schema.sql`, copie todo o conteúdo, cole no
   Query Tool e clique em **Execute (F5)**.
   - Isso cria as tabelas `servicos` e `agendamentos`, os índices, um
     trigger de auditoria e já insere 6 serviços de exemplo (você edita os
     preços depois, direto pela tela "Serviços" do sistema).

## 2. Configurar a conexão

1. Copie `.env.example` para `.env`:
   ```
   cp .env.example .env
   ```
2. Abra o `.env` e preencha com os dados do seu servidor (os mesmos que
   você usa para conectar no pgAdmin — clique com o botão direito no
   servidor → **Properties** → aba **Connection**):
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=lavajato
   DB_USER=postgres
   DB_PASSWORD=sua_senha
   PORT=3000
   ```

## 3. Instalar e rodar

Requer [Node.js](https://nodejs.org) instalado (versão 18 ou superior).

```bash
npm install
npm start
```

Acesse **http://localhost:3000** no navegador. Funciona igual em desktop,
tablet e celular — o layout se adapta automaticamente (no celular, o menu
lateral vira uma barra de navegação inferior).

Para desenvolvimento com recarregamento automático:
```bash
npm run dev
```

## 4. Uso no dia a dia

- **Agenda**: cadastre os agendamentos do dia, avance o status
  (agendado → em lavagem → concluído) direto pelo card.
- **Faturamento**: todo serviço concluído aparece aqui automaticamente.
  Marque a forma de pagamento, dê baixa quando for pago e emita o recibo
  (usa a caixa de impressão do navegador).
- **Financeiro**: totais de hoje, dos últimos 7 dias, do mês atual e
  faturamento por tipo de serviço.
- **Serviços**: cadastre e edite sua própria tabela de preços — é você
  quem controla os valores, a agenda só usa o que estiver aqui.

## Acesso de outros dispositivos na mesma rede (opcional)

Para acessar do celular/tablet enquanto o servidor roda no computador da
loja, descubra o IP local do computador (`ipconfig` no Windows ou
`ifconfig`/`ip a` no Linux/Mac, algo como `192.168.0.x`) e acesse, no outro
dispositivo, `http://192.168.0.x:3000` — desde que ambos estejam na mesma
rede Wi-Fi.

## Próximos passos possíveis

- Login com usuário/senha, se mais de uma pessoa for operar o sistema.
- Deploy em um servidor (ex: um VPS ou um serviço como Railway/Render)
  para acessar de qualquer lugar, não só na rede local.
- Backup automático do banco de dados (`pg_dump` agendado).
