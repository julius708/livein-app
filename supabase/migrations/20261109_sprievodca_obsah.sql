-- Sprievodca bytom: rozšírený obsah (rozklikávacie sekcie), návrh z Guesty, úplnosť, pilot na všetky byty
alter table guide_cards add column if not exists checkin_time text;
alter table guide_cards add column if not exists sections jsonb not null default '[]'::jsonb;        -- [{key, icon, title{sk,en}, items[{title{sk,en}, body{sk,en}}]}]
alter table guide_cards add column if not exists guesty jsonb;                                       -- snímka importu z Guesty (bez kódov a hesiel) + imported_at
alter table guide_cards add column if not exists guesty_imported_at timestamptz;
alter table guide_cards add column if not exists completeness integer not null default 0;            -- 0–100, počíta server
alter table guide_rules add column if not exists title jsonb;                                        -- nadpis pravidla (rozklik)
alter table guide_rules add column if not exists icon text;
