-- Per-person UI theme (src/lib/themes.ts) so the choice follows the person
-- across devices. null = Aurora (the default). Checked against the known
-- ids so a stray value can never reach the pre-paint boot script.
begin;

alter table profiles
  add column if not exists ui_theme text
  check (ui_theme in ('aurora', 'shimol', 'midnight', 'zumrad', 'qum', 'grafit', 'lola', 'okean'));

commit;
