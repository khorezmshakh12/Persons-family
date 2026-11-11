-- Owner, 2026-11-11: B-nuqta — yillik maosh maqsadi emas, OYLIK daromad
-- maqsadi (A-nuqta = hozirgi oylik, B-nuqta = yetmoqchi bo'lgan oylik).
-- Shu paytgacha kiritilgan qiymatlar yillik edi — 12 ga bo'linib oylikka
-- aylantiriladi (xodim keyin o'zi aniqlashtirishi mumkin).
begin;

update staff_bpoint set amount = round(amount / 12) where amount > 0;

comment on column staff_bpoint.amount is 'B-nuqta: oylik daromad maqsadi (so''m/oy)';

commit;
