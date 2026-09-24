ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS perfil VARCHAR(30) NOT NULL DEFAULT 'funcionario';

UPDATE usuarios
SET perfil = 'administrador'
WHERE id = (
    SELECT MIN(id)
    FROM usuarios
);

ALTER TABLE usuarios
DROP CONSTRAINT IF EXISTS usuarios_perfil_check;

ALTER TABLE usuarios
ADD CONSTRAINT usuarios_perfil_check
CHECK (perfil IN ('administrador', 'funcionario'));

INSERT INTO usuarios
    (empresa_id, nome, email, senha)
VALUES ($1, $2, $3, $4)