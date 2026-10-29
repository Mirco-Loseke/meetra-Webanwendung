-- Sage-Artikelnummer (8-stellig) je Filter + Beispiel BACKHUS 15.50 (Motor 6CTA), Nummern per Sage-Suche über die OEM-Nr. ermittelt.
-- Mehrfaches Ausführen ist unschädlich.
alter table public.machine_filters add column if not exists sage_artikelnr text;

insert into public.machine_filters (bezeichnung, art, oem_nr, sage_artikelnr, motor_typen, notiz)
select v.bez, v.art, v.oem, v.sage, '["6CTA"]'::jsonb, 'Aus Excel Betriebskosten (BACKHUS 15.50)'
from (values
  ('Motorölfilter',               'Ölfilter',        'P55-3000',  '00000007'),
  ('Kraftstofffilter',            'Dieselfilter',    'H60WK01',   '00000672'),
  ('Wasserfilter',                'Wasserfilter',    'BS60',      '00000665'),
  ('Luftfilter Austauschfilter',  'Luftfilter',      'P77-7409',  '00000662'),
  ('Luftfilter Sicherheitselement','Luftfilter',     'P77-7414',  '00000658')
) as v(bez, art, oem, sage)
where not exists (select 1 from public.machine_filters f where f.oem_nr = v.oem);

-- Fahrerschutzbelüftung (optional, Gruppe "Schutzbelüftung") für 6CTA, Sage-Nr. per Maße/Bezeichnung gefunden; Riemen ohne Sage-Nr.
insert into public.machine_filters (bezeichnung, art, oem_nr, sage_artikelnr, menge, motor_typen, notiz)
select v.bez, v.art, null, v.sage, v.menge, '["6CTA"]'::jsonb, v.notiz
from (values
  ('Partikelfilter F7 350 x 250 x 25 mm',        'Schutzbelüftung', '00000647', '2 Stück', 'Optional'),
  ('Schwebstofffilter S 350 x 250 x 100 mm',     'Schutzbelüftung', '00000648', '1 Stück', 'Optional; Sage-Maß 360 x 250 x 100'),
  ('Aktivkohlefilter AB 350 x 250 x 140 mm',     'Schutzbelüftung', '00000649', '1 Stück', 'Optional; Sage-Maß 360 x 250 x 140'),
  ('Papierpatrone',                              'Schutzbelüftung', '00000676', '1 Stück', 'Optional'),
  ('Kabinenumluft Partikelfilter 203 x 203 x 45 mm', 'Schutzbelüftung', '00000650', '1 Stück', 'Optional; Sage: G4, 203 x 203 x 46'),
  ('Kabinenumluft Schwebstofffilter 203 x 203 x 69 mm', 'Schutzbelüftung', '00001314', '1 Stück', 'Optional'),
  ('Keilriemen Generator',                       'Riemen', null, '1 Stück', 'Excel-Nr. 31.19.427 – Sage-Artikelnummer noch suchen'),
  ('Keilriemen Klima',                           'Riemen', null, '1 Stück', 'Excel-Nr. 32.00.027 – Sage-Artikelnummer noch suchen')
) as v(bez, art, sage, menge, notiz)
where not exists (select 1 from public.machine_filters f where f.bezeichnung = v.bez and f.motor_typen @> '["6CTA"]'::jsonb);
