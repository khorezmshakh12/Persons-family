'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import type { RoadmapSection, StrategyRoadmap } from '@/lib/strategy';
import { saveRoadmapAction } from '@/lib/actions/strategy-roadmap';
import { ask, toast } from './suite-shell';

/**
 * Create / edit a roadmap: name, stages (quarter + title) and the topics on
 * each side. Topic ids are positional, so every topic remembers the id it
 * had when the editor opened (`from`); on save that becomes the remap the
 * server uses to carry node status, resources and linked tasks along.
 */

type Topic = { t: string; from?: string };
type Stage = { id: string; t: string; q: string; left: Topic[]; right: Topic[]; isNew?: boolean };
const SIDES = [
  ['left', 'Chap'],
  ['right', 'O‘ng'],
] as const;
const MAX_TOPICS = 6;

const newId = () => `s${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`.replace(/[^a-z0-9]/g, '');

function toStages(r?: StrategyRoadmap): Stage[] {
  if (!r) return [{ id: newId(), t: '', q: '', left: [{ t: '' }], right: [], isNew: true }];
  return r.sections.map((s) => ({
    id: s.id,
    t: s.t,
    q: s.q,
    left: s.left.map((t, j) => ({ t, from: `${s.id}-l${j}` })),
    right: s.right.map((t, j) => ({ t, from: `${s.id}-r${j}` })),
  }));
}

