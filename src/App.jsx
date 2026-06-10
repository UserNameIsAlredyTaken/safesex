import { useState, useMemo, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

/*
  ИЛЛЮСТРАТИВНАЯ МОДЕЛЬ кумулятивного риска ЗППП во времени. Не медицинский прогноз.
  Поведение задаётся тремя типами партнёров (постоянные / приходящие / хукапы), у каждого
  своя частота, длительность, презерватив, проверенность и фон среды (ассортативность).
  Вид секса (вагинальный/анальный/оральный × роль) — множитель к β за акт (опора на ВИЧ), практики
  складываются аддитивно: в каждом контакте присутствует каждая выбранная практика.
  Для типа: выживаемость за контакт = ∏ практик (1 − β·множитель·(1 − φ·e)·прививка);
  риск с заражённым партнёром = 1 − (выживаемость_за_контакт)^k;
  × p·фон·(1 − проверенность); вклады перемножаются по всем партнёрам; разворачивается во времени.
  ✓ grounded=true  → опирается на данные (сплошная линия)
  ◌ grounded=false → грубая оценка (пунктир); надёжных per-act чисел нет
*/

const C = { bg:"#0f141a", panel:"#161d26", panel2:"#1b2430", border:"#283442", hi:"#e8edf2", mid:"#9fb0c0", dim:"#64748b", accent:"#f0a500" };
const SEV = { 5:"#ff3b3b", 4:"#ff7b00", 3:"#ffc300", 2:"#b5d600", 1:"#38d9a9" };

const CDC = "CDC", WHO = "ВОЗ";
const STIS = [
  { key: "hiv", label: "ВИЧ", color: "#4dabf7", sev: 5, p: 0.002, beta: 0.0008, e: 0.80, grounded: true,
    treat: "Неизлечимо — пожизненная АРТ", cons: "Без лечения — СПИД, иммунный отказ", acc: "высокая",
    src: "Передача/акт: Patel 2014 (CDC) — рецепт. вагинальный 8 на 10 000. Презерватив ~80%: Cochrane. Анальный ~в 17 раз опаснее. Точность: высокая.",
    guide: {
      symptoms: "Через 2–4 недели у части заражённых — гриппоподобный синдром (лихорадка, сыпь, боль в горле, увеличение лимфоузлов). Затем годами без симптомов, пока иммунитет постепенно разрушается.",
      treatment: "Излечения нет, но антиретровирусная терапия (АРТ) подавляет вирус до неопределяемого уровня — человек живёт долго и при «неопределяемом» не передаёт вирус половым путём (U=U). Профилактика: PrEP до контакта, PEP — в течение 72 ч после.",
      consequences: "Без лечения — СПИД: тяжёлый иммунодефицит, оппортунистические инфекции и опухоли, смерть.",
      sources: [{ label: CDC, url: "https://www.cdc.gov/hiv/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hiv-aids" }] } },
  { key: "hpv", label: "ВПЧ", color: "#ff4d6d", sev: 4, p: 0.25, beta: 0.40, e: 0.40, grounded: false,
    vax: { ve: 0.85, note: "Эффективнее до начала половой жизни; ~90% онкогенных типов, но не все. Оценка." },
    treat: "Нет лекарства; онкогенен", cons: "Рак (шейка, горло, анус), кондиломы", acc: "низкая",
    src: "Передача/акт — грубая оценка; ВПЧ очень заразен. Презерватив ~40% (CDC). Защищает прививка. Точность: низкая.",
    guide: {
      symptoms: "Чаще всего бессимптомно; в 9 из 10 случаев инфекция уходит сама за ~2 года. Некоторые типы дают генитальные кондиломы (бородавки); онкогенные типы протекают скрыто и выявляются скринингом.",
      treatment: "Лекарства от самого вируса нет — лечат проявления: кондиломы удаляют, предраковые изменения шейки матки наблюдают и лечат. Надёжно предотвращается вакциной (лучше всего до начала половой жизни).",
      consequences: "Онкогенные типы вызывают рак шейки матки, а также рак ануса, ротоглотки, полового члена, вульвы и влагалища.",
      sources: [{ label: CDC, url: "https://www.cdc.gov/sti/about/about-genital-hpv-infection.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/human-papilloma-virus-and-cancer" }] } },
  { key: "hbv", label: "Гепатит B", color: "#94d82d", sev: 4, p: 0.003, beta: 0.03, e: 0.90, grounded: false,
    vax: { ve: 0.95, note: "При иммунном ответе ~95%, заражение почти исключено. Оценка." },
    treat: "Хронический неизлечим; есть прививка", cons: "Цирроз, рак печени при хронизации", acc: "низкая",
    src: "Сексуальная передача/акт — грубая оценка. Презерватив ~90%. Зависит от прививки. Точность: низкая.",
    guide: {
      symptoms: "Часто бессимптомно. Острая фаза: усталость, тошнота, боль в животе, тёмная моча, желтуха. Чем младше заразившийся, тем выше шанс перехода в хроническую форму.",
      treatment: "Острый гепатит обычно проходит сам; хронический неизлечим, но контролируется противовирусными препаратами. Надёжно предотвращается вакцинацией.",
      consequences: "Хроническая инфекция со временем → цирроз и рак печени.",
      sources: [{ label: CDC, url: "https://www.cdc.gov/hepatitis-b/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hepatitis-b" }] } },
  { key: "hcv", label: "Гепатит C", color: "#748ffc", sev: 3, p: 0.005, beta: 0.0002, e: 0.70, grounded: false,
    treat: "Излечим (~95%, DAA)", cons: "Цирроз, рак печени без лечения", acc: "низкая",
    src: "В основном через кровь; сексуальная передача низкая и оценочная. Излечим (DAA ~95%). Точность: низкая.",
    guide: {
      symptoms: "Обычно бессимптомно годами; иногда усталость, желтуха. Многие не знают, что заражены, поэтому важен анализ.",
      treatment: "Излечим: курс противовирусных прямого действия (DAA) даёт ~95% выздоровления за 8–12 недель. Вакцины нет. Передаётся в основном через кровь, половой путь — реже.",
      consequences: "Без лечения — цирроз, печёночная недостаточность, рак печени.",
      sources: [{ label: CDC, url: "https://www.cdc.gov/hepatitis-c/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/hepatitis-c" }] } },
  { key: "syp", label: "Сифилис", color: "#cc5de8", sev: 3, p: 0.004, beta: 0.10, e: 0.60, grounded: false,
    treat: "Излечим (пенициллин)", cons: "Поражение мозга, сердца, НС (третичный)", acc: "низкая-средняя",
    src: "Передача/акт — оценка; шанкр часто вне зоны презерватива. Презерватив ~50–71% (CDC). Точность: низкая–средняя.",
    guide: {
      symptoms: "Стадийное течение. Первичный: безболезненная язва (шанкр) в месте заражения. Вторичный: сыпь (часто на ладонях и стопах), температура, увеличение лимфоузлов. Затем латентная стадия без симптомов.",
      treatment: "Излечим антибиотиком (пенициллин). Чем раньше начато лечение, тем проще; повреждения третичной стадии необратимы.",
      consequences: "Без лечения через годы — третичный сифилис: поражение сердца, мозга и нервной системы; при беременности — врождённый сифилис у ребёнка.",
      sources: [{ label: CDC, url: "https://www.cdc.gov/syphilis/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/syphilis" }] } },
  { key: "gon", label: "Гонорея", color: "#ff922b", sev: 2, p: 0.008, beta: 0.20, e: 0.90, grounded: false,
    treat: "Излечима; растёт устойчивость", cons: "Бесплодие, ВЗОМТ, диссеминация", acc: "низкая",
    src: "Передача/акт — грубая оценка; презерватив >90% (CDC). Антибиотикорезистентность. Точность: низкая для β.",
    guide: {
      symptoms: "Часто бессимптомна (особенно у женщин). Возможны: жжение при мочеиспускании, выделения (бели, гной), у женщин — кровотечения между циклами. Бывает ректальная и глоточная формы.",
      treatment: "Излечима антибиотиком (инъекция цефтриаксона), но устойчивость к препаратам растёт — лечение строго по назначению врача.",
      consequences: "Без лечения — ВЗОМТ, бесплодие, внематочная беременность; может распространиться в кровь и суставы; повышает риск заражения ВИЧ.",
      sources: [{ label: CDC, url: "https://www.cdc.gov/gonorrhea/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" }] } },
  { key: "chl", label: "Хламидия", color: "#ffd43b", sev: 2, p: 0.045, beta: 0.10, e: 0.70, grounded: false,
    treat: "Излечима антибиотиком", cons: "Бесплодие, ВЗОМТ (часто скрыто)", acc: "низкая-средняя",
    src: "Передача/акт — оценка; часто бессимптомна. Презерватив 50–90% (CDC). Точность: низкая–средняя.",
    guide: {
      symptoms: "Часто бессимптомна. Возможны выделения, жжение при мочеиспускании, боль внизу живота; симптомы могут появиться лишь через несколько недель.",
      treatment: "Излечима антибиотиком; важно пройти весь курс и пролечить партнёров, иначе повторное заражение.",
      consequences: "Без лечения — ВЗОМТ, рубцевание маточных труб, бесплодие, внематочная беременность.",
      sources: [{ label: CDC, url: "https://www.cdc.gov/chlamydia/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" }] } },
  { key: "tri", label: "Трихомониаз", color: "#20c997", sev: 1, p: 0.02, beta: 0.12, e: 0.50, grounded: false,
    treat: "Излечим одним курсом", cons: "Воспаление; повышает риск др. ИППП", acc: "низкая",
    src: "Передача/акт — оценка; презерватив ~50%. Лечится одним курсом. Точность: низкая.",
    guide: {
      symptoms: "Около 70% — без симптомов. Возможны: зуд, жжение, покраснение, выделения (у женщин нередко пенистые с запахом), дискомфорт при мочеиспускании.",
      treatment: "Легко излечим: курс антибиотика (метронидазол или тинидазол); лечить нужно обоих партнёров.",
      consequences: "Воспаление; повышает риск заражения и передачи других ИППП, включая ВИЧ; при беременности — преждевременные роды.",
      sources: [{ label: CDC, url: "https://www.cdc.gov/trichomoniasis/about/index.html" }, { label: WHO, url: "https://www.who.int/news-room/fact-sheets/detail/sexually-transmitted-infections-(stis)" }] } },
];

const ACC_COLOR = { "высокая": "#38d9a9", "низкая-средняя": "#ffc300", "низкая": "#ff7b00" };

const pctVal = (x) => {
  if (x <= 0) return "0%";
  if (x >= 10) return Math.round(x) + "%";
  if (x >= 1) return x.toFixed(0) + "%";
  if (x >= 0.1) return x.toFixed(1).replace(".", ",") + "%";
  const d = Math.max(2, Math.ceil(-Math.log10(x)) + 1);
  return parseFloat(x.toFixed(d)).toString().replace(".", ",") + "%";
};
const pctAct = (v) => {
  const x = v * 100;
  if (x <= 0) return "0%";
  if (x >= 10) return Math.round(x) + "%";
  if (x >= 1) return x.toFixed(0) + "%";
  const d = Math.max(2, Math.ceil(-Math.log10(x)) + 1);
  return parseFloat(x.toFixed(d)).toString().replace(".", ",") + "%";
};
const fmtDur = (m) => {
  if (m <= 0) return "разово";
  if (m < 1) return `≈ ${Math.round(m * 4.33)} нед`;
  if (m < 12) return `${Math.round(m)} мес`;
  return `${(Math.round((m / 12) * 10) / 10).toString().replace(".", ",")} г`;
};

const TYPES = [
  { key:"steady", label:"Постоянные", color:"#f0a500", kind:"ongoing",  countMax:3,  countLab:"сколько", addCount:1 },
  { key:"casual", label:"Приходящие", color:"#2ec4b6", kind:"recurring", countMax:12, countLab:"сколько в год", addCount:2 },
  { key:"hookup", label:"Хукапы",     color:"#4dabf7", kind:"oneoff",   countMax:50, countLab:"сколько в год", addCount:5 },
];
const BASE = {
  steady: { count:1, condom:15, perWeek:2.5, dur:0,   tested:100, poolMul:1.0 },
  casual: { count:2, condom:50, perWeek:1,   dur:2.5, tested:0,   poolMul:1.4 },
  hookup: { count:2, condom:75, perWeek:0,   dur:0,   tested:0,   poolMul:1.8 },
};
const mkCfg = (over = {}) => ({
  steady: { ...BASE.steady, ...(over.steady || { count: 0 }) },
  casual: { ...BASE.casual, ...(over.casual || { count: 0 }) },
  hookup: { ...BASE.hookup, ...(over.hookup || { count: 0 }) },
});
const PRESETS = [
  { key:"celibate", label:"Целибат" },
  { key:"mono", label:"Моногамия", steady:{count:1,condom:10,tested:100,perWeek:3} },
  { key:"serial", label:"Серийная моногамия", casual:{count:1,condom:20,perWeek:3,dur:18,tested:30} },
  { key:"monogamish", label:"Monogamish", steady:{count:1,condom:15,tested:80,perWeek:3}, hookup:{count:2,condom:80} },
  { key:"open", label:"Открытые / свинг", steady:{count:1,condom:30,tested:60,perWeek:2}, casual:{count:4,condom:60,perWeek:1,dur:2,tested:20}, hookup:{count:3,condom:80} },
  { key:"poly", label:"Полиамория", steady:{count:2,condom:40,tested:60,perWeek:2}, casual:{count:1,condom:50,perWeek:1,dur:6,tested:30} },
  { key:"ons", label:"ONS / хукапы", hookup:{count:12,condom:80} },
  { key:"core", label:"Core group", casual:{count:2,condom:40,perWeek:1,dur:1,tested:0}, hookup:{count:30,condom:60} },
];

const veMulOf = (s, vaxHpv, vaxHbv) => {
  const vacc = (s.key === "hpv" && vaxHpv) || (s.key === "hbv" && vaxHbv);
  return s.vax && vacc ? (1 - s.vax.ve) : 1;
};

// Множитель передачи на акт по виду секса, относительно рецептивного вагинального (=1).
// Опорные значения по ВИЧ (Patel 2014, CDC, на 10 000 экспозиций): рец.ваг 8, ввод.ваг 4,
// рец.анал 138, ввод.анал 11, оральный — очень низкий. Для не-ВИЧ — грубое приближение.
const ACT_MUL = { vagR: 1, vagI: 0.5, analR: 17, analI: 1.4, oralR: 0.1, oralI: 0.02 };
const ACT_KEYS = ["vagR", "vagI", "analR", "analI", "oralR", "oralI"];
const actSelOf = (acts) => ACT_KEYS.filter((k) => acts[k]).map((k) => ACT_MUL[k]);

// Аддитивная модель видов секса: в каждом контакте практикуется каждая выбранная практика
// (со своим множителем к β). Выживаемость за один контакт = произведение «не заразиться» по
// всем практикам, поэтому добавление практики риск только повышает (или не меняет, если β·m≈0).
// factor = (1 − презерватив·e)·прививка. Пустой набор → 1 (риск 0). Каждый βeff клампится.
const encSurvOf = (s, actSel, factor) => {
  let surv = 1;
  for (let i = 0; i < actSel.length; i++) surv *= 1 - Math.min(0.999, s.beta * actSel[i] * factor);
  return surv;
};

function survivalAt(s, t, cfg, veMul, actSel = [1]) {
  let Srec = 1;
  ["casual", "hookup"].forEach((key) => {
    const T = cfg[key]; const cnt = Math.round(T.count);
    if (cnt <= 0) return;
    const encSurv = encSurvOf(s, actSel, (1 - (T.condom / 100) * s.e) * veMul);
    const k = key === "hookup" ? 1 : Math.max(1, T.perWeek * (52 / 12) * T.dur);
    const pEff = Math.min(1, s.p * T.poolMul * (1 - T.tested / 100));
    const transmit = 1 - Math.pow(encSurv, k);
    Srec *= Math.pow(1 - pEff * transmit, cnt);
  });
  const recCum = Math.pow(Srec, t / 12);
  let steadySurv = 1;
  const ST = cfg.steady; const sc = Math.round(ST.count);
  if (sc > 0) {
    const encSurv = encSurvOf(s, actSel, (1 - (ST.condom / 100) * s.e) * veMul);
    const k = Math.max(1, ST.perWeek * (52 / 12) * t);
    const pEff = Math.min(1, s.p * ST.poolMul * (1 - ST.tested / 100));
    const transmit = 1 - Math.pow(encSurv, k);
    steadySurv = Math.pow(1 - pEff * transmit, sc);
  }
  return recCum * steadySurv;
}

function Info({ text }) {
  return (
    <span className="src" tabIndex={0} style={{ marginLeft: 6, verticalAlign: "middle" }}>
      <span className="ic">i</span>
      <span className="box">{text}</span>
    </span>
  );
}

const SEXACTS = [
  { grp: "Вагинальный", excl: true, items: [["vagR", "принимающий"], ["vagI", "вводящий"]] },
  { grp: "Анальный", excl: false, items: [["analR", "принимающий"], ["analI", "вводящий"]] },
  { grp: "Оральный", excl: false, items: [["oralR", "принимающий"], ["oralI", "отдающий"]] },
];
function SexActs({ acts, setActs }) {
  const toggle = (grp, key) => setActs((a) => {
    const next = { ...a, [key]: !a[key] };
    if (grp.excl && next[key]) grp.items.forEach(([k]) => { if (k !== key) next[k] = false; });
    return next;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {SEXACTS.map((grp) => (
        <div key={grp.grp} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: C.mid, fontSize: 12.5, width: 96, flex: "0 0 96px" }}>{grp.grp}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {grp.items.map(([key, lab]) => {
              const on = !!acts[key];
              return (
                <button key={key} onClick={() => toggle(grp, key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: on ? `${C.accent}22` : "transparent", border: `1px solid ${on ? C.accent : C.border}`, color: on ? C.hi : C.dim, padding: "5px 11px", borderRadius: 999, cursor: "pointer", fontSize: 12.5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: on ? C.accent : C.dim, opacity: on ? 1 : 0.5 }} />{lab}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Slider({ label, value, set, min, max, step, valueText, hint, info }) {
  return (
    <div style={{ flex: 1, minWidth: 150 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ color: C.mid, fontSize: 13, letterSpacing: 0.2, display: "inline-flex", alignItems: "center" }}>{label}{info && <Info text={info} />}</span>
        <span style={{ color: C.accent, fontSize: 16, fontWeight: 600, fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" }}>{valueText}</span>
      </div>
      <input className="rng" type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(parseFloat(e.target.value))} />
      {hint && <div style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function TypeCard({ meta, t, setT, open, toggleOpen }) {
  const col = meta.color;
  const cnt = Math.round(t.count);
  if (cnt <= 0) {
    return (
      <button onClick={() => setT({ count: meta.addCount })} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", background: "transparent", border: `1px dashed ${C.border}`, borderLeft: `3px solid ${col}77`, borderRadius: 10, padding: "11px 14px", cursor: "pointer" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: col, opacity: 0.55 }} />
        <span style={{ color: C.mid, fontSize: 13.5 }}>{meta.label}</span>
        <span style={{ marginLeft: "auto", color: col, fontSize: 12.5, fontWeight: 600 }}>+ добавить</span>
      </button>
    );
  }
  const cap = meta.kind === "ongoing" ? `фон среды ×${t.poolMul}` : meta.kind === "oneoff" ? `1 акт · фон ×${t.poolMul}` : `${fmtDur(t.dur)} · фон ×${t.poolMul}`;
  return (
    <div style={{ background: C.panel, border: `1px solid ${col}55`, borderLeft: `3px solid ${col}`, borderRadius: 12, padding: "13px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: col }} />
        <span style={{ color: C.hi, fontSize: 14, fontWeight: 600 }}>{meta.label}</span>
        <span style={{ color: C.dim, fontSize: 11, marginLeft: "auto", display: "inline-flex", alignItems: "center" }}>{cap}<Info text="Фон среды — оценка ассортативности (смешивания): случайные и хукап-партнёры чаще из более активного/рискового круга, поэтому шанс, что партнёр заражён, у них выше. Множитель к распространённости p: постоянные ×1, приходящие ×1,4, хукапы ×1,8 (оценка)." /></span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Slider label={meta.countLab} value={t.count} set={(v) => setT({ count: Math.round(v) })} min={0} max={meta.countMax} step={1} valueText={`${cnt}`} />
        <Slider label="Презерватив" value={t.condom} set={(v) => setT({ condom: v })} min={0} max={100} step={1} valueText={`${t.condom}%`} info="Доля актов с партнёрами этого типа, в которых используется презерватив." />
        <Slider label="Проверены" value={t.tested} set={(v) => setT({ tested: v })} min={0} max={100} step={1} valueText={`${t.tested}%`} info="Доля партнёров этого типа с недавним отрицательным тестом на ИППП — снижает шанс, что партнёр заражён. Тест не идеален (есть «окно»), поэтому это оценка." />
      </div>
      <button onClick={toggleOpen} style={{ background: "transparent", border: "none", color: col, fontSize: 12, cursor: "pointer", padding: 0, marginTop: 12 }}>{open ? "▾ детали" : "▸ детали"}</button>
      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 13 }}>
          {meta.kind !== "oneoff" && (
            <Slider label="Секс в неделю" value={t.perWeek} set={(v) => setT({ perWeek: Math.round(v * 10) / 10 })} min={0.1} max={14} step={0.1} valueText={`${t.perWeek.toFixed(1).replace(".", ",")}×`} hint="как часто секс с одним таким партнёром" />
          )}
          {meta.kind === "recurring" && (
            <Slider label="Длительность связи" value={t.dur} set={(v) => setT({ dur: v })} min={0} max={60} step={1} valueText={fmtDur(t.dur)} hint="как долго длится одна такая связь" />
          )}
          {meta.kind === "oneoff" && <div style={{ color: C.dim, fontSize: 12 }}>Разовый контакт — один акт на партнёра.</div>}
          {meta.kind === "ongoing" && <div style={{ color: C.dim, fontSize: 12 }}>Длится весь период — экспозиция копится со временем.</div>}
        </div>
      )}
    </div>
  );
}

function packLanes(list) {
  const order = { steady: 0, casual: 1, hookup: 2 };
  const sorted = [...list].sort((a, b) => (order[a.type] - order[b.type]) || (a.start - b.start));
  const laneEnd = [];
  sorted.forEach((p) => {
    let lane = -1;
    for (let i = 0; i < laneEnd.length; i++) { if (laneEnd[i] <= p.start + 0.01) { lane = i; break; } }
    if (lane === -1) { lane = laneEnd.length; laneEnd.push(p.end); } else laneEnd[lane] = p.end;
    p.lane = lane;
  });
  return { list: sorted, lanes: Math.max(1, laneEnd.length) };
}
function buildPartnersTyped(cfg, horizonM) {
  const years = horizonM / 12;
  const list = [];
  const nSteady = Math.round(cfg.steady.count);
  for (let i = 0; i < nSteady; i++) list.push({ start: 0, end: horizonM, type: "steady" });
  let total = nSteady;
  const flow = (key, durM, seed) => {
    const perYear = Math.round(cfg[key].count); if (perYear <= 0) return;
    const tot = Math.round(perYear * years); total += tot;
    const shown = Math.min(tot, 240);           // рисуем максимум столько, но спред — на весь горизонт
    for (let j = 0; j < shown; j++) {
      const h = Math.abs(Math.sin((j + 1 + seed) * 12.9898) * 43758.5453) % 1;
      const base = (j + 0.5) / shown * horizonM;
      const start = Math.min(horizonM - 0.05, Math.max(0, base + (h - 0.5) * (horizonM / shown) * 0.8));
      const d = Math.max(0.2, durM * (0.7 + h * 0.6));
      list.push({ start, end: Math.min(horizonM, start + d), type: key });
    }
  };
  flow("casual", cfg.casual.dur, 0);
  flow("hookup", 0.3, 99);
  return { list, total };
}
function Timeline({ packed, horizonM, years }) {
  const { list, lanes } = packed;
  const gap = lanes > 12 ? 2 : 4;
  const rowH = Math.max(4, Math.min(15, Math.floor(240 / Math.max(1, lanes)) - gap));
  const yt = []; const ts = years <= 12 ? 1 : years <= 30 ? 5 : 10;
  for (let y = 0; y <= years; y += ts) yt.push(y);
  return (
    <div>
      <div style={{ position: "relative", height: lanes * (rowH + gap) }}>
        {Array.from({ length: lanes }).map((_, i) => (<div key={"l" + i} style={{ position: "absolute", left: 0, right: 0, top: i * (rowH + gap), height: rowH, background: C.panel2, borderRadius: 3 }} />))}
        {list.map((p, idx) => { const col = p.type === "steady" ? "#f0a500" : p.type === "casual" ? "#2ec4b6" : "#4dabf7"; return <div key={idx} title={p.type} style={{ position: "absolute", top: p.lane * (rowH + gap), height: rowH, left: `${(p.start / horizonM) * 100}%`, width: `${Math.max(0.5, ((p.end - p.start) / horizonM) * 100)}%`, background: col, borderRadius: 3, opacity: 0.88 }} />; })}
      </div>
      <div style={{ position: "relative", height: 16, marginTop: 4 }}>
        {yt.map((y) => (<span key={y} style={{ position: "absolute", left: `${(y / years) * 100}%`, fontSize: 11, color: C.dim, transform: y === 0 ? "none" : "translateX(-50%)" }}>{y === 0 ? "0" : `${y}г`}</span>))}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, hidden, showAny }) {
  if (!active || !payload?.length) return null;
  const yrs = Math.floor(label / 12), mos = label % 12;
  const rows = payload.filter((e) => (e.dataKey === "any" ? showAny : !hidden[e.dataKey])).sort((a, b) => b.value - a.value);
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>
      <div style={{ color: C.mid, marginBottom: 6 }}>{yrs > 0 ? yrs + " г " : ""}{mos} мес</div>
      {rows.map((e) => { const s = STIS.find((x) => x.key === e.dataKey); return (<div key={e.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 18, color: C.hi }}><span><span style={{ color: e.stroke }}>●</span> {s ? s.label : "Хотя бы одна"}</span><span>{pctVal(e.value)}</span></div>); })}
    </div>
  );
}

function Breakdown({ s, cfg, years, veMul, actSel = [1] }) {
  const horizonM = years * 12;
  const yWord = years === 1 ? "год" : years < 5 ? "года" : "лет";
  const fmtP = (v) => pctVal(v * 100);
  const active = TYPES.map((meta) => {
    const T = cfg[meta.key]; const cnt = Math.round(T.count);
    if (cnt <= 0) return null;
    const encSurv = encSurvOf(s, actSel, (1 - (T.condom / 100) * s.e) * veMul);
    const actEff = 1 - encSurv; // передача за один контакт (все практики), если партнёр заражён
    const k = meta.kind === "oneoff" ? 1 : meta.kind === "ongoing" ? Math.max(1, T.perWeek * (52 / 12) * horizonM) : Math.max(1, T.perWeek * (52 / 12) * T.dur);
    const pEff = Math.min(1, s.p * T.poolMul * (1 - T.tested / 100));
    const transmit = 1 - Math.pow(encSurv, k);
    const perPartner = pEff * transmit;
    const toHorizon = meta.kind === "ongoing" ? 1 - Math.pow(1 - perPartner, cnt) : 1 - Math.pow(Math.pow(1 - perPartner, cnt), years);
    return { meta, T, cnt, actEff, k, pEff, toHorizon };
  }).filter(Boolean);
  if (active.length === 0) return <div style={{ color: C.mid, fontSize: 13, padding: "8px 0" }}>Нет активных партнёров — добавь кого-нибудь в карточках слева, чтобы увидеть разбор.</div>;
  const totalRisk = 1 - survivalAt(s, horizonM, cfg, veMul, actSel);
  const condAll = (pct) => ({ steady: { ...cfg.steady, condom: pct }, casual: { ...cfg.casual, condom: pct }, hookup: { ...cfg.hookup, condom: pct } });
  const ho0 = 1 - survivalAt(s, horizonM, condAll(0), veMul, actSel);
  const ho100 = 1 - survivalAt(s, horizonM, condAll(100), veMul, actSel);
  const bareAct = 1 - encSurvOf(s, actSel, 1);
  const condAct = 1 - encSurvOf(s, actSel, 1 - s.e);
  const cutAct = bareAct > 0 ? Math.round((1 - condAct / bareAct) * 100) : Math.round(s.e * 100);
  const cutHor = ho0 > 0 ? Math.round((1 - ho100 / ho0) * 100) : 0;
  const bars = [
    { lab: "За 1 контакт (все практики, если партнёр заражён)", a: bareAct, b: condAct, fmt: pctAct },
    { lab: `За ${years} ${yWord}`, a: ho0, b: ho100, fmt: fmtP },
  ];
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ color: C.hi, fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Что даёт презерватив (если использовать в каждом контакте со всеми)</div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.mid, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "#ff7b73" }} />без презерватива</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "#4dd4ac" }} />с презервативом</span>
        </div>
        {bars.map((row, i) => { const max = Math.max(row.a, row.b, 1e-9); return (
          <div key={i} style={{ marginBottom: 13 }}>
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>{row.lab}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <div style={{ flex: 1, height: 16, background: C.panel2, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.max(2, (row.a / max) * 100)}%`, height: "100%", background: "#ff7b73" }} /></div>
              <span className="num" style={{ width: 56, textAlign: "right", fontSize: 12.5, color: C.hi, fontWeight: 600 }}>{row.fmt(row.a)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 16, background: C.panel2, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.max(2, (row.b / max) * 100)}%`, height: "100%", background: "#4dd4ac" }} /></div>
              <span className="num" style={{ width: 56, textAlign: "right", fontSize: 12.5, color: C.hi, fontWeight: 600 }}>{row.fmt(row.b)}</span>
            </div>
          </div>
        ); })}
        <div style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.55, marginTop: 6 }}>
          {cutAct - cutHor >= 4 ? (
            <>За <b style={{ color: C.hi }}>один контакт</b> презерватив убирает <b style={{ color: "#4dd4ac" }}>{cutAct}%</b> риска. Но за <b style={{ color: C.hi }}>{years} {yWord}</b> с повторами — уже только <b style={{ color: "#ff7b73" }}>{cutHor}%</b>: при многих контактах риск «насыщается», и относительная защита падает.</>
          ) : (
            <>И за <b style={{ color: C.hi }}>один контакт</b>, и за <b style={{ color: C.hi }}>{years} {yWord}</b> презерватив убирает примерно одинаково (~<b style={{ color: "#4dd4ac" }}>{cutHor}%</b>). У редко передающихся инфекций риск не «насыщается», поэтому относительная защита со временем не падает.</>
          )}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0 14px" }} />
      <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.6, marginBottom: 12 }}>Вклад каждого <b style={{ color: C.hi }}>типа партнёров</b> за {years} {yWord} (своя частота, длительность, презерватив, проверенность, фон), затем они объединяются:</div>
      <div style={{ overflowX: "auto" }}>
        <table className="inf" style={{ minWidth: 560 }}>
          <thead><tr><th>Тип</th><th>Партнёров</th><th>Контактов k</th><th>Передача за контакт</th><th>Шанс партнёр заразен</th><th>Риск за {years} {yWord}</th></tr></thead>
          <tbody>
            {active.map((r) => (
              <tr key={r.meta.key} style={{ borderLeft: `3px solid ${r.meta.color}` }}>
                <td style={{ whiteSpace: "nowrap", color: C.hi }}><span style={{ color: r.meta.color, marginRight: 6 }}>●</span>{r.meta.label}</td>
                <td className="num">{r.cnt}{r.meta.kind !== "ongoing" ? "/год" : ""}</td>
                <td className="num">{Math.round(r.k)}</td>
                <td className="num">{pctAct(r.actEff)}</td>
                <td className="num">{fmtP(r.pEff)}</td>
                <td className="num" style={{ color: C.hi, fontWeight: 600 }}>{fmtP(r.toHorizon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, padding: "12px 14px", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, color: C.mid, lineHeight: 1.55 }}>
        «Шанс партнёр заразен» = распространённость p × фон среды × (1 − проверенность). «Передача за контакт» складывает выбранные виды секса и уже учитывает презерватив и прививку этого типа. Общий риск = 1 − произведение «не заразиться» по всем типам = <b style={{ color: s.color }}>{fmtP(totalRisk)}</b> — это и есть высота кривой «{s.label.toLowerCase()}» за {years} {yWord}.
      </div>
    </div>
  );
}

const OPEN = PRESETS.find((p) => p.key === "open");

export default function App() {
  const [cfg, setCfg] = useState(mkCfg(OPEN));
  const [years, setYears] = useState(10);
  const [yMax, setYMax] = useState(100);
  const [hidden, setHidden] = useState({});
  const [showAny, setShowAny] = useState(false);
  const [selected, setSelected] = useState("chl");
  const [vaxHpv, setVaxHpv] = useState(false);
  const [vaxHbv, setVaxHbv] = useState(false);
  const [acts, setActs] = useState({ vagR: true, vagI: false, analR: false, analI: false, oralR: false, oralI: false });
  const [activePreset, setActivePreset] = useState("open");
  const [open, setOpen] = useState({});
  const [guideOpen, setGuideOpen] = useState({});

  const actSel = useMemo(() => actSelOf(acts), [acts]);

  // Всплывашки .box у кнопок «i» не должны уезжать за край экрана.
  useEffect(() => {
    const place = (e) => {
      const src = e.target && e.target.closest && e.target.closest(".src");
      if (!src) return;
      const box = src.querySelector(".box"); if (!box) return;
      box.style.left = ""; box.style.right = ""; box.style.top = ""; box.style.bottom = "";
      requestAnimationFrame(() => {
        const m = 8, vw = window.innerWidth;
        let r = box.getBoundingClientRect();
        if (r.right > vw - m) { box.style.right = "0"; box.style.left = "auto"; }
        if (r.left < m) { box.style.left = "0"; box.style.right = "auto"; }
        r = box.getBoundingClientRect();
        if (r.top < m) { box.style.top = "140%"; box.style.bottom = "auto"; }
      });
    };
    document.addEventListener("mouseover", place);
    document.addEventListener("focusin", place);
    return () => { document.removeEventListener("mouseover", place); document.removeEventListener("focusin", place); };
  }, []);

  const horizonM = years * 12;
  const setType = (key, patch) => { setCfg((c) => ({ ...c, [key]: { ...c[key], ...patch } })); setActivePreset(null); };
  const applyPreset = (pr) => { setCfg(mkCfg(pr)); setActivePreset(pr.key); };
  const toggle = (k) => setHidden((h) => ({ ...h, [k]: !h[k] }));

  const riskPct = (s, t) => (1 - survivalAt(s, t, cfg, veMulOf(s, vaxHpv, vaxHbv), actSel)) * 100;

  const chartData = useMemo(() => {
    const st = Math.max(1, Math.ceil(horizonM / 170));
    const pts = [];
    for (let t = 0; t <= horizonM; t += st) {
      const row = { t }; let anyS = 1;
      STIS.forEach((s) => {
        const sv = survivalAt(s, t, cfg, veMulOf(s, vaxHpv, vaxHbv), actSel);
        row[s.key] = (1 - sv) * 100;
        if (!hidden[s.key]) anyS *= sv;
      });
      row.any = (1 - anyS) * 100;
      pts.push(row);
    }
    return pts;
  }, [cfg, years, vaxHpv, vaxHbv, hidden, actSel]);

  const built = useMemo(() => buildPartnersTyped(cfg, horizonM), [cfg, horizonM]);
  const packed = useMemo(() => packLanes(built.list), [built]);
  const avgWeek = cfg.steady.count * cfg.steady.perWeek + cfg.casual.count * cfg.casual.dur / 12 * cfg.casual.perWeek + cfg.hookup.count / 52;

  const ts = years <= 12 ? 1 : years <= 30 ? 5 : 10;
  const ticks = []; for (let y = 0; y <= years; y += ts) ticks.push(y * 12);
  const top = [...STIS].filter((s) => !hidden[s.key]).sort((a, b) => riskPct(b, horizonM) - riskPct(a, horizonM))[0];
  const selSti = STIS.find((x) => x.key === selected);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.hi, fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: "28px 18px 48px" }}>
      <style>{`
        .rng { -webkit-appearance:none; appearance:none; width:100%; height:4px; border-radius:4px; background:${C.border}; outline:none; }
        .rng::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:18px; height:18px; border-radius:50%; background:${C.accent}; cursor:grab; border:3px solid ${C.bg}; box-shadow:0 0 0 1px ${C.accent}; }
        .rng::-webkit-slider-thumb:active { cursor:grabbing; }
        .rng::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:${C.accent}; cursor:grab; border:3px solid ${C.bg}; }
        summary { cursor:pointer; }
        .tbl-wrap { overflow-x:auto; }
        table.inf { border-collapse:collapse; width:100%; min-width:760px; font-size:13px; }
        table.inf th, table.inf td { text-align:left; padding:10px 12px; border-bottom:1px solid ${C.border}; vertical-align:middle; }
        table.inf th { color:${C.dim}; font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }
        .num { font-variant-numeric:tabular-nums; }
        .chk { width:17px; height:17px; cursor:pointer; }
        .studio { display:grid; grid-template-columns:1fr; gap:14px; align-items:start; margin-bottom:14px; }
        .studio-chart { position:sticky; top:0; z-index:5; order:-1; box-shadow:0 8px 16px -6px rgba(0,0,0,.55); }
        .chartbox { height:150px; }
        @media (min-width:880px) {
          .studio { grid-template-columns:360px minmax(0,1fr); }
          .studio-controls { grid-column:1; grid-row:1; }
          .studio-chart { grid-column:2; grid-row:1; top:16px; order:0; box-shadow:none; }
          .chartbox { height:380px; }
        }
        .src { position:relative; display:inline-flex; align-items:center; gap:5px; cursor:help; }
        .src .ic { width:12px; height:12px; border-radius:50%; border:1px solid ${C.dim}; color:${C.dim}; font-size:9px; line-height:1; display:inline-flex; align-items:center; justify-content:center; opacity:.85; }
        .src .box { display:none; position:absolute; right:0; bottom:140%; width:280px; background:${C.panel2}; border:1px solid ${C.border}; border-radius:8px; padding:10px 12px; font-size:12px; line-height:1.5; color:${C.mid}; z-index:20; box-shadow:0 8px 24px rgba(0,0,0,.4); text-transform:none; letter-spacing:0; font-weight:400; }
        .src:hover .box, .src:focus-within .box { display:block; }
        .pill { background:${C.panel2}; border:1px solid ${C.border}; color:${C.mid}; padding:6px 12px; border-radius:999px; font-size:12px; cursor:pointer; }
        .pill.on { background:${C.accent}; color:${C.bg}; border-color:${C.accent}; font-weight:600; }
        .ghd { color:${C.dim}; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:5px; }
        .gtx { color:${C.mid}; font-size:12.5px; line-height:1.55; }
        table.inf tbody tr.inf-row { cursor:pointer; transition:background .12s; }
        table.inf tbody tr.inf-row:hover { background:#ffffff0a; }
        table.inf tbody tr.inf-row.on { background:#ffffff12; }
        table.inf tbody tr.inf-row.on:hover { background:#ffffff16; }
      `}</style>

      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: 0 }}>Риск ЗППП во времени</h1>
            <span style={{ fontSize: 10, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 4, padding: "3px 7px", letterSpacing: 0.5, textTransform: "uppercase" }}>иллюстративная модель</span>
          </div>
          <p style={{ color: C.mid, fontSize: 14, margin: 0, lineHeight: 1.5 }}>Кумулятивная вероятность заразиться хотя бы раз. Настрой партнёров по типам слева. Оценки могут быть не точными — но сравнения и формы кривых могут быть полезны для иллюстративности.</p>
        </div>

        <div style={{ background: "#241a0e", border: `1px solid ${C.accent}`, borderRadius: 12, padding: "14px 16px", marginBottom: 18, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ flex: "0 0 24px", width: 24, height: 24, borderRadius: "50%", background: C.accent, color: C.bg, fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>!</span>
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.55 }}><b style={{ color: C.hi }}>Это любительский калькулятор, а не медицинский инструмент.</b> Цифры — грубые иллюстративные оценки (надёжные данные есть только по ВИЧ) и не предсказывают твой личный риск. Не принимай решения о тестировании, лечении или профилактике, опираясь на него, — консультируйся с врачом (венеролог/инфекционист) или в профильной службе.</div>
        </div>

        <div className="studio">
          <div className="studio-controls">
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>Пресет поведения</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PRESETS.map((pr) => (<button key={pr.key} onClick={() => applyPreset(pr)} className={"pill " + (activePreset === pr.key ? "on" : "")}>{pr.label}</button>))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
              {TYPES.map((meta) => (<TypeCard key={meta.key} meta={meta} t={cfg[meta.key]} setT={(patch) => setType(meta.key, patch)} open={!!open[meta.key]} toggleOpen={() => setOpen((o) => ({ ...o, [meta.key]: !o[meta.key] }))} />))}
            </div>

            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, display: "inline-flex", alignItems: "center" }}>Виды секса<Info text="Какими практиками ты занимаешься и в какой роли. Разные акты передают инфекцию по-разному: рецептивный анальный примерно в 17 раз рискованнее вагинального, вводящий — меньше, оральный — заметно ниже. Эти соотношения опираются на данные по ВИЧ (Patel 2014, CDC); для остальных инфекций это грубое приближение. Практики складываются: в каждом контакте учитывается каждая выбранная, поэтому добавление практики риск только повышает." /></div>
              <SexActs acts={acts} setActs={setActs} />
              {actSel.length === 0 && <div style={{ color: "#ff922b", fontSize: 12, marginTop: 10 }}>Не выбрано ни одной практики — риск считается нулевым.</div>}

              <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, margin: "16px 0 10px" }}>Защита и иммунитет</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[{ k: "hpv", on: vaxHpv, set: setVaxHpv, lab: "Привит от ВПЧ" }, { k: "hbv", on: vaxHbv, set: setVaxHbv, lab: "Привит от гепатита B" }].map((v) => (
                  <button key={v.k} onClick={() => v.set((x) => !x)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: v.on ? `${C.accent}22` : "transparent", border: `1px solid ${v.on ? C.accent : C.border}`, color: v.on ? C.hi : C.mid, padding: "8px 13px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${v.on ? C.accent : C.dim}`, background: v.on ? C.accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.bg, fontSize: 11, fontWeight: 700 }}>{v.on ? "✓" : ""}</span>{v.lab}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="studio-chart" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 16px 12px" }}>
            <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 16 }}>
              <Slider label="Период активной половой жизни" value={years} set={setYears} min={1} max={50} step={1} valueText={`${years} ${years === 1 ? "год" : years < 5 ? "года" : "лет"}`} hint="горизонт расчёта, не возраст" />
              <Slider label="Масштаб шкалы вероятности" value={yMax} set={setYMax} min={1} max={100} step={1} valueText={`до ${yMax}%`} hint="уменьши, чтобы разглядеть редкие" />
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
              {STIS.filter((s) => !hidden[s.key]).map((s) => (<span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mid }}><span style={{ width: 14, height: 0, borderTop: `3px ${s.grounded ? "solid" : "dashed"} ${s.color}`, display: "inline-block" }} />{s.label}</span>))}
            </div>
            <div className="chartbox">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={[0, horizonM]} ticks={ticks} interval={0} stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(t) => (t === 0 ? "0" : `${t / 12}г`)} />
                  <YAxis domain={[0, yMax]} allowDataOverflow stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }} tickFormatter={(v) => `${v}%`} width={46} />
                  <Tooltip content={(p) => <ChartTooltip {...p} hidden={hidden} showAny={showAny} />} />
                  {STIS.map((s) => (hidden[s.key] ? null : <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2.2} dot={false} strokeDasharray={s.grounded ? "0" : "6 4"} isAnimationActive={false} />))}
                  {showAny && <Line type="monotone" dataKey="any" stroke={C.hi} strokeWidth={1.6} strokeDasharray="1 3" dot={false} isAnimationActive={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
              <div style={{ color: C.mid, fontSize: 13 }}>{top ? <>За {years} {years < 5 ? "года" : "лет"} активной половой жизни выше всего риск <span style={{ color: top.color, fontWeight: 600 }}>{top.label.toLowerCase()}</span> — около <span style={{ color: C.hi, fontWeight: 600 }}>{pctVal(riskPct(top, horizonM))}</span>.</> : "Включи хотя бы одну инфекцию ниже."}</div>
              <button className={"pill " + (showAny ? "on" : "")} onClick={() => setShowAny((v) => !v)}>хотя бы одна из включённых</button>
            </div>
          </div>
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 18px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Структура партнёрств во времени</h2>
            <div style={{ fontSize: 12, color: C.mid }}>секс ≈ <b style={{ color: C.hi }}>{avgWeek.toFixed(1).replace(".", ",")}×</b>/нед · пик <b style={{ color: C.hi }}>{packed.lanes}</b> · всего связей: <b style={{ color: C.hi }}>{built.total}</b></div>
          </div>
          <p style={{ color: C.dim, fontSize: 12, margin: "0 0 14px", lineHeight: 1.5 }}>
            <span style={{ color: "#f0a500" }}>● постоянные</span> · <span style={{ color: "#2ec4b6" }}>● приходящие</span> · <span style={{ color: "#4dabf7" }}>● хукапы</span>. Наложение по вертикали = одновременные партнёры.
          </p>
          {packed.list.length === 0 ? <div style={{ color: C.mid, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Нет партнёров — добавь в карточках слева.</div> : <><Timeline packed={packed} horizonM={horizonM} years={years} />{built.total > packed.list.length && <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>показана часть связей для наглядности — статистика по всем {built.total}</div>}</>}
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "6px 6px", marginBottom: 14 }}>
          <div className="tbl-wrap">
            <table className="inf">
              <thead><tr><th style={{ width: 34 }}></th><th>Инфекция</th><th>Риск за {years} {years === 1 ? "год" : years < 5 ? "года" : "лет"}</th><th>За контакт: без → с презервативом</th><th>Лечение</th><th>Последствия</th><th style={{ width: 60, textAlign: "right" }}>Источник</th></tr></thead>
              <tbody>
                {STIS.flatMap((s) => {
                  const exp = !!guideOpen[s.key];
                  const rows = [
                  <tr key={s.key} className={"inf-row" + ((selected === s.key || exp) ? " on" : "")} onClick={() => { setSelected(s.key); setGuideOpen((g) => ({ ...g, [s.key]: !g[s.key] })); }} title={exp ? "свернуть гайд" : "открыть гайд по болезни"} style={{ borderLeft: `3px solid ${SEV[s.sev]}`, opacity: hidden[s.key] ? 0.45 : 1 }}>
                    <td onClick={(e) => e.stopPropagation()}><input className="chk" type="checkbox" checked={!hidden[s.key]} onChange={() => toggle(s.key)} style={{ accentColor: s.color }} /></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span style={{ color: s.color, marginRight: 7 }}>{s.grounded ? "●" : "◌"}</span>{s.label}
                      {((s.key === "hpv" && vaxHpv) || (s.key === "hbv" && vaxHbv)) && <span title={s.vax.note} style={{ marginLeft: 8, fontSize: 11, color: "#38d9a9", background: "#38d9a922", border: "1px solid #38d9a955", padding: "1px 7px", borderRadius: 6 }}>привит</span>}
                      <span aria-hidden style={{ marginLeft: 8, color: exp ? s.color : C.dim, fontSize: 10 }}>{exp ? "▾" : "▸"}</span>
                    </td>
                    <td className="num" style={{ color: C.hi, fontWeight: 600 }}>{pctVal(riskPct(s, horizonM))}</td>
                    <td className="num" style={{ color: C.mid, whiteSpace: "nowrap" }}>{pctAct(1 - encSurvOf(s, actSel, 1))} <span style={{ color: C.dim }}>→</span> {pctAct(1 - encSurvOf(s, actSel, 1 - s.e))}</td>
                    <td><span style={{ background: `${SEV[s.sev]}22`, color: SEV[s.sev], padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 500, display: "inline-block" }}>{s.treat}</span></td>
                    <td style={{ color: C.mid, fontSize: 12.5 }}>{s.cons}</td>
                    <td style={{ textAlign: "right" }}><span className="src" tabIndex={0}><span style={{ width: 8, height: 8, borderRadius: "50%", background: ACC_COLOR[s.acc] }} title={`точность: ${s.acc}`} /><span className="ic">i</span><span className="box"><b style={{ color: C.hi }}>Точность: {s.acc}</b><br />{s.src}</span></span></td>
                  </tr>,
                  ];
                  if (exp) rows.push(
                    <tr key={s.key + "-g"} style={{ borderLeft: `3px solid ${s.color}` }}>
                      <td />
                      <td colSpan={6} style={{ background: C.panel2, padding: "14px 16px" }}>
                        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                          <div><div className="ghd">Симптомы</div><div className="gtx">{s.guide.symptoms}</div></div>
                          <div><div className="ghd">Лечение</div><div className="gtx">{s.guide.treatment}</div></div>
                          <div><div className="ghd">Последствия</div><div className="gtx">{s.guide.consequences}</div></div>
                        </div>
                        <div style={{ marginTop: 12, fontSize: 12, color: C.dim }}>Источники: {s.guide.sources.map((src, i) => (<span key={i}>{i > 0 ? " · " : ""}<a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: s.color, textDecoration: "none" }}>{src.label} ↗</a></span>))} — справочная информация о болезни, не диагноз.</div>
                      </td>
                    </tr>
                  );
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        </div>

        <details open style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <summary style={{ color: C.hi, fontSize: 15, fontWeight: 600 }}>Разбор расчёта — откуда берётся цифра</summary>
          <p style={{ color: C.mid, fontSize: 13, lineHeight: 1.6, margin: "12px 0 12px" }}>Выбери инфекцию — покажем вклад каждого типа партнёров и как они складываются:</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {STIS.map((s) => (<button key={s.key} onClick={() => setSelected(s.key)} style={{ border: `1px solid ${selected === s.key ? s.color : C.border}`, background: selected === s.key ? `${s.color}22` : "transparent", color: selected === s.key ? C.hi : C.mid, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ color: s.color }}>●</span>{s.label}</button>))}
          </div>
          <Breakdown s={selSti} cfg={cfg} years={years} veMul={veMulOf(selSti, vaxHpv, vaxHbv)} actSel={actSel} />
        </details>

        <details style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <summary style={{ color: C.hi, fontSize: 15, fontWeight: 600 }}>Допущения и как это считается</summary>
          <div style={{ color: C.mid, fontSize: 13, lineHeight: 1.65, marginTop: 14 }}>
            <p style={{ marginTop: 0 }}>Только для <b style={{ color: C.hi }}>ВИЧ</b> вероятность передачи на акт и эффективность презерватива взяты из исследований (сплошная линия). Для остальных надёжных per-act чисел нет — правдоподобные средние (пунктир). Это сравнение и форма, а не точный прогноз.</p>
            <p><b style={{ color: C.hi }}>Типы партнёров.</b> Поведение задаётся тремя типами — постоянные, приходящие, хукапы — у каждого свои число, частота, длительность, презерватив и «проверенность». Это отражает реальность: с разными партнёрами по-разному и часто, и долго, и насколько защищённо (барьер с близкими используют реже, со случайными — чаще).</p>
            <p><b style={{ color: C.hi }}>Виды секса.</b> Передача за акт зависит от практики и роли: рецептивный анальный примерно в 17 раз рискованнее вагинального, вводящий — около половины, оральный — заметно ниже. Эти соотношения взяты из данных по ВИЧ (Patel 2014, CDC); для остальных инфекций они применены как грубое приближение. Практики складываются (аддитивно): считаем, что в каждом контакте присутствует каждая выбранная практика со своим β, а «не заразиться за контакт» = произведение по практикам — поэтому добавление любой практики риск только повышает (упрощение: в реальности не каждый контакт включает все практики). Рецептивный и вводящий вагинальный взаимоисключают друг друга (анатомия).</p>
            <p><b style={{ color: C.hi }}>Проверены.</b> Снижает шанс, что партнёр этого типа заражён, пропорционально доле проверенных. Тест не идеален — между заражением и положительным тестом есть «окно», поэтому даже 100% проверенных не гарантируют ноль; считаем это оценкой.</p>
            <p><b style={{ color: C.hi }}>Фон среды (множитель).</b> Оценка ассортативности — того, что люди чаще сходятся с похожими по активности. Случайные и хукап-партнёры в среднем из более активного/рискового круга, поэтому шанс, что такой партнёр уже заражён, выше, чем по общей популяции. Это множитель к распространённости p: постоянные ×1,0, приходящие ×1,4, хукапы ×1,8 — это оценки, не данные, и их легко поменять.</p>
            <p style={{ marginBottom: 0 }}><b style={{ color: C.hi }}>Формула.</b> Для типа: k = частота × длительность (хукап = 1 контакт); для каждой выбранной практики βeff = β·множитель_практики·(1 − презерватив·e)·прививка; выживаемость за контакт = ∏(1 − βeff) по практикам; шанс заразиться от заражённого партнёра = 1 − (выживаемость_за_контакт)^k; умножается на p · фон · (1 − проверенность); вклады перемножаются по всем партнёрам всех типов. Постоянные — длящаяся связь (экспозиция копится со временем); приходящие и хукапы обновляются каждый год. «Хотя бы одна» — независимость инфекций (грубая верхняя оценка).</p>
          </div>
        </details>

        <p style={{ color: C.dim, fontSize: 12, lineHeight: 1.6, textAlign: "center", marginTop: 0 }}>Это любительская образовательная модель, а не медицинский прогноз и не основание для медицинских решений.</p>
        <p style={{ color: C.dim, fontSize: 12, textAlign: "center", marginTop: 8 }}><a href="https://github.com/UserNameIsAlredyTaken/safesex" target="_blank" rel="noopener noreferrer" style={{ color: C.mid, textDecoration: "none" }}>Исходный код на GitHub ↗</a></p>
      </div>
    </div>
  );
}
