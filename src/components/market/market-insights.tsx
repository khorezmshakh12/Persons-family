'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, BarChart3, Gift, Heart, PackageCheck, Timer, Users } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { CARD_TITLE, CHIP_BAD, CHIP_NEUTRAL, INPUT, SURFACE_CARD } from '@/lib/glass';
import { setMarketLowStockAction, setMarketOrderFulfilledAction, type MarketInsights } from '@/lib/actions/market';

const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

function Card({ title, icon, i, children, className }: { title: string; icon: React.ReactNode; i: number; children: React.ReactNode; className?: string }) {
  return (
    <section style={{ ['--i' as string]: i }} className={cn(SURFACE_CARD, 'ms-rise flex min-w-0 flex-col gap-3 p-4', className)}>
      <h3 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
        <span className="text-au-muted">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** CEO: hand-over queue, stock alerts and what the shop is telling us. */
export function MarketInsightsPanel({ data }: { data: MarketInsights }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [handover, setHandover] = useState(data.handover);
  const [thr, setThr] = useState<Record<string, string>>({});
  const max = Math.max(1, ...data.months.map((m) => m.stars));
  const total = data.months.reduce((a, m) => a + m.stars, 0);

  const fulfil = (id: string) =>
    start(async () => {
      const res = await setMarketOrderFulfilledAction(id, true);
      if (res?.error) return void toast.error('Saqlab bo‘lmadi');
      const row = handover.find((h) => h.id === id);
      setHandover((l) => l.filter((h) => h.id !== id));
      toast.success('Topshirildi — xodimga xabar yuborildi', {
        duration: 6000,
        action: {
          label: 'Bekor qilish',
          onClick: () =>
            void setMarketOrderFulfilledAction(id, false).then((r) => {
              if (!r?.error && row) setHandover((l) => [row, ...l]);
            }),
        },
      });
    });

  const saveThr = (id: string) =>
    start(async () => {
      const v = Number(thr[id]);
      if (!Number.isInteger(v) || v < 0) return void toast.error('Butun son kiriting');
      const res = await setMarketLowStockAction({ itemId: id, lowStock: v });
      if (res?.error) return void toast.error('Saqlab bo‘lmadi');
      toast.success('Chegara saqlandi');
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { n: '6 oyda sarflangan', v: `${total.toLocaleString('en-US').replace(/,/g, ' ')} ★`, icon: <BarChart3 className="size-4" /> },
          { n: 'Xaridorlar (90 kun)', v: String(data.buyers), icon: <Users className="size-4" /> },
          { n: 'Topshirish kutilmoqda', v: String(handover.length), icon: <Gift className="size-4" />, tone: handover.length ? 'text-au-accent-text' : '' },
          { n: 'O‘rtacha qaror vaqti', v: data.avgDecisionHours === null ? '—' : data.avgDecisionHours < 48 ? `${data.avgDecisionHours.toFixed(1)} soat` : `${(data.avgDecisionHours / 24).toFixed(1)} kun`, icon: <Timer className="size-4" /> },
        ].map((k, i) => (
          <div key={k.n} style={{ ['--i' as string]: i }} className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-1 p-4')}>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-au-muted">
              {k.icon} {k.n}
            </span>
            <span className={cn('text-xl font-bold tabular-nums', k.tone)}>{k.v}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Topshirish navbati" icon={<PackageCheck className="size-4" />} i={1}>
          {handover.length === 0 ? (
            <p className="text-sm text-au-muted">Hamma tasdiqlangan sovg‘alar topshirilgan</p>
          ) : (
            <ul className="flex flex-col divide-y divide-au-line">
              {handover.map((h) => (
                <li key={h.id} className="flex items-center gap-2 py-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{h.item}</span>
                    <span className="text-[11px] text-au-muted">
                      {h.who} · {h.approved_at?.slice(0, 10) ?? ''}
                    </span>
                  </div>
                  <button disabled={busy} onClick={() => fulfil(h.id)} className="h-8 shrink-0 rounded-au-ctl bg-au-ok px-3 text-xs font-semibold text-white disabled:opacity-50">
                    Topshirildi
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Ombor ogohlantirishi" icon={<AlertTriangle className="size-4" />} i={2}>
          {data.lowStock.length === 0 ? (
            <p className="text-sm text-au-muted">Qoldiq yetarli</p>
          ) : (
            <ul className="flex flex-col divide-y divide-au-line">
              {data.lowStock.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{s.name}</span>
                    <span className="text-[11px] text-au-muted">
                      {s.wishes} kishi xohlaydi · chegara {s.low_stock}
                    </span>
                  </div>
                  <span className={s.stock === 0 ? CHIP_BAD : CHIP_NEUTRAL}>{s.stock === 0 ? 'Tugagan' : `${s.stock} dona`}</span>
                  <input
                    value={thr[s.id] ?? ''}
                    onChange={(e) => setThr({ ...thr, [s.id]: e.target.value })}
                    placeholder="chegara"
                    inputMode="numeric"
                    className={cn(INPUT, 'h-7 w-16 px-2 text-xs')}
                  />
                  {thr[s.id] && (
                    <button disabled={busy} onClick={() => saveThr(s.id)} className="text-xs font-semibold text-au-accent-text">
                      OK
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Eng ko‘p istalganlar" icon={<Heart className="size-4" />} i={3}>
          {data.wished.length === 0 ? (
            <p className="text-sm text-au-muted">Istaklar ro‘yxati bo‘sh</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {data.wished.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{w.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs">
                    <span className="font-bold tabular-nums">♥ {w.wishes}</span>
                    {w.stock === 0 && <span className={CHIP_BAD}>yo‘q</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-au-muted">Ko‘p istalgan, lekin omborda yo‘q sovg‘alarni birinchi to‘ldiring.</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Oylar bo‘yicha sarflangan yulduzlar" icon={<BarChart3 className="size-4" />} i={4}>
          {data.months.length === 0 ? (
            <p className="text-sm text-au-muted">Ma’lumot yo‘q</p>
          ) : (
            <>
              <div className="flex h-36 items-end gap-2">
                {data.months.map((m, i) => (
                  <div key={m.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${m.month}: ${m.stars} ★ · ${m.orders} buyurtma`}>
                    <span className="text-[10px] font-bold text-au-muted tabular-nums">{m.stars}</span>
                    <span style={{ height: `${(m.stars / max) * 100}%`, ['--i' as string]: i }} className="ms-grow-y w-full max-w-10 rounded-t-md bg-au-accent" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 text-center text-[10px] text-au-muted">
                {data.months.map((m) => (
                  <span key={m.month} className="flex-1">
                    {MONTHS[Number(m.month.slice(5, 7)) - 1]}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>
        <Card title="Eng ko‘p olinganlar (180 kun)" icon={<Gift className="size-4" />} i={5}>
          {data.top.length === 0 ? (
            <p className="text-sm text-au-muted">Hali buyurtma yo‘q</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.top.map((t, i) => (
                <li key={t.name} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{t.name}</span>
                    <span className="shrink-0 tabular-nums">
                      {t.orders} <span className="text-[11px] text-au-muted">· {t.stars} ★</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-au-card-2">
                    <i style={{ width: `${(t.orders / Math.max(1, data.top[0].orders)) * 100}%`, ['--i' as string]: i }} className="ms-fill block h-full rounded-full bg-au-ok" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