export function RoadmapEditor({
  roadmap,
  linkedCount,
  onClose,
  onSaved,
  onDelete,
}: {
  roadmap?: StrategyRoadmap;
  /** Tasks linked to this roadmap — mentioned in the delete confirmation. */
  linkedCount: number;
  onClose: () => void;
  onSaved: (r: StrategyRoadmap, remap: Record<string, string | null>) => void;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(roadmap?.name ?? '');
  const [subtitle, setSubtitle] = useState(roadmap?.subtitle ?? '');
  const [icon, setIcon] = useState(roadmap?.icon ?? 'R');
  const [stages, setStages] = useState<Stage[]>(() => toStages(roadmap));
  const [busy, setBusy] = useState(false);

  const patch = (i: number, p: Partial<Stage>) => setStages((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setStages((s) => {
      const n = [...s];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  const setTopic = (i: number, side: 'left' | 'right', j: number, t: string) =>
    patch(i, { [side]: stages[i][side].map((x, k) => (k === j ? { ...x, t } : x)) });

  async function save() {
    const clean = stages
      .map((s) => ({ ...s, t: s.t.trim(), q: s.q.trim(), left: s.left.filter((x) => x.t.trim()), right: s.right.filter((x) => x.t.trim()) }))
      .filter((s) => s.t);
    if (!name.trim()) return void toast.error('Roadmap nomini kiriting');
    if (!clean.length) return void toast.error('Kamida bitta bosqich kerak');

    const sections: RoadmapSection[] = clean.map((s) => ({
      id: s.id,
      t: s.t,
      q: s.q,
      left: s.left.map((x) => x.t.trim()),
      right: s.right.map((x) => x.t.trim()),
    }));
    // Old id → new id for everything that existed when the editor opened.
    const remap: Record<string, string | null> = {};
    if (roadmap) {
      for (const s of roadmap.sections) {
        remap[s.id] = clean.some((c) => c.id === s.id) ? s.id : null;
        s.left.forEach((_, j) => (remap[`${s.id}-l${j}`] = null));
        s.right.forEach((_, j) => (remap[`${s.id}-r${j}`] = null));
      }
      for (const s of clean)
        for (const [side] of SIDES)
          s[side].forEach((x, j) => {
            if (x.from) remap[x.from] = `${s.id}-${side[0]}${j}`;
          });
    }
    setBusy(true);
    const res = await saveRoadmapAction({ id: roadmap?.id, name: name.trim(), subtitle: subtitle.trim(), icon: icon.trim() || 'R', sections, remap });
    setBusy(false);
    if (res.error !== undefined) return void toast.error(res.error === 'invalidInput' ? "Ma'lumot noto'g'ri" : "Saqlab bo'lmadi");
    toast.success(roadmap ? 'Roadmap saqlandi' : 'Roadmap yaratildi');
    onSaved(res.roadmap, remap);
  }

  return (
    <>
      <div className="dr-h">
        <span className="sx-node-chip">Roadmap</span>
        <span className="text-xs text-au-faint">{roadmap ? 'Tahrirlash' : 'Yangi roadmap'}</span>
        <button className="x" onClick={onClose} aria-label="Yopish">
          <X className="size-4" />
        </button>
      </div>
      <div className="dr-b">
        <div className="flex gap-2">
          <input
            className="sx-inp w-14 text-center font-bold"
            maxLength={2}
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            aria-label="Belgi (1–2 harf)"
            title="Belgi (1–2 harf)"
          />
          <input className="sx-inp flex-1" autoFocus={!roadmap} maxLength={80} placeholder="Nomi — masalan: Filial ochish" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <input className="sx-inp" maxLength={80} placeholder="Qisqa tavsif — masalan: 2026 → 2027" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />

        <div className="dr-sec">Bosqichlar · {stages.length}</div>
        <div className="grid gap-3">
          {stages.map((s, i) => (
            <div key={s.id} className="grid gap-2 rounded-au-ctl border border-au-line bg-au-card-2 p-3">
              <div className="flex items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-au-ink text-[11px] font-bold text-au-card">{i + 1}</span>
                <input className="sx-inp w-28" maxLength={30} placeholder="2026 · Q1" value={s.q} onChange={(e) => patch(i, { q: e.target.value })} aria-label="Davr" />
                <input className="sx-inp min-w-0 flex-1 font-semibold" maxLength={60} placeholder="Bosqich nomi" value={s.t} onChange={(e) => patch(i, { t: e.target.value })} />
                <button className="sx-chipb" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Yuqoriga">
                  <ArrowUp className="size-3.5" />
                </button>
                <button className="sx-chipb" disabled={i === stages.length - 1} onClick={() => move(i, 1)} aria-label="Pastga">
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  className="sx-chipb text-au-bad"
                  aria-label="Bosqichni o‘chirish"
                  onClick={async () => {
                    const n = s.left.length + s.right.length;
                    if (!s.isNew && !(await ask(`«${s.t || 'Bosqich'}»${n ? ` va undagi ${n} ta mavzu` : ''} o‘chirilsinmi? Ularga bog‘langan vazifalar roadmapdan uziladi.`))) return;
                    setStages((x) => x.filter((_, j) => j !== i));
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {SIDES.map(([side, label]) => (
                  <div key={side} className="grid content-start gap-1.5">
                    <span className="text-[11px] font-semibold text-au-faint">{label} tomon</span>
                    {s[side].map((x, j) => (
                      <div key={`${side}${j}${x.from ?? ''}`} className="flex items-center gap-1">
                        <input className="sx-inp h-8 min-w-0 flex-1 text-[13px]" maxLength={80} placeholder="Mavzu" value={x.t} onChange={(e) => setTopic(i, side, j, e.target.value)} />
                        <button
                          className="sx-chipb"
                          aria-label="Mavzuni o‘chirish"
                          onClick={() => patch(i, { [side]: s[side].filter((_, k) => k !== j) })}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                    {s[side].length < MAX_TOPICS && (
                      <button className="sx-btn sm justify-self-start text-au-muted" onClick={() => patch(i, { [side]: [...s[side], { t: '' }] })}>
                        <Plus className="size-3" /> Mavzu
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {stages.length < 12 && (
            <button
              className="sx-btn justify-self-start"
              onClick={() => setStages((x) => [...x, { id: newId(), t: '', q: '', left: [{ t: '' }], right: [], isNew: true }])}
            >
              <Plus className="size-4" /> Bosqich qo‘shish
            </button>
          )}
        </div>
      </div>
      <div className="dr-f">
        <button className="sx-btn primary flex-1 justify-center" disabled={busy} onClick={save}>
          {roadmap ? 'Saqlash' : 'Yaratish'}
        </button>
        {roadmap && (
          <button
            className="sx-btn text-au-bad"
            disabled={busy}
            onClick={async () => {
              if (await ask(`«${roadmap.name}» roadmapi o‘chirilsinmi?${linkedCount ? ` ${linkedCount} ta vazifa undan uziladi (vazifalar o‘zi qoladi).` : ''}`)) await onDelete();
            }}
          >
            O‘chirish
          </button>
        )}
      </div>
    </>
  );
}
