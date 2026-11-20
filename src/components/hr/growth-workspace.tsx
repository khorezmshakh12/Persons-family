'use client';

import { useRef, useState } from 'react';
import { GitBranch, Pencil, Plus, Route, Save, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePathname, useRouter } from '@/i18n/navigation';
import { AskHost, SuiteTabs, ask, toast } from '@/components/strategy/suite-shell';
import '@/components/strategy/strategy.css';
import '@/components/strategy/suite.css';
import type { NodeStatus } from '@/lib/strategy';
import { findStageOf, growthUnsent, stageCanon, stagePhases, type GrowthMind, type GrowthPerson, type GrowthPlan, type GrowthRoadmap, type StageReview } from '@/lib/hr-growth';
import {
  markGrowthStageAction,
  reviewGrowthStageAction,
  saveGrowthMindAction,
  saveGrowthRoadmapAction,
  sendGrowthAction,
  setGrowthNodeStatusAction,
} from '@/lib/actions/hr-growth';
import { GrowthNodeDrawer, GrowthRoadmapEditor, GrowthRoadmapView, updateRoadmapNode } from './growth-roadmap';
import { GrowthMindView } from './growth-mind';

export type GrowthView = 'roadmap' | 'mind';

const ERR: Record<string, string> = {
  locked: 'Bu bosqich hozir yopiq',
  incomplete: 'Avval barcha mavzu va bandlarni bajaring',
  notSubmitted: 'Avval o‘zgarishlarni CEO’ga yuboring',
  alreadyDecided: 'Bu bosqich bo‘yicha qaror allaqachon qabul qilingan',
  noteRequired: 'Qaytarish uchun izoh yozing',
  empty: 'Avval roadmap yoki mind map’ga biror narsa qo‘shing',
  nothingNew: 'Yangi o‘zgarish yo‘q — hammasi CEO’ga yuborilgan',
  tooBig: 'Juda ko‘p band — ba’zilarini birlashtiring',
  tooDeep: 'Juda chuqur shoxlanish',
  invalidInput: 'Ma’lumot noto‘g‘ri',
  forbidden: 'Ruxsat yo‘q',
};
const errText = (e: string) => ERR[e] ?? 'Saqlab bo‘lmadi';

/**
 * HR › Roadmap va Mind map. Strategy'dagi Roadmap / Mind map ko'rinishida;
 * xodim o'z qoralamasini yuritadi («Saqlash»), «CEO'ga yuborish»dan keyin
 * CEO (growth.review) va HR (growth.viewAll) yuborilgan nusxani ko'radi;
 * bosqichlarni CEO tasdiqlaydi.
 */
