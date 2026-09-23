# Persons Aurora — Design System

Persons Education Platform uchun asosiy dizayn tizimi. **Glassmorphism o'rniga keladi.**
Yorqin, iliq, zamonaviy: oq kartalar, iliq krem fon, o'rik rangli urg'u va har sahifada bitta mesh-gradient hero.

Vizual namuna: `reference/aurora-dashboard.html` (brauzerda oching) va `reference/aurora-dashboard.png`.
Tokenlar: `src/styles/aurora.css`. Tailwind: `src/tailwind.aurora.ts` (v3) yoki `aurora.css` ichidagi `@theme` (v4). Class to'plamlari: `src/lib/glass.ts`.

Til: o'zbek (lotin). Vaqt mintaqasi: Asia/Tashkent.

---

## 1. Qat'iy qoidalar (Claude Code shularga amal qilsin)

1. **Glass yo'q.** `backdrop-blur`, `bg-white/10`, `border-white/20` va fon fotolari to'liq olib tashlanadi. `text-white` faqat qora yoki accent fon ustida qoladi.
2. **Hex yozilmaydi.** Komponentlarda faqat `au-*` Tailwind ranglari yoki `@/lib/glass` konstantalari ishlatiladi.
3. **Asosiy tugma qora** (`BTN_PRIMARY`). Ekranda bittadan ko'p bo'lmaydi.
4. **O'rik rang (accent)** grafiklar, progress, halqa, yulduz (★) va mukofot harakatlari uchun ishlatiladi. Oq fonda o'rik rangli **matn** faqat `text-au-accent-text` bilan yoziladi (`#a85a00`, 4.5:1 kontrast).
5. **Hero:** har sahifa tepasida bitta `SURFACE_HERO` (mesh gradient). Boshqa joyda gradient ishlatilmaydi.
6. **`au-faint` matn uchun emas.** U faqat dekor, placeholder va disabled holat uchun. Meta matn `au-muted` bo'ladi.
7. **Raqamlar** `tabular-nums` bilan. Pul `12 500 000 so'm` shaklida (bo'shliq bilan).
8. **Emoji UI'da yo'q.** Ikonkalar: `lucide-react`, stroke 1.75, 16–18px.

---

## 2. Tokenlar

| Token | Qiymat | Qayerda |
|---|---|---|
| `au-bg` | `#f4f2ee` | Sahifa foni |
| `au-sidebar` | `#faf9f7` | Sidebar |
| `au-card` | `#ffffff` | Karta |
| `au-card-2` | `#f4f1ec` | Ichki blok, segment, progress track |
| `au-line` | `#ebe6de` | 1px chegara |
| `au-ink` | `#17161a` | Asosiy matn, asosiy tugma |
| `au-muted` | `#6c6873` | Ikkilamchi matn |
| `au-faint` | `#a39fa8` | Faqat dekor/disabled |
| `au-accent` | `#ff9f1c` | Grafik, halqa, progress, accent tugma foni |
| `au-accent-text` | `#a85a00` | Oq fonda accent matn |
| `au-accent-soft` | `rgba(255,159,28,.16)` | Accent chip foni |
| `au-ok` / `au-info` / `au-bad` | `#0c7a3f` / `#1f6ab4` / `#c7322b` | Holatlar |
| Grafik ranglari | `#ff9f1c`, `#ff6b6b`, `#17161a`, `#efeae3` | Shu tartibda |

**Shakl:** karta radius 20px, boshqaruv elementlari 10px. Karta soyasi `shadow-au-card`. Chegara har doim 1px `au-line`.

**Shrift:** Inter (400/500/600/700). Hero'dagi ism uchun Instrument Serif italic (`font-display italic`), boshqa hech qayerda emas.

| Uslub | O'lcham | Og'irlik |
|---|---|---|
| Hero sarlavha | 38/44 | 700, ism: serif italic 46px |
| Sahifa sarlavhasi | 28/34 | 700 |
| Karta sarlavhasi | 15/20 | 700 |
| KPI raqami | 30/34 | 700, tabular |
| Asosiy matn | 14/20 | 400 |
| Meta/label | 12–13 | 500–600 |

**Masofa:** 4px setka. Karta ichki padding 20px (hero 28–30px). Grid orasi 18px. Sahifa padding 22–28px.

---

## 3. Layout skeleti

```
┌ Sidebar 244px (au-sidebar, o'ngda 1px chiziq) ┬ Main (au-bg) ─────────────────────────────┐
│ Logo (qora kvadrat, o'rik "P")                │ Topbar: breadcrumbs · qidiruv ⌘K · 🔔 · ★450 │
│ Nav guruhlari: —, Motivatsiya,                │ ┌ HERO (8 col) ─────────────┐ ┌ Reyting ┐ │
│   Ish jarayoni, Boshqaruv                     │ │ salom + xulosa + 2 tugma  │ │ (4 col, │ │
│ Faol item: oq fon + ring-1 au-line            │ │ + 78% halqa               │ │ 2 qator)│ │
│ Pastda: Q3 maqsad kartasi + profil            │ └───────────────────────────┘ │         │ │
│                                               │ ┌ KPI ×4 (8 col) ──────────┐ │         │ │
│                                               │ └───────────────────────────┘ └─────────┘ │
│                                               │ ┌ Bar 5 ┐ ┌ Donut 3 ┐ ┌ Faollik 4 ┐       │
└───────────────────────────────────────────────┴──────────────────────────────────────────┘
```

Mobil (<960px): sidebar chapdan chiqadigan drawer bo'ladi. Grid 1 ustun, KPI'lar 2 ustun.

---

## 4. Komponent retseptlari

- **Karta:** `SURFACE_CARD p-5`. Sarlavha qatori: chapda sarlavha, o'ngda `text-xs font-semibold text-au-muted` havola ("Batafsil →").
- **KPI karta:** label + ikonka kvadrati (`size-[30px] rounded-[9px] bg-au-card-2`), katta raqam, delta chip (`CHIP_OK` / `CHIP_BAD`) + izoh, pastda 7 ta mini ustun (oxirgisi `bg-au-accent`, qolganlari `bg-au-chart-4`).
- **Hero:** `SURFACE_HERO px-[30px] py-7`. Eyebrow (yashil nuqta + sana, `text-au-accent-text text-xs font-semibold`), sarlavha, 1–2 qatorli xulosa (muhim so'zlar `font-semibold text-au-ink`), pastda `BTN_PRIMARY` + `BTN_SECONDARY`. O'ngda SVG halqa: track `rgba(23,22,26,.08)`, qiymat `au-accent`, stroke 9, uchi yumaloq. Fonda nozik konsentrik doiralar (accent, opacity .12–.5).
- **Reyting:** 1-2-3 o'rin shohsupada. 1-o'rin: accent gradient ustun, toj ikonkasi, avatar atrofida 2px accent halqa. 4+ o'rinlar ro'yxat qatori: o'rin, avatar, ism, ▲/▼ trend, ball. Pastda "Siz N-o'rindasiz" `SURFACE_INSET` bloki.
- **Bar grafik:** ustunlar `bg-au-chart-4`, radius 8/4. Bugungi ustun accent gradient va tepasida qora tooltip. Kelajak kunlar chiziqli (hatched) naqsh bilan.
- **Donut:** stroke 12. Markazda jami raqam, pastda 2 ustunli legenda.
- **Faollik:** 31px dumaloq ikonka (holat rangida), vertikal 1px chiziq bilan bog'langan qatorlar, vaqt `text-au-faint text-xs`.
- **Jadval:** kartaning ichida. `th`: 11px uppercase `text-au-muted`. Qatorlar orasida 1px `au-line`, hover `bg-au-card-2`.
- **Avatar:** rasm bo'lmasa, ism harflari va gradient fon (5 ta palitra, xodim ID bo'yicha tanlanadi).

---

## 5. Holatlar va harakat

- Hover: karta `shadow-au-card` → biroz kuchliroq soya. Tugma → rang biroz o'zgaradi. Sakrash yoki scale yo'q.
- Animatsiya: 150ms `ease-out`. `prefers-reduced-motion` hurmat qilinadi.
- Yuklanish: skeleton (`bg-au-card-2 animate-pulse rounded-au-ctl`).
- Bo'sh holat: ikonka + bir qator izoh + bitta `BTN_PRIMARY`.
- Fokus: `ring-2`, klaviaturada doim ko'rinadi.
