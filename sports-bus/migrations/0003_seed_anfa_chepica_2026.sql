INSERT OR IGNORE INTO competitions (competition_id,name,season_id,phase,source_label,active,created_at,updated_at) VALUES
('ANFA-CHEPICA-2026','Campeonato ANFA Chépica 2026','2026','FASE_GRUPOS','Asociación de Fútbol Chépica — material suministrado por usuario',1,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z');

INSERT OR IGNORE INTO teams (team_id,canonical_name,group_id,active,created_at,updated_at) VALUES
('JUV-CHEPICA','Juventud de Chépica','A',1,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),
('SANTA-ELENA','Santa Elena La Ruda','A',1,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),
('INDEPENDIENTE','Independiente','A',1,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),
('UNION-ORILLA','Unión Orilla','A',1,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),
('SAN-JUAN','San Juan','A',1,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),
('PENAROL-LA-MINA','Peñarol La Mina','A',1,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),
('HURACAN','Huracán','B',1,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),
('SAN-AGUSTIN','San Agustín','B',1,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),
('SAN-RAMON','San Ramón','B',1,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),
('LAS-PALMERAS','Las Palmeras','B',1,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z'),
('LAS-CRUCES','Las Cruces','B',1,'2026-09-08T00:00:00Z','2026-09-08T00:00:00Z');

INSERT OR IGNORE INTO team_aliases (alias,team_id,source_label) VALUES
('Juv Chepica','JUV-CHEPICA','fixture screenshot'),
('Santa Elena','SANTA-ELENA','fixture screenshot'),
('Independiente aunquinco','INDEPENDIENTE','fixture screenshot'),
('Union Orilla','UNION-ORILLA','fixture screenshot'),
('San Juan','SAN-JUAN','fixture screenshot'),
('Peñarol la Mina','PENAROL-LA-MINA','fixture screenshot'),
('Huracan','HURACAN','fixture screenshot'),
('San Agustin Las hijuelas','SAN-AGUSTIN','fixture screenshot'),
('San Ramon','SAN-RAMON','fixture screenshot'),
('Las Palmeras','LAS-PALMERAS','fixture screenshot'),
('Las Cruces','LAS-CRUCES','fixture screenshot');

INSERT OR IGNORE INTO matches (match_id,competition_id,season_id,round_label,kickoff_at,home_id,home_name,away_id,away_name,status,home_score,away_score,validation_status,source_event_id,updated_at,group_id,round_no,source_label,source_ref) VALUES
('A-F1-M1','ANFA-CHEPICA-2026','2026','Fecha I',NULL,'SANTA-ELENA','Santa Elena La Ruda','UNION-ORILLA','Unión Orilla','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',1,'Santa Elena - Union Orilla','user-supplied fixture screenshot'),
('A-F1-M2','ANFA-CHEPICA-2026','2026','Fecha I',NULL,'INDEPENDIENTE','Independiente','PENAROL-LA-MINA','Peñarol La Mina','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',1,'Independiente aunquinco - Peñarol la Mina','user-supplied fixture screenshot'),
('A-F1-M3','ANFA-CHEPICA-2026','2026','Fecha I',NULL,'SAN-JUAN','San Juan','JUV-CHEPICA','Juventud de Chépica','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',1,'San Juan - Juv Chepica','user-supplied fixture screenshot'),
('A-F2-M1','ANFA-CHEPICA-2026','2026','Fecha II',NULL,'JUV-CHEPICA','Juventud de Chépica','INDEPENDIENTE','Independiente','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',2,'Juv Chepica - Independiente aunquinco','user-supplied fixture screenshot'),
('A-F2-M2','ANFA-CHEPICA-2026','2026','Fecha II',NULL,'UNION-ORILLA','Unión Orilla','SAN-JUAN','San Juan','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',2,'Union Orilla - San Juan','user-supplied fixture screenshot'),
('A-F2-M3','ANFA-CHEPICA-2026','2026','Fecha II',NULL,'PENAROL-LA-MINA','Peñarol La Mina','SANTA-ELENA','Santa Elena La Ruda','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',2,'Peñarol la Mina - Santa Elena','user-supplied fixture screenshot'),
('A-F3-M1','ANFA-CHEPICA-2026','2026','Fecha III',NULL,'SANTA-ELENA','Santa Elena La Ruda','JUV-CHEPICA','Juventud de Chépica','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',3,'Santa Elena - Juv Chepica','user-supplied fixture screenshot'),
('A-F3-M2','ANFA-CHEPICA-2026','2026','Fecha III',NULL,'INDEPENDIENTE','Independiente','SAN-JUAN','San Juan','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',3,'Independiente aunquinco - San Juan','user-supplied fixture screenshot'),
('A-F3-M3','ANFA-CHEPICA-2026','2026','Fecha III',NULL,'PENAROL-LA-MINA','Peñarol La Mina','UNION-ORILLA','Unión Orilla','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',3,'Peñarol la Mina - Union Orilla','user-supplied fixture screenshot'),
('A-F4-M1','ANFA-CHEPICA-2026','2026','Fecha IV',NULL,'JUV-CHEPICA','Juventud de Chépica','PENAROL-LA-MINA','Peñarol La Mina','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',4,'Juv Chepica - Peñarol la Mina','user-supplied fixture screenshot'),
('A-F4-M2','ANFA-CHEPICA-2026','2026','Fecha IV',NULL,'INDEPENDIENTE','Independiente','UNION-ORILLA','Unión Orilla','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',4,'Independiente aunquinco - Union Orilla','user-supplied fixture screenshot'),
('A-F4-M3','ANFA-CHEPICA-2026','2026','Fecha IV',NULL,'SAN-JUAN','San Juan','SANTA-ELENA','Santa Elena La Ruda','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',4,'San Juan - Santa Elena','user-supplied fixture screenshot'),
('A-F5-M1','ANFA-CHEPICA-2026','2026','Fecha V',NULL,'SANTA-ELENA','Santa Elena La Ruda','INDEPENDIENTE','Independiente','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',5,'Santa Elena - Independiente aunquinco','user-supplied fixture screenshot'),
('A-F5-M2','ANFA-CHEPICA-2026','2026','Fecha V',NULL,'UNION-ORILLA','Unión Orilla','JUV-CHEPICA','Juventud de Chépica','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',5,'Union Orilla - Juv Chepica','user-supplied fixture screenshot'),
('A-F5-M3','ANFA-CHEPICA-2026','2026','Fecha V',NULL,'PENAROL-LA-MINA','Peñarol La Mina','SAN-JUAN','San Juan','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','A',5,'Peñarol la Mina - San Juan','user-supplied fixture screenshot'),
('B-F1-M1','ANFA-CHEPICA-2026','2026','Fecha I',NULL,'SAN-AGUSTIN','San Agustín','LAS-CRUCES','Las Cruces','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','B',1,'San Agustin Las hijuelas - Las Cruces','user-supplied fixture screenshot'),
('B-F1-M2','ANFA-CHEPICA-2026','2026','Fecha I',NULL,'LAS-PALMERAS','Las Palmeras','HURACAN','Huracán','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','B',1,'Las Palmeras - Huracan','user-supplied fixture screenshot'),
('B-F2-M1','ANFA-CHEPICA-2026','2026','Fecha II',NULL,'HURACAN','Huracán','SAN-RAMON','San Ramón','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','B',2,'Huracan - San Ramon','user-supplied fixture screenshot'),
('B-F2-M2','ANFA-CHEPICA-2026','2026','Fecha II',NULL,'LAS-CRUCES','Las Cruces','LAS-PALMERAS','Las Palmeras','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','B',2,'Las Cruces - Las Palmeras','user-supplied fixture screenshot'),
('B-F3-M1','ANFA-CHEPICA-2026','2026','Fecha III',NULL,'SAN-AGUSTIN','San Agustín','HURACAN','Huracán','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','B',3,'San Agustin Las hijuelas - Huracan','user-supplied fixture screenshot'),
('B-F3-M2','ANFA-CHEPICA-2026','2026','Fecha III',NULL,'SAN-RAMON','San Ramón','LAS-PALMERAS','Las Palmeras','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','B',3,'San Ramon - Las Palmeras','user-supplied fixture screenshot'),
('B-F4-M1','ANFA-CHEPICA-2026','2026','Fecha IV',NULL,'SAN-RAMON','San Ramón','LAS-CRUCES','Las Cruces','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','B',4,'San Ramon - Las Cruces','user-supplied fixture screenshot'),
('B-F4-M2','ANFA-CHEPICA-2026','2026','Fecha IV',NULL,'LAS-PALMERAS','Las Palmeras','SAN-AGUSTIN','San Agustín','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','B',4,'Las Palmeras - San Agustin Las hijuelas','user-supplied fixture screenshot'),
('B-F5-M1','ANFA-CHEPICA-2026','2026','Fecha V',NULL,'SAN-AGUSTIN','San Agustín','SAN-RAMON','San Ramón','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','B',5,'San Agustin Las hijuelas - San Ramon','user-supplied fixture screenshot'),
('B-F5-M2','ANFA-CHEPICA-2026','2026','Fecha V',NULL,'LAS-CRUCES','Las Cruces','HURACAN','Huracán','SCHEDULED',NULL,NULL,'PENDING',NULL,'2026-09-08T00:00:00Z','B',5,'Las Cruces - Huracan','user-supplied fixture screenshot');

INSERT OR IGNORE INTO byes (bye_id,competition_id,season_id,group_id,round_no,team_id,source_label,created_at) VALUES
('B-F1-BYE','ANFA-CHEPICA-2026','2026','B',1,'SAN-RAMON','San Ramon - Libre','2026-09-08T00:00:00Z'),
('B-F2-BYE','ANFA-CHEPICA-2026','2026','B',2,'SAN-AGUSTIN','Libre - San Agustin Las hijuelas','2026-09-08T00:00:00Z'),
('B-F3-BYE','ANFA-CHEPICA-2026','2026','B',3,'LAS-CRUCES','Libre - Las Cruces','2026-09-08T00:00:00Z'),
('B-F4-BYE','ANFA-CHEPICA-2026','2026','B',4,'HURACAN','Huracan - Libre','2026-09-08T00:00:00Z'),
('B-F5-BYE','ANFA-CHEPICA-2026','2026','B',5,'LAS-PALMERAS','Libre - Las Palmeras','2026-09-08T00:00:00Z');