export function GrowthWorkspace({
  me,
  viewed,
  team,
  canReview,
  initialView,
}: {
  me: GrowthPlan;
  /** CEO / HR looking at someone else's plan (its sent copy only). */
  viewed: GrowthPlan | null;
  team: GrowthPerson[] | null;
  canReview: boolean;
  initialView: GrowthView;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const own = !viewed;
  const base = viewed ?? me;
  const [view, setView] = useState<GrowthView>(initialView);
  const [roadmap, setRoadmap] = useState<GrowthRoadmap>(base.roadmap);
  const [status, setStatus] = useState<Record<string, NodeStatus>>(base.nodeStatus);
  const [review, setReview] = useState<Record<string, StageReview>>(base.stageState);
  const [mind, setMind] = useState<GrowthMind>(base.mind);
  const [submittedAt, setSubmittedAt] = useState(base.submittedAt);
  const [sent, setSent] = useState({ roadmap: base.sentRoadmap, mind: base.sentMind });
  const [busy, setBusy] = useState(false);
  const unsent = own && growthUnsent({ roadmap, mind, sentRoadmap: sent.roadmap, sentMind: sent.mind });
  const [drawer, setDrawer] = useState<{ kind: 'node'; id: string } | { kind: 'edit' } | null>(null);
  const mindTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phases = stagePhases(roadmap, review);
  /** The node's stage is in the sent copy exactly as in the draft. */
  const stageSent = (nodeId: string) => {
    const st = findStageOf(roadmap, nodeId);
    const prev = st && sent.roadmap.sections.find((x) => x.id === st.id);
    return !!submittedAt && !!st && !!prev && stageCanon(prev) === stageCanon(st);
  };

  const go = (person: string | null, v: GrowthView = view) => {
    const q = new URLSearchParams({ tab: 'growth', v });
    if (person && person !== me.userId) q.set('person', person);
    router.push(`${pathname}?${q.toString()}`);
  };

  async function saveRoadmap(next: GrowthRoadmap, msg = 'Saqlandi'): Promise<boolean> {
    const prev = roadmap;
    setRoadmap(next);
    const res = await saveGrowthRoadmapAction(next);
    if ('error' in res) {
      setRoadmap(prev);
      toast.error(errText(res.error));
      return false;
    }
    toast.success(msg);
    return true;
  }

  async function setNodeStatus(id: string, s: NodeStatus) {
    const before = status[id];
    setStatus((m) => ({ ...m, [id]: s }));
    const res = await setGrowthNodeStatusAction(id, s);
    if ('error' in res) {
      setStatus((m) => ({ ...m, [id]: before ?? 'todo' }));
      toast.error(errText(res.error));
    }
  }

  function updateMind(next: GrowthMind) {
    setMind(next);
    if (mindTimer.current) clearTimeout(mindTimer.current);
    mindTimer.current = setTimeout(async () => {
      mindTimer.current = null;
      const res = await saveGrowthMindAction(next);
      if ('error' in res) toast.error(errText(res.error));
    }, 500);
  }

  /** Writes a pending (debounced) mind map edit right away. */
  async function flushMind(): Promise<boolean> {
    if (!mindTimer.current) return true;
    clearTimeout(mindTimer.current);
    mindTimer.current = null;
    const res = await saveGrowthMindAction(mind);
    if ('error' in res) toast.error(errText(res.error));
    return !('error' in res);
  }

  // «Saqlash» — draft only; nobody but the owner sees it.
  async function saveDraft() {
    setBusy(true);
    const okMind = await flushMind();
    const res = await saveGrowthRoadmapAction(roadmap);
    setBusy(false);
    if ('error' in res) return void toast.error(errText(res.error));
    if (okMind) toast.success('Qoralama saqlandi — CEO hali ko‘rmaydi');
  }

  // «CEO'ga yuborish» — the draft becomes what the CEO and HR see.
  async function send() {
    const reapprove = roadmap.sections.filter((s) => {
      const prev = sent.roadmap.sections.find((x) => x.id === s.id);
      return prev && review[s.id]?.s === 'approved' && stageCanon(prev) !== stageCanon(s);
    }).length;
    const msg = `${submittedAt ? 'O‘zgarishlar' : 'Roadmap va mind map'} CEO’ga yuborilsinmi? Shundan keyin CEO va HR ularni ko‘radi.${
      reapprove ? ` ${reapprove} ta tasdiqlangan bosqich o‘zgargan — u qayta CEO tasdig‘iga tushadi.` : ''
    }`;
    if (!(await ask(msg, { ok: 'Yuborish', danger: false }))) return;
    setBusy(true);
    if (!(await flushMind())) return void setBusy(false);
    const res = await sendGrowthAction();
    setBusy(false);
    if ('error' in res) return void toast.error(errText(res.error));
    setSent({ roadmap, mind });
    setSubmittedAt(new Date().toISOString());
    toast.success('CEO’ga yuborildi');
    router.refresh();
  }

  async function mark(stageId: string, done: boolean) {
    const res = await markGrowthStageAction(stageId, done);
    if ('error' in res) return void toast.error(errText(res.error));
    setReview((m) => {
      const n = { ...m };
      if (done) n[stageId] = { s: 'self_done', at: new Date().toISOString() };
      else delete n[stageId];
      return n;
    });
    toast.success(done ? 'CEO tasdig‘iga yuborildi' : 'Qaytarib olindi');
    router.refresh();
  }

  async function decide(stageId: string, approve: boolean, note: string): Promise<boolean> {
    const res = await reviewGrowthStageAction({ userId: base.userId, stageId, approve, note: note || undefined });
    if ('error' in res) {
      toast.error(errText(res.error));
      return false;
    }
    const at = new Date().toISOString();
    setReview((m) => ({ ...m, [stageId]: approve ? { s: 'approved', at, by: me.userId, ...(note ? { note } : {}) } : { s: 'returned', at, by: me.userId, note } }));
    toast.success(approve ? 'Tasdiqlandi — keyingi bosqich ochildi' : 'Qaytarildi');
    router.refresh();
    return true;
  }

  const sendPill = own && (
    <div
      className={cn(
        'mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
        !unsent && submittedAt ? 'bg-au-ok-soft text-au-ok' : submittedAt ? 'bg-au-accent-soft text-au-accent-text' : 'bg-au-card-2 text-au-muted',
      )}
    >
      {!submittedAt ? 'Qoralama — faqat sizga ko‘rinadi' : unsent ? 'Yuborilmagan o‘zgarishlar bor' : 'CEO’ga yuborilgan'}
    </div>
  );
  // «Saqlash» + «CEO'ga yuborish» — shown on both Roadmap and Mind map.
  const sendBar = own && (
    <div className="flex items-center gap-2">
      <button className="sx-btn sm" disabled={busy} onClick={saveDraft}>
        <Save className="size-3.5" /> Saqlash
      </button>
      <button className="sx-btn sm primary" disabled={busy || !unsent} onClick={send} title={unsent ? undefined : 'Yangi o‘zgarish yo‘q'}>
        <Send className="size-3.5" /> CEO’ga yuborish
      </button>
    </div>
  );

  // Right-column card: the owner's plan card, or the CEO's person picker.
  const ownCard = own && (
    <div className="sx-card rm-pick">
      <div className="px-1 pb-1">
        <div className="text-sm font-bold text-au-ink">{roadmap.name || 'Mening roadmap’im'}</div>
        {roadmap.subtitle && <div className="text-xs text-au-muted">{roadmap.subtitle}</div>}
        {sendPill}
      </div>
      <div className="mt-1 flex gap-2 border-t border-au-line pt-2">
        <button className="sx-btn sm flex-1 justify-center" onClick={() => setDrawer({ kind: 'edit' })}>
          {roadmap.sections.length ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />} {roadmap.sections.length ? 'Tahrirlash' : 'Yaratish'}
        </button>
      </div>
    </div>
  );
  const picker = team && (
    <div className="sx-card rm-pick max-h-[420px] overflow-y-auto">
      <button className={cn(own && 'on')} onClick={() => go(null)}>
        <span className="ic">★</span>
        <span>
          Mening rejam
          <small>{own ? 'ochiq' : 'o‘zimniki'}</small>
        </span>
      </button>
      {team
        .filter((p) => p.userId !== me.userId)
        .map((p) => (
          <button key={p.userId} className={cn(viewed?.userId === p.userId && 'on')} onClick={() => go(p.userId)}>
            <span className="ic">{p.name.slice(0, 1)}</span>
            <span>
              {p.name}
              <small>
                {view === 'mind'
                  ? `${p.mindNodes} shox`
                  : p.submitted
                    ? `${p.approved}/${p.stages} tasdiqlangan${p.waiting ? ` · ${p.waiting} kutilmoqda` : ''}`
                    : 'yuborilmagan'}
              </small>
            </span>
          </button>
        ))}
    </div>
  );

  const tabs = [
    { v: 'roadmap', n: 'Roadmap', Icon: Route },
    { v: 'mind', n: 'Mind map', Icon: GitBranch },
  ];
  const waitingTotal = team?.reduce((a, p) => a + p.waiting, 0) ?? 0;

  return (
    <div className="sx-root flex flex-col">
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-7">
        <SuiteTabs tabs={tabs} value={view} onChange={(v) => setView(v as GrowthView)} />
        <div className="flex-1" />
        {!own && <span className="text-sm text-au-muted">Ko‘rilmoqda: <b className="text-au-ink">{base.name}</b> · CEO’ga yuborilgan nusxa</span>}
        {sendBar}
        {canReview && waitingTotal > 0 && <span className="sx-pill bad">{waitingTotal} ta bosqich tasdiq kutmoqda</span>}
        {team && view === 'mind' && (
          <select className="sx-inp !w-56" value={viewed?.userId ?? me.userId} onChange={(e) => go(e.target.value, 'mind')} aria-label="Xodim">
            <option value={me.userId}>Mening mind map’im</option>
            {team
              .filter((p) => p.userId !== me.userId)
              .map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name} · {p.mindNodes} shox
                </option>
              ))}
          </select>
        )}
      </div>

      <section className={cn('sx-view mt-4', view === 'mind' ? 'canvas' : 'px-4 pb-8 sm:px-7')}>
        <div key={view} className="sx-fade h-full">
          {view === 'roadmap' && (
            <GrowthRoadmapView
              roadmap={roadmap}
              status={status}
              phases={phases}
              selected={drawer?.kind === 'node' ? drawer.id : null}
              editable={own}
              emptyText={
                own
                  ? 'Uzoq muddatli maqsadlaringiz: bosqichlar va har biridagi mavzular. Har bir bosqichni CEO tasdiqlagach keyingisi ochiladi.'
                  : `${base.name} roadmap’ini hali CEO’ga yubormagan.`
              }
              onNode={(id) => setDrawer({ kind: 'node', id })}
              onNew={() => setDrawer({ kind: 'edit' })}
              onRename={(id, t) =>
                saveRoadmap(
                  roadmap.sections.some((s) => s.id === id)
                    ? { ...roadmap, sections: roadmap.sections.map((s) => (s.id === id ? { ...s, t } : s)) }
                    : updateRoadmapNode(roadmap, id, (n) => ({ ...n, t })),
                )
              }
              side={
                own && picker ? (
                  <>
                    {ownCard}
                    {picker}
                  </>
                ) : (
                  picker || ownCard
                )
              }
            />
          )}
          {view === 'mind' && <GrowthMindView mind={mind} rootLabel={base.name} readonly={!own} onChange={updateMind} />}
        </div>
      </section>

      <div className={cn('sx-scrim', drawer && 'open')} onClick={() => drawer?.kind !== 'edit' && setDrawer(null)} />
      <aside className={cn('sx-drawer', drawer && 'open')} aria-label="Tafsilotlar">
        {drawer?.kind === 'node' && (
          <GrowthNodeDrawer
            key={drawer.id}
            roadmap={roadmap}
            nodeId={drawer.id}
            status={status}
            phases={phases}
            review={review}
            sent={stageSent(drawer.id)}
            own={own}
            canReview={canReview}
            onClose={() => setDrawer(null)}
            onStatus={setNodeStatus}
            onTree={(id, f) => void saveRoadmap(updateRoadmapNode(roadmap, id, f))}
            onMark={mark}
            onReview={decide}
          />
        )}
        {drawer?.kind === 'edit' && own && (
          <GrowthRoadmapEditor roadmap={roadmap} phases={phases} onClose={() => setDrawer(null)} onSave={(r) => saveRoadmap(r, 'Roadmap saqlandi')} />
        )}
      </aside>
      <AskHost />
    </div>
  );
}
