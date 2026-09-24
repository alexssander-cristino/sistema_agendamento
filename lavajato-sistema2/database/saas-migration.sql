-- ============================================================
-- MIGRAÇÃO SaaS
-- Lavajato Sistema
-- ============================================================

BEGIN;

-- ============================================================
-- EMPRESAS
-- ============================================================

CREATE TABLE IF NOT EXISTS empresas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    telefone VARCHAR(30),
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USUÁRIOS
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_empresa
ON usuarios(empresa_id);

-- ============================================================
-- EMPRESA DOS DADOS EXISTENTES
-- ============================================================

-- Cria uma empresa padrão para os dados que já existem.
INSERT INTO empresas (nome, email)
SELECT
    'Minha Lavação',
    'admin@minhalavacao.com'
WHERE NOT EXISTS (
    SELECT 1 FROM empresas
);

-- ============================================================
-- ADICIONA EMPRESA NAS TABELAS EXISTENTES
-- ============================================================

ALTER TABLE servicos
ADD COLUMN IF NOT EXISTS empresa_id INTEGER;

ALTER TABLE agendamentos
ADD COLUMN IF NOT EXISTS empresa_id INTEGER;

ALTER TABLE despesas
ADD COLUMN IF NOT EXISTS empresa_id INTEGER;

-- ============================================================
-- VINCULA OS DADOS EXISTENTES À PRIMEIRA EMPRESA
-- ============================================================

UPDATE servicos
SET empresa_id = (
    SELECT id
    FROM empresas
    ORDER BY id
    LIMIT 1
)
WHERE empresa_id IS NULL;

UPDATE agendamentos
SET empresa_id = (
    SELECT id
    FROM empresas
    ORDER BY id
    LIMIT 1
)
WHERE empresa_id IS NULL;

UPDATE despesas
SET empresa_id = (
    SELECT id
    FROM empresas
    ORDER BY id
    LIMIT 1
)
WHERE empresa_id IS NULL;

-- ============================================================
-- FOREIGN KEYS
-- ============================================================

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_servicos_empresa'
    ) THEN
        ALTER TABLE servicos
        ADD CONSTRAINT fk_servicos_empresa
        FOREIGN KEY (empresa_id)
        REFERENCES empresas(id)
        ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_agendamentos_empresa'
    ) THEN
        ALTER TABLE agendamentos
        ADD CONSTRAINT fk_agendamentos_empresa
        FOREIGN KEY (empresa_id)
        REFERENCES empresas(id)
        ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_despesas_empresa'
    ) THEN
        ALTER TABLE despesas
        ADD CONSTRAINT fk_despesas_empresa
        FOREIGN KEY (empresa_id)
        REFERENCES empresas(id)
        ON DELETE CASCADE;
    END IF;

END $$;

-- ============================================================
-- EMPRESA OBRIGATÓRIA
-- ============================================================

ALTER TABLE servicos
ALTER COLUMN empresa_id SET NOT NULL;

ALTER TABLE agendamentos
ALTER COLUMN empresa_id SET NOT NULL;

ALTER TABLE despesas
ALTER COLUMN empresa_id SET NOT NULL;

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_servicos_empresa
ON servicos(empresa_id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_empresa
ON agendamentos(empresa_id);

CREATE INDEX IF NOT EXISTS idx_despesas_empresa
ON despesas(empresa_id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_empresa_data
ON agendamentos(empresa_id, data);

CREATE INDEX IF NOT EXISTS idx_despesas_empresa_data
ON despesas(empresa_id);

COMMIT;