-- =========================================================
--  DMS - Schéma PostgreSQL consolidé (Neon)
--  Équivalent des 33 migrations MySQL + pgvector (embeddings).
--  Idempotent : sûr à exécuter plusieurs fois (CREATE IF NOT EXISTS).
-- =========================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ------------------------------------------------
-- Trigger générique : ON UPDATE CURRENT_TIMESTAMP
-- ------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------
-- users
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  full_name       VARCHAR(120) NOT NULL,
  email           VARCHAR(180) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  is_active       SMALLINT NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMP NULL,
  is_locked       SMALLINT NOT NULL DEFAULT 0,
  lock_expires_at TIMESTAMP NULL,
  locale          VARCHAR(10) NOT NULL DEFAULT 'fr',
  theme_pref      VARCHAR(20) NOT NULL DEFAULT 'light',
  avatar_path     VARCHAR(500) NULL
);
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------
-- roles / permissions
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- ------------------------------------------------
-- audit_logs
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INT NULL REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   VARCHAR(100),
  old_values  JSONB NULL,
  new_values  JSONB NULL,
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------
-- password_resets / login_attempts
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  used_at    TIMESTAMP NULL,
  email      VARCHAR(180) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email);
CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);

CREATE TABLE IF NOT EXISTS login_attempts (
  id              BIGSERIAL PRIMARY KEY,
  email           VARCHAR(180) NOT NULL,
  attempt_count   INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMP NULL,
  last_ip         VARCHAR(64) NULL,
  last_attempt_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_login_attempts_email ON login_attempts(email);

-- ------------------------------------------------
-- user_2fa_codes
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS user_2fa_codes (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code          VARCHAR(6) NOT NULL,
  session_token VARCHAR(255) NOT NULL,
  expires_at    TIMESTAMP NOT NULL,
  used          SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_token ON user_2fa_codes(session_token);

-- ------------------------------------------------
-- documents (avec colonnes ajoutées par migrations ultérieures)
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id                   BIGSERIAL PRIMARY KEY,
  title                VARCHAR(255) NOT NULL,
  original_name        VARCHAR(255) NOT NULL,
  file_path            VARCHAR(500) NOT NULL,
  mime_type            VARCHAR(150) NOT NULL,
  size                 BIGINT NOT NULL,
  owner_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category             VARCHAR(120) DEFAULT 'General',
  status               VARCHAR(50) DEFAULT 'active',
  tags                 TEXT,
  description          TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  extracted_text       TEXT NULL,
  deleted_at           TIMESTAMP NULL,
  visibility           VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
  watermark_enabled    SMALLINT NOT NULL DEFAULT 0,
  embedding_json       JSONB NULL,
  embedding_updated_at TIMESTAMP NULL
);
DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_deleted_at ON documents(deleted_at);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);

-- Recherche plein-texte PostgreSQL (remplace FULLTEXT MySQL)
CREATE INDEX IF NOT EXISTS idx_documents_search_trgm
  ON documents
  USING gin (to_tsvector('simple',
    coalesce(title,'') || ' ' ||
    coalesce(description,'') || ' ' ||
    coalesce(tags,'') || ' ' ||
    coalesce(extracted_text,'')));

