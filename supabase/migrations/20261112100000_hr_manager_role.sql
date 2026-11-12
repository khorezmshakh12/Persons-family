-- HR (Humans Research Management) lavozimi (owner, 2026-11-12): HR hub
-- boshqaruvi (xodimlar profili, tuzilma, onboarding) va davomat. Oylik/moliya
-- va xodim akkauntlarini tahrirlash yo'q. Faqat enum qiymati; ruxsatlar
-- src/lib/permissions.ts'da.
begin;

alter type staff_role add value if not exists 'hr_manager';

commit;
