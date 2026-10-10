'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  ListTodo,
  Wallet,
  Users,
  ShoppingBag,
  MessageSquare,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';
import {
  DashboardSkeleton,
  TasksKanbanSkeleton,
  FinanceSkeleton,
  StaffDirectorySkeleton,
  MarketGridSkeleton,
  ChatSkeleton,
} from '@/components/skeletons/page-skeletons';

type SectionKey = 'dashboard' | 'tasks' | 'finance' | 'staff' | 'market' | 'chat';

interface SectionTab {
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const TABS: SectionTab[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: '4 Stat-karta, Kompaniya yangiliklari, O‘qituvchilar o‘sish grafigi, Yulduzlar reytingi va Heatmap.',
  },
  {
    key: 'tasks',
    label: 'Tasks (Kanban)',
    icon: ListTodo,
    description: '3 Ustunli Kanban doskasi (Rejalashtirilgan, Jarayonda, Bajarildi) va oylik vazifalar arxivi.',
  },
  {
    key: 'finance',
    label: 'Finance & Roadmap',
    icon: Wallet,
    description: 'Oylik maoshlar xulosasi va 12 oylik Daromadlar o‘sish yo‘l xaritasi (Income Roadmap).',
  },
  {
    key: 'staff',
    label: 'Staff Directory',
    icon: Users,
    description: 'Xodimlar ro‘yxati, qidiruv-filtr paneli, lavozimlar va yulduzlar balansi.',
  },
  {
    key: 'market',
    label: 'Persons Market',
    icon: ShoppingBag,
    description: 'Xodimlar ishlab topgan yulduzlariga sovg‘a va mahsulotlar olish vitrinasi.',
  },
  {
    key: 'chat',
    label: 'Staff Chat',
    icon: MessageSquare,
    description: 'Ichki tezkor muloqot va bildirishnomalar oynasi.',
  },
];

const CLAUDE_PROMPT = `You are Claude Design, the UI/UX architect for Persons Education Platform.
Aesthetic: Ethereal Glassmorphism over scenic photo backgrounds (rounded-2xl, border border-white/20, bg-white/10, backdrop-blur-md, text-white).
Icons: Lucide React.
Language: Uzbek (uz).
Timezone: Asia/Tashkent.

Design following the platform skeleton in CLAUDE_DESIGN_SYSTEM.md.`;

export default function SkeletonPreviewPage() {
  const [activeTab, setActiveTab] = useState<SectionKey>('dashboard');
  const [copied, setCopied] = useState(false);

  const copyPrompt = () => {
    navigator.clipboard.writeText(CLAUDE_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Top Banner */}
      <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between')}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
              <Sparkles className="size-3.5" />
              Claude Design Blueprint
            </span>
          </div>
          <h1 className="text-2xl font-bold font-heading text-white tracking-tight [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
            Sayt Skeleti & Simkarkas (Wireframe System)
          </h1>
          <p className="text-sm text-white/70 max-w-2xl">
            Claude Design saytingizni to‘liq tanib olishi uchun barcha sahifalar skeleti, joylashuv proporsiyalari va
            Glassmorphism tokenlari bir joyga jamlandi.
          </p>
        </div>

        <button
          onClick={copyPrompt}
          className={cn(
            GLASS_INTERACTIVE,
            'flex items-center gap-2 rounded-xl border border-white/30 bg-white/15 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md hover:bg-white/25',
          )}
        >
          {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
          <span>{copied ? 'Nusxa olindi!' : 'Claude Promptdan nusxa olish'}</span>
        </button>
      </div>

      {/* Tabs navigation */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ease-bounce',
                isActive
                  ? 'border border-white/40 bg-white/25 text-white shadow-lg backdrop-blur-md scale-105'
                  : 'border border-white/10 bg-white/10 text-white/70 hover:bg-white/15 hover:text-white backdrop-blur-sm',
              )}
            >
              <Icon className="size-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Tab Description */}
      <div className="flex items-center justify-between text-xs text-white/60 px-1">
        <span>{TABS.find((t) => t.key === activeTab)?.description}</span>
        <span className="font-mono text-white/40">Tokens: GLASS_CARD • GlassBar • Asia/Tashkent</span>
      </div>

      {/* Rendered Skeleton Viewport */}
      <div className="mt-2">
        {activeTab === 'dashboard' && <DashboardSkeleton />}
        {activeTab === 'tasks' && <TasksKanbanSkeleton />}
        {activeTab === 'finance' && <FinanceSkeleton />}
        {activeTab === 'staff' && <StaffDirectorySkeleton />}
        {activeTab === 'market' && <MarketGridSkeleton />}
        {activeTab === 'chat' && <ChatSkeleton />}
      </div>
    </div>
  );
}
