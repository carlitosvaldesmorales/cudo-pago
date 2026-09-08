CREATE TABLE IF NOT EXISTS match_series_results (
  result_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  home_score INTEGER NOT NULL CHECK(home_score >= 0),
  away_score INTEGER NOT NULL CHECK(away_score >= 0),
  validation_status TEXT NOT NULL DEFAULT 'PENDING',
  source_type TEXT,
  source_label TEXT,
  source_ref TEXT,
  played_on TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(match_id, series_code),
  FOREIGN KEY(match_id) REFERENCES matches(match_id)
);
CREATE INDEX IF NOT EXISTS idx_series_match ON match_series_results(match_id,series_code);

INSERT OR REPLACE INTO match_series_results(result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,played_on,created_at,updated_at) VALUES
('A-F1-M1-TERCERA','A-F1-M1','TERCERA',1,0,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('A-F1-M1-SEGUNDA','A-F1-M1','SEGUNDA',2,1,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('A-F1-M1-SENIOR','A-F1-M1','SENIOR',0,2,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('A-F1-M1-PRIMERA','A-F1-M1','PRIMERA',1,2,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('A-F1-M2-TERCERA','A-F1-M2','TERCERA',0,1,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('A-F1-M2-SEGUNDA','A-F1-M2','SEGUNDA',1,2,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('A-F1-M2-SENIOR','A-F1-M2','SENIOR',1,2,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('A-F1-M2-PRIMERA','A-F1-M2','PRIMERA',0,2,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('A-F1-M3-TERCERA','A-F1-M3','TERCERA',0,1,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('A-F1-M3-SEGUNDA','A-F1-M3','SEGUNDA',0,3,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('A-F1-M3-SENIOR','A-F1-M3','SENIOR',1,4,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('A-F1-M3-PRIMERA','A-F1-M3','PRIMERA',1,1,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('B-F1-M1-TERCERA','B-F1-M1','TERCERA',0,1,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('B-F1-M1-SEGUNDA','B-F1-M1','SEGUNDA',0,1,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('B-F1-M1-SENIOR','B-F1-M1','SENIOR',0,1,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('B-F1-M1-PRIMERA','B-F1-M1','PRIMERA',0,6,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('B-F1-M2-TERCERA','B-F1-M2','TERCERA',1,3,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('B-F1-M2-SEGUNDA','B-F1-M2','SEGUNDA',1,3,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('B-F1-M2-SENIOR','B-F1-M2','SENIOR',0,0,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z'),
('B-F1-M2-PRIMERA','B-F1-M2','PRIMERA',0,2,'VERIFIED','OFFICIAL_PUBLISHED_GRAPHIC','Asociación de Fútbol Chépica — Resultados Fecha I','user-supplied official publication','2026-08-23','2026-09-08T19:00:00Z','2026-09-08T19:00:00Z');
