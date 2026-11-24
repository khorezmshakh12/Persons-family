'use client';

import { useRef, useState } from 'react';
import { GitBranch, Pencil, Plus, Route, Save, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { AskHost, SuiteTabs, ask, toast } from '@/components/strategy/suite-shell';
import '@/components/strategy/strategy.css';
import '@/components/strategy/suite.css';
import type { NodeStatus } from '@/lib/strategy';
import { findStageOf, growthUnsent, stageCanon, stagePhases, type GrowthLogEntry, type GrowthMind, type GrowthPerson, type GrowthPlan, type GrowthRoadmap, type StageReview } from '@/lib/hr-growth';
import {
  markGrowthStageAction,
  reviewGrowthStageAction,
  saveGrowthMindAction,
  saveGrowthRoadmapAction,
  sendGrowthAction,
  setGrowthNodeStatusAction,
  unapproveGrowthStageAction,
} from '@/lib/actions/hr-growth';
import { GrowthNodeDrawer, GrowthRoadmapEditor, GrowthRoadmapView, updateRoadmapNode } from './growth-roadmap';
import { GrowthMindView } from './growth-mind';

export type GrowthView = 'roadmap' | 'mind';

const ERR: Record<string, string> = {
  locked: 'eLocked',
  incomplete: 'eIncomplete',
  notSubmitted: 'eNotSubmitted',
  alreadyDecided: 'eDecided',
  noteRequired: 'eNote',
  empty: 'eEmpty',
  nothingNew: 'eNothingNew',
  tooBig: 'eTooBig',
  tooDeep: 'eTooDeep',
  invalidInput: 'eInvalid',
  forbidden: 'eForbidden',
  notLastApproved: 'eNotLast',
};

/**
 * HR › Roadmap va Mind map. Strategy'dagi Roadmap / Mind map ko'rinishida;
 * xodim o'z qoralamasini yuritadi («Saqlash»), «CEO'ga yuborish»dan keyin
 * CEO (growth.review) va HR (growth.viewAll, faqat ko'radi) yuborilgan
 * roadmap nusxasini ko'radi; bosqichlarni CEO tasdiqlaydi. Mind map faqat
 * xodimning o'zida (owner, 2026-11-21).
 */
export function GrowthWorkspace({
  me,
  viewed,
  team,
  canReview,
  initialView,
  initialStage,
  today,
}: {
  me: GrowthPlan;
  /** CEO / HR looking at someone else's plan (its sent copy only). */
  viewed: GrowthPlan | null;
  team: GrowthPerson[] | null;
  canReview: boolean;
  initialView: GrowthView;
  /** Open this stage's drawer on load (from the «Tasdiq kutmoqda» list). */
  initialStage?: string | null;
  /** Tashkent day key (deadline colouring). */
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const tw = useTranslations('gw');
  const errText = (e: string) => tw(ERR[e] ?? 'eOther');
  const own = !viewed;
  const base = viewed ?? me;
  const [view, setView] = useState<GrowthView>(own ? initialView : 'roadmap');
  const [roadmap, setRoadmap] = useState<GrowthRoadmap>(base.roadmap);
  const [status, setStatus] = useState<Record<string, NodeStatus>>(base.nodeStatus);
  const [review, setReview] = useState<Record<string, StageReview>>(base.stageState);
  const [log, setLog] = useState<GrowthLogEntry[]>(base.log);
  const [mind, setMind] = useState<GrowthMind>(base.mind);
  const [submittedAt, setSubmittedAt] = useState(base.submittedAt);
  const [sent, setSent] = useState({ roadmap: base.sentRoadmap, mind: base.sentMind });
  const [busy, setBusy] = useState(false);
  const unsent = own && growthUnsent({ roadmap, sentRoadmap: sent.roadmap });
  const [drawer, setDrawer] = useState<{ kind: 'node'; id: string } | { kind: 'edit' } | null>(() =>
    initialStage && base.roadmap.sections.some((x) => x.id === initialStage) ? { kind: 'node', id: initialStage } : null,
  );
  const names: Record<string, string> = Object.fromEntries([[me.userId, me.name], [base.userId, base.name], ...(team ?? []).map((p) => [p.userId, p.name])]);
  const addLog = (e: GrowthLogEntry) => setLog((l) => [...l, e]);
  const mindTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phases = stagePhases(roadmap, review);
  /** The node's stage is in the sent copy exactly as in the draft. */
  const stageSent = (nodeId: string) => {
    const st = findStageOf(roadmap, nodeId);
    const prev = st && sent.roadmap.sections.find((x) => x.id === st.id);
    return !!submittedAt && !!st && !!prev && stageCanon(prev) === stageCanon(st);
  };

  const go = (person: string | null, v: GrowthView = view, stage?: string) => {
    const q = new URLSearchParams({ tab: 'growth', v });
    if (person && person !== me.userId) q.set('person', person);
    if (stage) q.set('stage', stage);
    router.push(`${pathname}?${q.toString()}`);
  };

  async function saveRoadmap(next: GrowthRoadmap, msg = tw('saved')): Promise<boolean> {
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
    if (okMind) toast.success(tw('draftSaved'));
  }

  // «CEO'ga yuborish» — the draft becomes what the CEO and HR see.
  async function send() {
    const reapprove = roadmap.sections.filter((s) => {
      const prev = sent.roadmap.sections.find((x) => x.id === s.id);
      return prev && review[s.id]?.s === 'approved' && stageCanon(prev) !== stageCanon(s);
    }).length;
    const msg = `${tw('sendQ', { w: submittedAt ? tw('wChanges') : tw('wRoadmap') })}${reapprove ? tw('reapprove', { n: reapprove }) : ''}`;
    if (!(await ask(msg, { ok: tw('send'), danger: false }))) return;
    setBusy(true);
    if (!(await flushMind())) return void setBusy(false);
    const res = await sendGrowthAction();
    setBusy(false);
    if ('error' in res) return void toast.error(errText(res.error));
    setSent({ roadmap, mind });
    // Changed approved stages went back to waiting on the server.
    const at = new Date().toISOString();
    setReview((m) => {
      const n = { ...m };
      for (const st of roadmap.sections) {
        const prev = sent.roadmap.sections.find((x) => x.id === st.id);
        if (prev && n[st.id]?.s === 'approved' && stageCanon(prev) !== stageCanon(st)) n[st.id] = { s: 'self_done', at };
      }
      return n;
    });
    setSubmittedAt(new Date().toISOString());
    toast.success(tw('sent'));
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
    addLog({ st: stageId, t: roadmap.sections.find((x) => x.id === stageId)?.t ?? '', s: done ? 'self_done' : 'unmarked', at: new Date().toISOString(), by: me.userId });
    toast.success(done ? tw('markSent') : tw('withdrawn'));
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
    addLog({ st: stageId, t: roadmap.sections.find((x) => x.id === stageId)?.t ?? '', s: approve ? 'approved' : 'returned', at, by: me.userId, ...(note ? { note } : {}) });
    toast.success(approve ? tw('approvedNext') : tw('returned'));
    router.refresh();
    return true;
  }

  async function unapprove(stageId: string, note: string): Promise<boolean> {
    const res = await unapproveGrowthStageAction({ userId: base.userId, stageId, note: note || undefined });
    if ('error' in res) {
      toast.error(errText(res.error));
      return false;
    }
    const at = new Date().toISOString();
    setReview((m) => ({ ...m, [stageId]: { s: 'self_done', at } }));
    addLog({ st: stageId, t: roadmap.sections.find((x) => x.id === stageId)?.t ?? '', s: 'unapproved', at, by: me.userId, ...(note ? { note } : {}) });
    toast.success(tw('unapproved'));
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
      {!submittedAt ? tw('stDraft') : unsent ? tw('stUnsent') : tw('stSent')}
    </div>
  );
  // «Saqlash» + «CEO'ga yuborish» — shown on both Roadmap and Mind map.
  const sendBar = own && (
    <div className="flex items-center gap-2">
      <button className="sx-btn sm" disabled={busy} onClick={saveDraft}>
        <Save className="size-3.5" /> {tw('save')}
      </button>
      <button className="sx-btn sm primary" disabled={busy || !unsent} onClick={send} title={unsent ? undefined : tw('noNew')}>
        <Send className="size-3.5" /> {tw('sendCeo')}
      </button>
    </div>
  );

  // Right-column card: the owner's plan card, or the CEO's person picker.
  const ownCard = own && (
    <div className="sx-card rm-pick">
      <div className="px-1 pb-1">
        <div className="text-sm font-bold text-au-ink">{roadmap.name || tw('myRoadmap')}</div>
        {roadmap.subtitle && <div className="text-xs text-au-muted">{roadmap.subtitle}</div>}
        {sendPill}
      </div>
      <div className="mt-1 flex gap-2 border-t border-au-line pt-2">
        <button className="sx-btn sm flex-1 justify-center" onClick={() => setDrawer({ kind: 'edit' })}>
          {roadmap.sections.length ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />} {roadmap.sections.length ? tw('edit') : tw('create')}
        </button>
      </div>
    </div>
  );
  const picker = team && (
    <div className="sx-card rm-pick max-h-[420px] overflow-y-auto">
      <button className={cn(own && 'on')} onClick={() => go(null)}>
        <span className="ic">★</span>
        <span>
          {tw('myPlan')}
          <small>{own ? tw('open') : tw('mine')}</small>
        </span>
      </button>
      {team
        .filter((p) => p.userId !== me.userId)
        .map((p) => (
          <button key={p.userId} className={cn(viewed?.userId === p.userId && 'on')} onClick={() => go(p.userId)}>
            <span className="ic">{p.name.slice(0, 1)}</span>
            <span>
              {p.name}
              <small>{p.submitted ? `${tw('approvedOf', { a: p.approved, n: p.stages })}${p.waiting ? tw('waitingN', { n: p.waiting }) : ''}` : tw('notSent')}</small>
            </span>
          </button>
        ))}
    </div>
  );

  // CEO's queue: every stage waiting for a decision, one click to its drawer.
  const queue = canReview ? (team ?? []).flatMap((p) => p.waitingStages.map((st) => ({ p, st }))) : [];
  const queueCard = queue.length > 0 && (
    <div className="sx-card rm-pick max-h-[320px] overflow-y-auto">
      <div className="px-1 pb-1 text-sm font-bold text-au-ink">{tw('queue', { n: queue.length })}</div>
      {queue.map(({ p, st }) => (
        <button
          key={`${p.userId}-${st.id}`}
          className={cn(base.userId === p.userId && drawer?.kind === 'node' && drawer.id === st.id && 'on')}
          onClick={() => (p.userId === base.userId ? setDrawer({ kind: 'node', id: st.id }) : go(p.userId, 'roadmap', st.id))}
        >
          <span className="ic">{p.name.slice(0, 1)}</span>
          <span>
            {p.name}
            <small>{st.t}</small>
          </span>
        </button>
      ))}
    </div>
  );

  // Mind map is the owner's own — not shown when looking at someone else.
  const tabs = own
    ? [
        { v: 'roadmap', n: 'Roadmap', Icon: Route },
        { v: 'mind', n: 'Mind map', Icon: GitBranch },
      ]
    : [{ v: 'roadmap', n: 'Roadmap', Icon: Route }];
  const waitingTotal = queue.length;

  return (
    <div className="sx-root flex flex-col">
      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-7">
        <SuiteTabs tabs={tabs} value={view} onChange={(v) => setView(v as GrowthView)} />
        <div className="flex-1" />
        {!own && <span className="text-sm text-au-muted">{tw.rich('viewing', { n: base.name, b: (c) => <b className="text-au-ink">{c}</b> })}</span>}
        {sendBar}
        {canReview && waitingTotal > 0 && <span className="sx-pill bad">{tw('waitingStages', { n: waitingTotal })}</span>}
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
                  ? tw('emptyOwn')
                  : tw('emptyOther', { n: base.name })
              }
              onNode={(id) => setDrawer({ kind: 'node', id })}
              onTick={own ? setNodeStatus : undefined}
              today={today}
              onNew={() => setDrawer({ kind: 'edit' })}
              onRename={(id, t) =>
                saveRoadmap(
                  roadmap.sections.some((s) => s.id === id)
                    ? { ...roadmap, sections: roadmap.sections.map((s) => (s.id === id ? { ...s, t } : s)) }
                    : updateRoadmapNode(roadmap, id, (n) => ({ ...n, t })),
                )
              }
              side={
                <>
                  {queueCard}
                  {ownCard}
                  {picker}
                </>
              }
            />
          )}
          {view === 'mind' && own && <GrowthMindView mind={mind} rootLabel={base.name} readonly={false} onChange={updateMind} />}
        </div>
      </section>

      <div className={cn('sx-scrim', drawer && 'open')} onClick={() => drawer?.kind !== 'edit' && setDrawer(null)} />
      <aside className={cn('sx-drawer', drawer && 'open')} aria-label={tw('details')}>
        {drawer?.kind === 'node' && (
          <GrowthNodeDrawer
            key={drawer.id}
            roadmap={roadmap}
            nodeId={drawer.id}
            status={status}
            phases={phases}
            review={review}
            log={log}
            names={names}
            today={today}
            sent={stageSent(drawer.id)}
            own={own}
            canReview={canReview}
            onClose={() => setDrawer(null)}
            onStatus={setNodeStatus}
            onTree={(id, f) => void saveRoadmap(updateRoadmapNode(roadmap, id, f))}
            onMark={mark}
            onReview={decide}
            onUnapprove={unapprove}
          />
        )}
        {drawer?.kind === 'edit' && own && (
          <GrowthRoadmapEditor roadmap={roadmap} phases={phases} onClose={() => setDrawer(null)} onSave={(r) => saveRoadmap(r, tw('rmSaved'))} />
        )}
      </aside>
      <AskHost />
    </div>
  );
}
