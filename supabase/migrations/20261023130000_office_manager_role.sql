-- Office Manager lavozimi (owner, 2026-10-22): Operation HQ'dan to'liq
-- foydalanadi (O'quvchilar ham), to'lovga 3 kun qolganlar ro'yxati va kunlik
-- hisobot Telegram'da unga boradi. Faqat enum qiymati qo'shiladi; ruxsatlar
-- src/lib/permissions.ts'da.
begin;

alter type staff_role add value if not exists 'office_manager';

commit;
