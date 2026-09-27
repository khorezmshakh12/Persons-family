-- Persons Market v2: categories, wishlist, employee self-cancel, and the
-- 60-item starter catalogue (the owner's list, 2026-09-27).
--
--  * market_items.category — shop filter; one of six fixed buckets.
--  * market_items.seed_key — stable key for the starter rows so this insert is
--    idempotent and the CEO's later edits are never overwritten.
--  * market_orders.status gains 'cancelled' — an employee withdrawing their own
--    still-pending order (stars refunded in the same transaction).
--  * market_wishlist — who hearted what; drives restock pings and the CEO's
--    'most wanted' counts.
--
-- Starter rows ship without images; the CEO uploads one per item from the
-- edit dialog.
begin;

alter table market_items add column if not exists category text not null default 'gift';
alter table market_items add column if not exists seed_key text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'market_items_category_check') then
    alter table market_items add constraint market_items_category_check
      check (category in ('gift','food','time','learning','experience','special'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'market_items_seed_key_key') then
    alter table market_items add constraint market_items_seed_key_key unique (seed_key);
  end if;
end $$;

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'market_orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table market_orders drop constraint %I', c);
  end loop;
end $$;
alter table market_orders add constraint market_orders_status_check
  check (status in ('pending','approved','rejected','fulfilled','cancelled'));

