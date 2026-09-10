-- FUTBOL-CHEPICA-DOMAIN-01
-- El dominio raíz fue registrado externamente en NIC Chile el 2026-09-10.
-- Este cambio sólo declara la intención arquitectónica. No afirma DNS/TLS verificados.

INSERT OR IGNORE INTO web_host_bindings (
  hostname,platform_id,tenant_id,scope,verification_status,active,created_at,updated_at
) VALUES
  ('futbolchepica.cl','FUTBOL-CHEPICA',NULL,'PLATFORM','DECLARED',0,datetime('now'),datetime('now')),
  ('www.futbolchepica.cl','FUTBOL-CHEPICA',NULL,'PLATFORM','DECLARED',0,datetime('now'),datetime('now'));
