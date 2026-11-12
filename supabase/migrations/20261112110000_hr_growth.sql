-- HR › Roadmap va Mind map (owner, 2026-11-12): har bir xodimning shaxsiy
-- rivojlanish rejasi. Strategy'dagi Roadmap / Mind map ko'rinishida, lekin
-- cheksiz shoxlar bilan. roadmap/mind — xodimning o'zi yozadi.
-- stage_state — faqat server action'lar yozadi (xodim «yakunladim», CEO
-- tasdiq / qaytarish). submitted_at bo'sh bo'lsa roadmap CEO'ga ko'rinmaydi;
-- mind map CEO'ga doim ko'rinadi.
begin;

create table if not exists hr_growth (
  user_id uuid primary key references profiles(id) on delete cascade,
  roadmap jsonb not null default '{"name":"","subtitle":"","sections":[]}'::jsonb,
  node_status jsonb not null default '{}'::jsonb,
  stage_state jsonb not null default '{}'::jsonb,
  mind jsonb not null default '{"t":"","ch":[]}'::jsonb,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

commit;