create table if not exists market_wishlist (
  user_id    uuid not null references profiles(id) on delete cascade,
  item_id    uuid not null references market_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create index if not exists market_wishlist_item_idx on market_wishlist (item_id);

insert into market_items (seed_key, category, name, description, image_url, star_cost, stock)
values
  ('mug', 'gift', 'Persons krujkasi', 'Firma logotipli keramik krujka — ish stolingiz uchun.', null, 20, null),
  ('notebook-set', 'gift', 'Bloknot + ruchka to''plami', 'Qalin muqovali bloknot va sifatli ruchka.', null, 25, null),
  ('stickers', 'gift', 'Noutbuk stikerlari to''plami', 'Noutbuk va telefon uchun rangli stikerlar.', null, 15, null),
  ('tshirt', 'gift', 'Firma futbolkasi', '100% paxta, o''lchamni buyurtmada yozing.', null, 60, 20),
  ('thermos', 'gift', 'Termos / suv idishi', 'Issiq va sovuqni 12 soat saqlaydigan po''lat idish.', null, 70, 15),
  ('mouse', 'gift', 'Simsiz sichqoncha', 'Jim tugmali, ergonomik simsiz sichqoncha.', null, 90, 10),
  ('powerbank', 'gift', 'Powerbank 10 000 mAh', 'Telefonni 2–3 marta to''liq zaryadlaydi.', null, 100, 10),
  ('hoodie', 'gift', 'Firma hudi', 'Issiq, yumshoq hudi — qish uchun eng yaxshi sovg''a.', null, 200, 10),
  ('headphones', 'gift', 'Bluetooth quloqchin', 'Simsiz, shovqinni kamaytiruvchi quloqchin.', null, 250, 5),
  ('keyboard', 'gift', 'Mexanik klaviatura', 'Yozish uchun qulay mexanik klaviatura.', null, 300, 5),
  ('monitor-stand', 'gift', 'Monitor stendi', 'Yog''och-metall monitor stendi — bo''yin og''rimaydi.', null, 450, 3),
  ('premium-earbuds', 'gift', 'Premium simsiz quloqchin', 'Yuqori sifatli simsiz quloqchinlar (true wireless).', null, 900, 2),
  ('coffee', 'food', 'Kofe (ofisga)', 'Sevimli kofeyingiz ish joyingizga yetkazib beriladi.', null, 15, null),
  ('chocolate', 'food', 'Shokolad to''plami', 'Turli xil shokolad va shirinliklar qutisi.', null, 25, null),
  ('breakfast', 'food', 'Ofisda nonushta', 'Ertalabki nonushta — non, pishloq, choy/kofe.', null, 30, null),
  ('lunch', 'food', 'Firma hisobidan tushlik', 'Bir martalik tushlik — o''zingiz tanlagan joyda.', null, 60, null),
  ('pizza-team', 'food', 'Jamoa bilan pitsa', 'Bo''limingizga pitsa buyurtma qilinadi.', null, 120, null),
  ('grocery-card-small', 'food', 'Supermarket sovg''a kartasi (kichik)', '100 000 so''mlik supermarket sovg''a kartasi.', null, 80, null),
  ('restaurant-voucher', 'food', 'Restoran vaucheri (oilaviy)', 'Oila bilan kechki ovqat uchun vaucher.', null, 250, 5),
  ('grocery-card-big', 'food', 'Supermarket sovg''a kartasi (katta)', '500 000 so''mlik supermarket sovg''a kartasi.', null, 300, 5),
  ('lunch-week', 'food', 'Bir haftalik bepul tushlik', '5 ish kuni davomida tushlik firma hisobidan.', null, 280, null),
  ('plov-team', 'food', 'Jamoa uchun osh', 'Siz tanlagan kuni butun jamoaga osh.', null, 600, null),
  ('late-hour', 'time', '1 soat kech kelish', 'Bir kun 1 soat kechroq kelish huquqi.', null, 20, null),
  ('early-hour', 'time', '1 soat erta ketish', 'Bir kun 1 soat erta ketish huquqi.', null, 20, null),
  ('wfh-day', 'time', '1 kun uydan ishlash', 'Bir kunni uydan ishlab o''tkazing.', null, 50, null),
  ('focus-day', 'time', 'Yig''ilishsiz kun', 'Bir kun hech qanday yig''ilishga chaqirilmaysiz.', null, 60, null),
  ('best-desk', 'time', 'Eng yaxshi stol (1 hafta)', 'Bir hafta ofisdagi eng qulay joyda ishlash.', null, 70, 1),
  ('half-day', 'time', 'Yarim kunlik dam olish', 'Ish kunining yarmi — dam olish.', null, 150, null),
  ('birthday-off', 'time', 'Tug''ilgan kunida dam olish', 'Tug''ilgan kuningizda to''liq dam oling.', null, 180, null),
  ('long-lunch', 'time', 'Uzun tushlik (1 hafta)', 'Bir hafta davomida 2 soatlik tushlik tanaffusi.', null, 160, null),
  ('day-off', 'time', '1 kunlik qo''shimcha dam olish', 'To''liq bir kun qo''shimcha dam olish.', null, 400, null),
  ('short-friday', 'time', 'Qisqa juma (1 oy)', 'Bir oy davomida juma kunlari 2 soat erta ketish.', null, 450, null),
  ('wfh-week', 'time', '3 kun uydan ishlash', 'Bir hafta ichida 3 kun uydan ishlash.', null, 400, null),
  ('extra-vacation', 'time', 'Ta''tilga +2 kun', 'Yillik ta''tilingizga 2 kun qo''shiladi.', null, 800, null),
  ('ebook', 'learning', 'Elektron kitob', 'O''zingiz tanlagan elektron kitob.', null, 20, null),
  ('book', 'learning', 'Qog''oz kitob', 'O''zingiz tanlagan qog''oz kitob.', null, 50, null),
  ('online-course', 'learning', 'Onlayn kurs', 'Udemy/Coursera''dan bitta kurs.', null, 100, null),
  ('mentor-hour', 'learning', 'Mentor bilan 1 soat', 'CEO yoki bo''lim boshlig''i bilan 1 soatlik suhbat.', null, 80, null),
  ('english-course', 'learning', 'Ingliz tili kursi (1 oy)', 'Bir oylik ingliz tili kursi to''lovi.', null, 250, null),
  ('conference', 'learning', 'Konferensiya chiptasi', 'IT / biznes konferensiya yoki meetup chiptasi.', null, 220, null),
  ('premium-sub', 'learning', 'Premium obuna (1 oy)', 'AI yordamchi, Notion yoki til ilovasi obunasi.', null, 150, null),
  ('cert-exam', 'learning', 'Sertifikat imtihoni', 'Professional sertifikat imtihoni to''lovi.', null, 700, null),
  ('offline-course', 'learning', 'Oflayn o''quv kursi', 'IT, dizayn yoki marketing bo''yicha oflayn kurs.', null, 900, null),
  ('seminar-trip', 'learning', 'Viloyatdagi seminarga borish', 'Seminar + yo''l haqi firma hisobidan.', null, 1000, null),
  ('cinema', 'experience', 'Kino chiptasi', 'Kinoteatrga 1 kishilik chipta.', null, 30, null),
  ('bowling', 'experience', 'Bouling (2 kishi)', '2 kishilik bouling o''yini.', null, 90, null),
  ('quest-room', 'experience', 'Kvest xona', 'Do''stlar bilan kvest xona o''yini.', null, 120, null),
  ('taxi-credit', 'experience', 'Taksi krediti', 'Taksi ilovasi uchun 100 000 so''m kredit.', null, 70, null),
  ('gym', 'experience', 'Sport zali (1 oy)', 'Bir oylik sport zali abonementi.', null, 250, null),
  ('spa', 'experience', 'Basseyn / SPA', 'Basseyn yoki SPA''ga bir martalik tashrif.', null, 200, null),
  ('concert', 'experience', 'Konsert yoki futbol chiptasi', 'Konsert yoki futbol o''yiniga chipta.', null, 280, null),
  ('chimgan', 'experience', 'Chimyonda dam olish kuni', 'Chimyon / Amirsoyga bir kunlik sayohat.', null, 600, null),
  ('samarkand', 'experience', 'Samarqandga sayohat', 'Samarqand yoki Buxoroga poyezd chiptasi.', null, 800, null),
  ('hotel-weekend', 'experience', 'Mehmonxonada 2 kun (oilaviy)', 'Oila bilan 2 kunlik mehmonxona dam olishi.', null, 1000, null),
  ('badge', 'special', '"Oy xodimi" badge', 'Profilingizda bir oy davomida maxsus nishon.', null, 15, null),
  ('chat-title', 'special', 'Chatdagi maxsus unvon', 'Jamoa chatida maxsus rang yoki unvon (1 oy).', null, 25, null),
  ('ceo-lunch', 'special', 'CEO bilan tushlik', 'Rahbar bilan birga tushlik va suhbat.', null, 120, null),
  ('pick-event', 'special', 'Jamoaviy tadbirni tanlash', 'Keyingi jamoa tadbirini siz tanlaysiz.', null, 100, null),
  ('charity', 'special', 'Xayriya', 'Sizning nomingizdan xayriya fondiga o''tkazma.', null, 200, null),
  ('golden-ticket', 'special', 'Oltin chipta', 'O''zingiz tanlagan istalgan sovg''a (belgilangan summagacha).', null, 1000, 1)
on conflict (seed_key) do nothing;

commit;
