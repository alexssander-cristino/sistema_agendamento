-- ============================================================
-- Lavajato — schema do banco de dados
-- Rode este arquivo inteiro no Query Tool do pgAdmin, dentro do
-- banco de dados que voc  criar (ex: "lavajato").
-- ============================================================

CREATE TABLE IF NOT EXISTS servicos (
  id            SERIAL PRIMARY KEY,
  nome          VARCHAR(120) NOT NULL,
  preco         NUMERIC(10,2) NOT NULL DEFAULT 0,
  duracao_min   INTEGER NOT NULL DEFAULT 0,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id                SERIAL PRIMARY KEY,
  cliente           VARCHAR(150) NOT NULL,
  telefone          VARCHAR(30),
  veiculo           VARCHAR(150),
  placa             VARCHAR(10),
  servico_id        INTEGER REFERENCES servicos(id) ON DELETE SET NULL,
  data              DATE NOT NULL,
  hora              TIME NOT NULL,
  valor             NUMERIC(10,2) NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL DEFAULT 'agendado'
                      CHECK (status IN ('agendado','em_andamento','concluido','cancelado')),
  status_pagamento  VARCHAR(20) NOT NULL DEFAULT 'pendente'
                      CHECK (status_pagamento IN ('pendente','pago')),
  forma_pagamento   VARCHAR(30),
  observacoes       TEXT,
  criado_em         TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_data   ON agendamentos(data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);

-- mantém atualizado_em em dia automaticamente
CREATE OR REPLACE FUNCTION set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agendamentos_timestamp ON agendamentos;
CREATE TRIGGER trg_agendamentos_timestamp
BEFORE UPDATE ON agendamentos
FOR EACH ROW
EXECUTE FUNCTION set_timestamp();

-- serviços iniciais (edite os preços à vontade depois, pela tela "Serviços" do sistema)
INSERT INTO servicos (nome, preco, duracao_min)
SELECT * FROM (VALUES
  ('Lavagem Simples',        35.00,  30),
  ('Lavagem Completa',       60.00,  60),
  ('Lavagem a Seco',         80.00,  45),
  ('Higienização Interna',  150.00, 120),
  ('Enceramento',            120.00,  90),
  ('Polimento',              250.00, 180)
) AS v(nome, preco, duracao_min)
WHERE NOT EXISTS (SELECT 1 FROM servicos);
