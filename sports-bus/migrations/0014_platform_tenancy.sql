-- FUTBOL-CHEPICA-PLATFORM-01
-- Materializa la jerarquía lógica PLATFORM -> COMPETITION -> TENANT/CLUB.
-- No activa DNS ni custom domains: esas vinculaciones requieren verificación externa.

ALTER TABLE competitions ADD COLUMN platform_id TEXT;

CREATE TABLE IF NOT EXISTS platforms (
  platform_id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  club_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  route_path TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(platform_id) REFERENCES platforms(platform_id),
  FOREIGN KEY(club_id) REFERENCES teams(team_id)
);

CREATE TABLE IF NOT EXISTS web_host_bindings (
  hostname TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  tenant_id TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('PLATFORM','TENANT')),
  verification_status TEXT NOT NULL DEFAULT 'DECLARED' CHECK (verification_status IN ('DECLARED','VERIFIED')),
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(platform_id) REFERENCES platforms(platform_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(tenant_id),
  CHECK ((scope='PLATFORM' AND tenant_id IS NULL) OR (scope='TENANT' AND tenant_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_tenants_platform ON tenants(platform_id, active, slug);
CREATE INDEX IF NOT EXISTS idx_host_bindings_context ON web_host_bindings(platform_id, tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_competitions_platform ON competitions(platform_id, active);

INSERT OR IGNORE INTO platforms (
  platform_id,canonical_name,slug,active,created_at,updated_at
) VALUES (
  'FUTBOL-CHEPICA','Fútbol Chépica','futbol-chepica',1,'2026-09-10T00:00:00Z','2026-09-10T00:00:00Z'
);

UPDATE competitions
SET platform_id='FUTBOL-CHEPICA', updated_at='2026-09-10T00:00:00Z'
WHERE competition_id='ANFA-CHEPICA-2026';

-- Los equipos actuales del campeonato se materializan como tenants de club.
-- CUDO mantiene identidad de marca propia pero su club_id deportivo canónico sigue siendo UNION-ORILLA.
INSERT OR IGNORE INTO tenants (
  tenant_id,platform_id,club_id,slug,display_name,route_path,active,created_at,updated_at
)
SELECT
  CASE WHEN team_id='UNION-ORILLA' THEN 'CUDO' ELSE team_id END,
  'FUTBOL-CHEPICA',
  team_id,
  CASE WHEN team_id='UNION-ORILLA' THEN 'cudo' ELSE lower(team_id) END,
  CASE WHEN team_id='UNION-ORILLA' THEN 'C.U.D.O.' ELSE canonical_name END,
  '/clubes/' || CASE WHEN team_id='UNION-ORILLA' THEN 'cudo' ELSE lower(team_id) END,
  active,
  '2026-09-10T00:00:00Z',
  '2026-09-10T00:00:00Z'
FROM teams
WHERE team_id IN (
  'JUV-CHEPICA','SANTA-ELENA','INDEPENDIENTE','UNION-ORILLA','SAN-JUAN','PENAROL-LA-MINA',
  'HURACAN','SAN-AGUSTIN','SAN-RAMON','LAS-PALMERAS','LAS-CRUCES'
);

-- cudo.cl se registra sólo como intención declarada, NO como binding DNS verificado/activo.
INSERT OR IGNORE INTO web_host_bindings (
  hostname,platform_id,tenant_id,scope,verification_status,active,created_at,updated_at
) VALUES
  ('cudo.cl','FUTBOL-CHEPICA','CUDO','TENANT','DECLARED',0,'2026-09-10T00:00:00Z','2026-09-10T00:00:00Z'),
  ('www.cudo.cl','FUTBOL-CHEPICA','CUDO','TENANT','DECLARED',0,'2026-09-10T00:00:00Z','2026-09-10T00:00:00Z');