-- ------------------------------------------------
-- document_versions
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS document_versions (
  id             BIGSERIAL PRIMARY KEY,
  document_id    BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  file_path      VARCHAR(500) NOT NULL,
  size           BIGINT NOT NULL,
  created_by     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment        VARCHAR(500),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions(document_id);

-- ------------------------------------------------
-- refresh_tokens
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(500) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- ------------------------------------------------
-- workflows
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS workflows (
  id                BIGSERIAL PRIMARY KEY,
  name              VARCHAR(180) NOT NULL,
  description       TEXT,
  document_category VARCHAR(120),
  visual_definition JSONB NULL,
  is_visual         SMALLINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id             BIGSERIAL PRIMARY KEY,
  workflow_id    BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_order     INT NOT NULL,
  assignee_type  VARCHAR(20) NOT NULL,
  assignee_id    INT NOT NULL,
  due_hours      INT DEFAULT 0,
  reminder_hours INT DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_order ON workflow_steps(workflow_id, step_order);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id                BIGSERIAL PRIMARY KEY,
  document_id       BIGINT NOT NULL,
  workflow_id       BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  current_step_id   BIGINT NULL REFERENCES workflow_steps(id) ON DELETE SET NULL,
  current_node_id   VARCHAR(80) NULL,
  visual_state_json JSONB NULL,
  is_visual         SMALLINT NOT NULL DEFAULT 0,
  status            VARCHAR(40) NOT NULL DEFAULT 'pending',
  started_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMP NULL,
  due_date          TIMESTAMP NULL,
  reminder_sent_at  TIMESTAMP NULL
);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_document ON workflow_instances(document_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_due_date ON workflow_instances(status, due_date);

CREATE TABLE IF NOT EXISTS workflow_actions (
  id          BIGSERIAL PRIMARY KEY,
  instance_id BIGINT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_id     BIGINT NULL REFERENCES workflow_steps(id) ON DELETE SET NULL,
  actor_id    INT NULL,
  action      VARCHAR(40) NOT NULL,
  comment     TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------
-- departments / user_departments
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_departments (
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, department_id)
);

-- ------------------------------------------------
-- custom_fields / document_custom_values
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS custom_fields (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  type          VARCHAR(20) NOT NULL CHECK (type IN ('text','date','number','select')),
  options       JSONB NULL,
  document_type VARCHAR(100) NULL,
  is_active     SMALLINT NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_custom_values (
  id          BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  field_id    INT NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value       TEXT,
  UNIQUE (document_id, field_id)
);

-- ------------------------------------------------
-- archiving_rules / app_settings
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS archiving_rules (
  id                 SERIAL PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  condition_field    VARCHAR(50) NOT NULL,
  condition_operator VARCHAR(10) NOT NULL,
  condition_value    VARCHAR(255) NULL,
  days_inactive      INT DEFAULT 30,
  is_active          SMALLINT NOT NULL DEFAULT 1,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON app_settings;
CREATE TRIGGER trg_app_settings_updated_at BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO app_settings (key, value)
VALUES ('max_upload_size_bytes', '10485760')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------
-- document_shares
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS document_shares (
  id                  SERIAL PRIMARY KEY,
  document_id         BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  shared_with_user_id INT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_with_role_id INT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission          VARCHAR(20) NOT NULL DEFAULT 'view' CHECK (permission IN ('view','download','manage')),
  start_date          TIMESTAMP NOT NULL DEFAULT NOW(),
  end_date            TIMESTAMP NULL,
  created_by          INT NOT NULL REFERENCES users(id),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked             SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ds_document ON document_shares(document_id);
CREATE INDEX IF NOT EXISTS idx_ds_user ON document_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_ds_role ON document_shares(shared_with_role_id);
CREATE INDEX IF NOT EXISTS idx_ds_revoked ON document_shares(revoked);

-- ------------------------------------------------
-- public_links / link_access_logs
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS public_links (
  id             SERIAL PRIMARY KEY,
  document_id    BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  token          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NULL,
  allow_download SMALLINT NOT NULL DEFAULT 1,
  expires_at     TIMESTAMP NULL,
  created_by     INT NOT NULL REFERENCES users(id),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked        SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_public_links_document ON public_links(document_id);
CREATE INDEX IF NOT EXISTS idx_public_links_revoked ON public_links(revoked);

CREATE TABLE IF NOT EXISTS link_access_logs (
  id          SERIAL PRIMARY KEY,
  link_id     INT NOT NULL REFERENCES public_links(id) ON DELETE CASCADE,
  ip_address  VARCHAR(45) NULL,
  user_agent  TEXT NULL,
  action      VARCHAR(20) NOT NULL DEFAULT 'view' CHECK (action IN ('view','download')),
  accessed_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_link_logs_link ON link_access_logs(link_id);
CREATE INDEX IF NOT EXISTS idx_link_logs_accessed ON link_access_logs(accessed_at);

-- ------------------------------------------------
-- upload_requests
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS upload_requests (
  id                 SERIAL PRIMARY KEY,
  token              VARCHAR(255) NOT NULL UNIQUE,
  created_by         INT NOT NULL REFERENCES users(id),
  target_document_id BIGINT NULL REFERENCES documents(id) ON DELETE SET NULL,
  allowed_mime_types JSONB NULL,
  max_size_bytes     INT NOT NULL DEFAULT 10485760,
  max_files          INT NOT NULL DEFAULT 5,
  expires_at         TIMESTAMP NULL,
  password_hash      VARCHAR(255) NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked')),
  notification_email VARCHAR(255) NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_upload_requests_created_by ON upload_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_upload_requests_status ON upload_requests(status);

CREATE TABLE IF NOT EXISTS upload_request_files (
  id                     SERIAL PRIMARY KEY,
  request_id             INT NOT NULL REFERENCES upload_requests(id) ON DELETE CASCADE,
  original_name          VARCHAR(255) NOT NULL,
  file_path              VARCHAR(500) NOT NULL,
  size                   BIGINT NOT NULL,
  mime_type              VARCHAR(150) NULL,
  uploaded_by_ip         VARCHAR(45) NULL,
  uploaded_by_email      VARCHAR(255) NULL,
  comment                TEXT NULL,
  status                 VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','correction_requested')),
  reviewer_comment       TEXT NULL,
  uploaded_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_at            TIMESTAMP NULL,
  reviewed_by            INT NULL REFERENCES users(id),
  integrated_document_id BIGINT NULL REFERENCES documents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_urf_request ON upload_request_files(request_id);
CREATE INDEX IF NOT EXISTS idx_urf_status ON upload_request_files(status);

-- ------------------------------------------------
-- notifications / notification_preferences
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(40) NOT NULL CHECK (type IN ('share','workflow','expiry','upload','system','document_approval')),
  title      VARCHAR(255) NOT NULL,
  message    TEXT NOT NULL,
  link       VARCHAR(500) NULL,
  is_read    SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_created ON notifications(created_at);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(40) NOT NULL CHECK (type IN ('share','workflow','expiry','upload','system','document_approval')),
  email_enabled   SMALLINT NOT NULL DEFAULT 1,
  in_app_enabled  SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, type)
);

-- ------------------------------------------------
-- ai_*
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_templates (
  id                   SERIAL PRIMARY KEY,
  name                 VARCHAR(100) NOT NULL,
  description          TEXT NULL,
  system_prompt        TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  language             VARCHAR(10) NOT NULL DEFAULT 'FR',
  tone                 VARCHAR(20) NOT NULL DEFAULT 'professionnel',
  length               VARCHAR(20) NOT NULL DEFAULT 'moyen',
  is_custom            SMALLINT NOT NULL DEFAULT 0,
  created_by           INT NOT NULL REFERENCES users(id),
  created_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_generations (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id),
  document_id BIGINT NULL REFERENCES documents(id) ON DELETE SET NULL,
  template_id INT NULL REFERENCES ai_templates(id) ON DELETE SET NULL,
  action      VARCHAR(50) NOT NULL,
  input_text  TEXT NULL,
  output_text TEXT NULL,
  model       VARCHAR(50) NULL,
  tokens_used INT NULL,
  cost        DECIMAL(10,6) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_generations_user_created ON ai_generations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_generations_action ON ai_generations(action);

CREATE TABLE IF NOT EXISTS ai_quotas (
  user_id         INT PRIMARY KEY REFERENCES users(id),
  daily_limit     INT NOT NULL DEFAULT 50,
  used_today      INT NOT NULL DEFAULT 0,
  last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS ai_usages (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action        VARCHAR(50) NOT NULL,
  model         VARCHAR(50) NULL,
  tokens        INT NOT NULL DEFAULT 0,
  cost          DECIMAL(10,6) NOT NULL DEFAULT 0,
  generation_id INT NULL REFERENCES ai_generations(id) ON DELETE SET NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usages_user_created ON ai_usages(user_id, created_at);

-- ------------------------------------------------
-- document_comments
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS document_comments (
  id          BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment     TEXT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_document_comments_updated_at ON document_comments;
CREATE TRIGGER trg_document_comments_updated_at BEFORE UPDATE ON document_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_document_comments_document ON document_comments(document_id);

-- ------------------------------------------------
-- preview_tokens
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS preview_tokens (
  id          BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  token       CHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_expires ON preview_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_document ON preview_tokens(document_id);

-- ------------------------------------------------
-- document_embeddings (pgvector — recherche sémantique)
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS document_embeddings (
  document_id BIGINT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  embedding   vector(384) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_hnsw
  ON document_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- ------------------------------------------------
-- Seeds par défaut : rôles, permissions, départements
-- ------------------------------------------------
INSERT INTO roles (name, description) VALUES
  ('admin',   'Administrator'),
  ('manager', 'Manager'),
  ('user',    'Standard user')
ON CONFLICT (name) DO UPDATE SET description = COALESCE(roles.description, EXCLUDED.description);

INSERT INTO departments (name, description) VALUES
  ('Marketing',  'Service Marketing'),
  ('Commercial', 'Service Commercial'),
  ('RH',         'Ressources Humaines'),
  ('Finance',    'Service Finance'),
  ('Direction',  'Direction générale')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (name, description) VALUES
  ('audit:read', 'Accès aux logs d''audit')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.name = 'audit:read'
ON CONFLICT DO NOTHING;
