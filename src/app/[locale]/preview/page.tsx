'use client';

import { useState } from 'react';
import { Sparkles, Check, ZoomIn, ArrowRight, Palette } from 'lucide-react';
import { useBackground } from '@/components/theme/background-context';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

interface Concept {
  id: number;
  slug: string;
  name: string;
  badge: string;
  tagline: string;
  description: string;
  image: string;
  colors: string[];
  recommended?: boolean;
}

const CONCEPTS: Concept[] = [
  {
    id: 1,
    slug: 'biophilic-botanical',
    name: 'Biophilic Botanical Zen',
    badge: 'Tavsiya etiladi (Eng Tabiiy)',
    tagline: 'Quyoshli xona o‘simliklari, tabiiy yorug‘lik va adaçayı yashil shisha',
    description: 'Quyosh nurlari tushib turgan tirik monstera o‘simliklari, yumshoq adaçayı (sage green) va iliq qaymoqrang shaffof shisha kartalar. Ko‘zga maksimal orom beradi.',
    image: '/design-preview/1_biophilic_botanical_zen.jpg',
    colors: ['#84a98c', '#f5ebe0', '#52796f'],
    recommended: true,
  },
  {
    id: 2,
    slug: 'scandinavian-dawn',
    name: 'Warm Scandinavian Dawn',
    badge: 'Iliq Tong',
    tagline: 'Skandinaviya tumanli ko‘li uzra tonggi shaftoli-o‘rik quyoshi',
    description: 'Misty fjord uzra mayin pastel tong quyoshi, iliq oq shaffof shisha va moviy osmon chiziqlari. Pozitiv va ilhomlantiruvchi kayfiyat.',
    image: '/design-preview/2_warm_scandinavian_dawn.jpg',
    colors: ['#fbb6ce', '#fed7aa', '#38bdf8'],
  },
  {
    id: 3,
    slug: 'swiss-minimal',
    name: 'Clean Swiss / Apple Minimal',
    badge: 'Sof Korporativ',
    tagline: 'Ultra-toza oq akril shisha, studio yorug‘ligi va zumrad ko‘rsatkichlar',
    description: 'Minimalist xalqaro standartdagi toza oq shisha, yorug‘ studio foni, aniq qora tipografika va zumrad yashil ko‘rsatkichlar.',
    image: '/design-preview/3_clean_swiss_minimal.jpg',
    colors: ['#ffffff', '#10b981', '#06b6d4'],
  },
  {
    id: 4,
    slug: 'terracotta-dune',
    name: 'Sunset Terracotta Dune',
    badge: 'Iliq G‘urub',
    tagline: 'Oltin qum tepaliklari, terrakota va iliq g‘urub nurlari',
    description: 'Golden hour nurlari, shaftoli, asal rangli shisha va terrakota ohanglari. O‘ta qulay va samimiy oilaviy atmosfera.',
    image: '/design-preview/4_sunset_terracotta_dune.jpg',
    colors: ['#fb923c', '#fcd34d', '#9ca3af'],
  },
  {
    id: 5,
    slug: 'mediterranean-breeze',
    name: 'Mediterranean Coastal Breeze',
    badge: 'Yozgi Tiniqlik',
    tagline: 'Moviy dengiz sohili, tiniq yozgi quyosh va dengiz feruzasi',
    description: 'Kristalldek tiniq feruza dengiz, oppoq qoyalar, oq shaffof akril va to‘q moviy nina chiziqlari. Toza va erkin nafas beradi.',
    image: '/design-preview/5_mediterranean_coastal_breeze.jpg',
    colors: ['#0ea5e9', '#14b8a6', '#0369a1'],
  },
  {
    id: 6,
    slug: 'cherry-blossom',
    name: 'Serene Cherry Blossom & Pearl',
    badge: 'Yapon Nafisligi',
    tagline: 'Tumanli tog‘lar, ochilayotgan sakura va marvarid oq panellar',
    description: 'Marvariddek yarim shaffof oq oynalar, nozik pushti gultoj va adaçayı yashili. Tinchlantiruvchi va muvozanatli estetik uslub.',
    image: '/design-preview/6_serene_cherry_blossom.jpg',
    colors: ['#fbcfe8', '#86efac', '#ffffff'],
  },
  {
    id: 7,
    slug: 'warm-clay',
    name: 'Modern Warm Clay & Oatmeal',
    badge: 'Taktil 3D Loy',
    tagline: 'Rasm shovqinisiz toza organik yumshoq loy va suli 3D plitalari',
    description: 'Iliq sutli qahva (latte), yumshoq organik 3D bo‘rtma soyalar va toza xira xantallik. 100% taktil va ko‘zni aslo charchatmaydi.',
    image: '/design-preview/7_monochrome_modern_clay.jpg',
    colors: ['#d6ccc2', '#e3d5ca', '#7f9c80'],
  },
  {
    id: 8,
    slug: 'alpine-meadow',
    name: 'Alpine Meadow Fresh',
    badge: 'Tog‘ Havosi',
    tagline: 'Quyoshli yashil alp tog‘ vodiysi, gullar va toza yalpizli yorug‘lik',
    description: 'Yashil yam-yashil vodiylar, ertalabki shudring va quyoshli gulzorlar. Yangi kuch va tetiklik bag‘ishlovchi tabiiy dizayn.',
    image: '/design-preview/8_alpine_meadow_fresh.jpg',
    colors: ['#22c55e', '#6ee7b7', '#facc15'],
  },
  {
    id: 9,
    slug: 'autumn-cashmere',
    name: 'Autumn Cashmere & Warm Oak',
    badge: 'Iliq Kashmir',
    tagline: 'Iliq yog‘och, karamel, asal sarg‘ishligi va shinam uy ergonomikasi',
    description: 'Quyosh nuri tushib turgan shinam yog‘och stol va bej kashmir to‘qimasi. Uzoq soatlar davomida ishlash uchun juda qulay.',
    image: '/design-preview/9_autumn_cashmere_warmth.jpg',
    colors: ['#d97706', '#fde68a', '#e5e7eb'],
  },
  {
    id: 10,
    slug: 'nordic-twilight',
    name: 'Nordic Twilight & Soft Violet',
    badge: 'Nafis Shom',
    tagline: 'Skandinaviya shom payti, binafsha va oltin ufq uyg‘unligi',
    description: 'Mayin nilufar binafshasi, feruza ko‘rsatkichlar va yarim shaffof oynavand panellar. Zamonaviy, nafis va jozibador.',
    image: '/design-preview/10_nordic_twilight_calm.jpg',
    colors: ['#818cf8', '#c084fc', '#2dd4bf'],
  },
];

