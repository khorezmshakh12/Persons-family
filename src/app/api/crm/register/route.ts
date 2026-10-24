import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

// PUBLIC prospect registration page (no auth — the gateway proxy excludes
// /api, and this route intentionally does not guard). GET serves a simple
// original form; POST records a lead in crm_leads under a "Veb-registratsiya"
// funnel section. A honeypot field + length caps guard against spam. It
// collects only a name, phone and course interest — no credentials or payment.
export const dynamic = 'force-dynamic';

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page(center: string, courses: string[], done = false) {
  const opts = courses.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  const thanks = done ? 'block' : 'none';
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(center)} — Ro'yxatdan o'tish</title>
<style>:root{--pri:#4f46e5;--ink:#1b2333;--muted:#667085;--line:#e6e9ef}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f6fa;color:var(--ink);font:15px/1.5 Inter,system-ui,Segoe UI,sans-serif;padding:20px}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 10px 30px -16px rgba(16,24,40,.2);padding:26px;width:100%;max-width:440px}
h1{font-size:22px;margin:0 0 2px}.sub{color:var(--muted);font-size:13px;margin-bottom:18px}
label{display:block;font-size:13px;color:var(--muted);margin:12px 0 5px}
input,select,textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 13px;font:inherit;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--pri);box-shadow:0 0 0 3px #eef1fe}
button{width:100%;margin-top:18px;border:0;border-radius:10px;padding:12px;background:var(--pri);color:#fff;font-weight:600;font-size:15px;cursor:pointer}
button:disabled{opacity:.6}.hp{position:absolute;left:-9999px}.msg{margin-top:12px;font-size:14px}.ok{color:#0c7a3f}.err{color:#c7322b}
.done{text-align:center;padding:10px 0}.done .big{font-size:40px}</style></head>
<body><div class="card">
<div id="form"><h1>${esc(center)}</h1><div class="sub">Ro'yxatdan o'tish — ma'lumotlaringizni qoldiring, biz siz bilan bog'lanamiz.</div>
<label>Ism familiya *</label><input id="f_name" maxlength="120" placeholder="Ism familiya">
<label>Telefon *</label><input id="f_phone" maxlength="32" placeholder="90 123 45 67" inputmode="tel">
<label>Qaysi kurs?</label><select id="f_course"><option value="">— tanlang —</option>${opts}<option value="Boshqa">Boshqa</option></select>
<label>Izoh (ixtiyoriy)</label><textarea id="f_note" rows="2" maxlength="500" placeholder="Qo'shimcha"></textarea>
<input class="hp" id="f_hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<button id="btn" onclick="submitReg()">Yuborish</button><div id="msg" class="msg"></div></div>
<div id="thanks" class="done" style="display:${thanks}"><div class="big">✓</div><h1>Rahmat!</h1><div class="sub">So'rovingiz qabul qilindi. Tez orada bog'lanamiz.</div></div>
</div>
<script>
function submitReg(){var b=document.getElementById('btn');var m=document.getElementById('msg');
var name=document.getElementById('f_name').value.trim();var phone=document.getElementById('f_phone').value.trim();
if(!name||!phone){m.className='msg err';m.textContent='Ism va telefon majburiy.';return}
b.disabled=true;m.className='msg';m.textContent='Yuborilmoqda...';
fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:name,phone:phone,course:document.getElementById('f_course').value,note:document.getElementById('f_note').value,hp:document.getElementById('f_hp').value})})
.then(function(r){return r.json()}).then(function(j){if(j.ok){document.getElementById('form').style.display='none';document.getElementById('thanks').style.display='block'}else{b.disabled=false;m.className='msg err';m.textContent=(j.error||'Xatolik')}})
.catch(function(){b.disabled=false;m.className='msg err';m.textContent='Tarmoq xatosi. Qayta urinib ko\\'ring.'});}
</script></body></html>`;
}

export async function GET() {
  try {
    const [cfg] = await sql<{ center_name: string | null }[]>`select center_name from crm_settings where id = true`;
    const courses = await sql<{ name: string }[]>`select name from crm_courses where archived_at is null order by name`;
    const center = cfg?.center_name?.trim() || 'Persons Education';
    return new NextResponse(page(center, courses.map((c) => c.name)), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch {
    return new NextResponse(page('Persons Education', []), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
}

export async function POST(req: Request) {
  let body: { name?: string; phone?: string; course?: string; note?: string; hp?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }
  // Honeypot: real users leave it empty; bots fill it. Pretend success.
  if ((body.hp ?? '').trim()) return NextResponse.json({ ok: true });

  const name = (body.name ?? '').trim().slice(0, 120);
  const phone = (body.phone ?? '').trim().slice(0, 32);
  if (!name || !phone) return NextResponse.json({ error: 'Ism va telefon majburiy' }, { status: 400 });
  const course = (body.course ?? '').trim().slice(0, 120);
  const note = (body.note ?? '').trim().slice(0, 500);

  try {
    await sql.begin(async (tx) => {
      const [sec] = await tx<{ id: string }[]>`select id from crm_lead_sections where name = 'Veb-registratsiya' and archived_at is null limit 1`;
      const sectionId = sec?.id ?? (await tx<{ id: string }[]>`insert into crm_lead_sections (name, sort, kind) values ('Veb-registratsiya', 99, 'manual') returning id`)[0].id;
      let courseId: string | null = null;
      if (course && course !== 'Boshqa') {
        const [c] = await tx<{ id: string }[]>`select id from crm_courses where lower(name) = lower(${course}) and archived_at is null limit 1`;
        courseId = c?.id ?? null;
      }
      const noteFull = [course === 'Boshqa' ? 'Kurs: Boshqa' : '', note].filter(Boolean).join(' · ') || null;
      await tx`insert into crm_leads (section_id, name, phone, course_id, note, status) values (${sectionId}, ${name}, ${phone}, ${courseId}, ${noteFull}, 'open')`;
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] register failed', e);
    return NextResponse.json({ error: 'Xatolik, keyinroq urinib ko‘ring' }, { status: 500 });
  }
}