export default function DesignPreviewPage() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-2xl shadow-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-500/10 px-4 py-1.5 text-xs font-semibold text-teal-300 mb-4">
            <Sparkles className="size-4" /> 10 Xil Tabiiy va Zamonaviy Dizayn Konsepsiyasi
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
            Persons Staff — Qaysi Dizayn Sizga Ma‘qul?
          </h1>
          <p className="mt-3 text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Qorong‘u va og‘ir muhitdan xoli, tabiiy yorug‘lik, qulaylik va xalqaro standartdagi oddiylik uyg‘unlashgan 10 ta variant.
            Rasmni to‘liq ekranda ko‘rish uchun kartani bosing!
          </p>
        </header>

        {/* 10 Concepts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CONCEPTS.map((concept) => (
            <div
              key={concept.id}
              onClick={() => setSelectedImage(concept.image)}
              className={cn(
                'group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white/[0.04] p-5 transition-all duration-300 hover:-translate-y-1.5 cursor-pointer',
                concept.recommended
                  ? 'border-teal-400/60 shadow-[0_0_35px_rgba(45,212,191,0.2)]'
                  : 'border-white/10 hover:border-teal-400/40 hover:shadow-[0_15px_35px_rgba(0,0,0,0.5)]',
              )}
            >
              {/* Image Box */}
              <div className="relative mb-4 h-56 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={concept.image}
                  alt={concept.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

                {/* Badge */}
                <span className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-teal-300 border border-white/15 backdrop-blur-md">
                  {concept.badge}
                </span>

                {/* Zoom Icon overlay */}
                <span className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
                  <ZoomIn className="size-4" />
                </span>
              </div>

              {/* Body */}
              <div className="flex flex-col gap-2 flex-1">
                <h2 className="text-lg font-bold text-white group-hover:text-teal-300 transition-colors">
                  {concept.id}. {concept.name}
                </h2>
                <p className="text-xs font-semibold text-teal-300/90">{concept.tagline}</p>
                <p className="text-xs text-slate-400 leading-relaxed mt-1 flex-1">{concept.description}</p>
              </div>

              {/* Footer */}
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <div className="flex items-center gap-1.5">
                  {concept.colors.map((color, i) => (
                    <span
                      key={i}
                      className="size-3.5 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>

                <span className="flex items-center gap-1 text-xs font-bold text-teal-300 group-hover:translate-x-1 transition-transform">
                  Kattalashtirish <ArrowRight className="size-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fullscreen Zoom Modal */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-xl animate-fade-in"
        >
          <div className="relative max-w-6xl w-full max-h-[92vh] flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedImage}
              alt="Design Preview Fullscreen"
              className="max-h-[85vh] w-auto rounded-2xl border border-white/20 shadow-2xl object-contain"
            />
            <p className="mt-3 text-xs text-slate-400 font-medium">Yopish uchun istalgan joyni bosing</p>
          </div>
        </div>
      )}
    </div>
  );
}
