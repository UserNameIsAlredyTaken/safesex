import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

/*
  ИЛЛЮСТРАТИВНАЯ МОДЕЛЬ кумулятивного риска ЗППП во времени. Не медицинский прогноз.
  Модель (на одного нового партнёра, k актов с ним):
    β_eff = β·(1 − φ·e);  риск с заражённым партнёром = 1 − (1 − β_eff)^k;
    × распространённость p; складывается по N партнёрам в год; разворачивается во времени.
  ✓ grounded=true  → опирается на данные (сплошная линия)
  ◌ grounded=false → грубая оценка (пунктир); надёжных per-act чисел нет
*/

const C = {
  bg: "#0f141a", panel: "#161d26", panel2: "#1b2430", border: "#283442",
  hi: "#e8edf2", mid: "#9fb0c0", dim: "#64748b", accent: "#f0a500",
};

// severity 5=критично/неизлечимо ... 1=легко излечимо
const SEV = { 5: "#ff3b3b", 4: "#ff7b00", 3: "#ffc300", 2: "#b5d600", 1: "#38d9a9" };

const STIS = [
  { key: "hiv", label: "ВИЧ", color: "#4dabf7", sev: 5, p: 0.002, beta: 0.0008, e: 0.80, grounded: true,
    treat: "Неизлечимо — пожизненная АРТ", cons: "Без лечения — СПИД, иммунный отказ", acc: "высокая",
    src: "Передача/акт: Patel 2014 (CDC) — рецепт. вагинальный 8 на 10 000. Презерватив ~80%: Cochrane (Weller & Davis). Анальный ~в 17 раз опаснее. Точность: высокая." },
  { key: "hpv", label: "ВПЧ", color: "#ff4d6d", sev: 4, p: 0.25, beta: 0.40, e: 0.40, grounded: false,
    vax: { ve: 0.85, label: "ВПЧ-вакцина", note: "Эффективнее всего до начала половой жизни; закрывает ~90% онкогенных типов, но не все. Оценка эффекта." },
    treat: "Нет лекарства от вируса; онкогенен", cons: "Рак (шейка, горло, анус), кондиломы", acc: "низкая",
    src: "Передача/акт — грубая оценка (точных данных нет); ВПЧ очень заразен, пожизненная распространённость ~80%. Презерватив ~40% (CDC: значимой защиты мало, кожа-к-коже). Защищает прививка. Точность: низкая." },
  { key: "hbv", label: "Гепатит B", color: "#94d82d", sev: 4, p: 0.003, beta: 0.03, e: 0.90, grounded: false,
    vax: { ve: 0.95, label: "HBV-вакцина", note: "При состоявшемся иммунном ответе защита ~95% — сексуальное заражение почти исключено. Оценка эффекта." },
    treat: "Хронический неизлечим; есть прививка", cons: "Цирроз, рак печени при хронизации", acc: "низкая",
    src: "Сексуальная передача/акт — грубая оценка (HBV заразнее ВИЧ, но точных per-act чисел нет). Презерватив ~90%. Сильно зависит от прививочного статуса. Точность: низкая." },
  { key: "hcv", label: "Гепатит C", color: "#748ffc", sev: 3, p: 0.005, beta: 0.0002, e: 0.70, grounded: false,
    treat: "Излечим (~95%, препараты DAA)", cons: "Цирроз, рак печени без лечения", acc: "низкая",
    src: "В основном через кровь; сексуальная передача низкая и оценочная (выше при анальном/травмах). Презерватив помогает, данные слабые. Излечим современными препаратами (DAA ~95%). Точность: низкая." },
  { key: "syp", label: "Сифилис", color: "#cc5de8", sev: 3, p: 0.004, beta: 0.10, e: 0.60, grounded: false,
    treat: "Излечим (пенициллин)", cons: "Поражение мозга, сердца, НС (третичный)", acc: "низкая-средняя",
    src: "Передача/акт — оценка; шанкр часто вне зоны презерватива. Презерватив ~50–71% при корректном использовании (CDC). Точность: низкая–средняя." },
  { key: "gon", label: "Гонорея", color: "#ff922b", sev: 2, p: 0.008, beta: 0.20, e: 0.90, grounded: false,
    treat: "Излечима; растёт устойчивость", cons: "Бесплодие, ВЗОМТ, диссеминация", acc: "низкая",
    src: "Передача/акт — грубая оценка; презерватив >90% (CDC). Растущая антибиотикорезистентность. Точность: низкая для β." },
  { key: "chl", label: "Хламидия", color: "#ffd43b", sev: 2, p: 0.045, beta: 0.10, e: 0.70, grounded: false,
    treat: "Излечима антибиотиком", cons: "Бесплодие, ВЗОМТ (часто скрыто)", acc: "низкая-средняя",
    src: "Передача/акт — оценка; часто бессимптомна. Презерватив 50–90% (CDC). Точность: низкая–средняя." },
  { key: "tri", label: "Трихомониаз", color: "#20c997", sev: 1, p: 0.02, beta: 0.12, e: 0.50, grounded: false,
    treat: "Излечим одним курсом", cons: "Воспаление; повышает риск др. ИППП", acc: "низкая",
    src: "Передача/акт — оценка; презерватив ~50% (ограниченные данные). Лечится одним курсом (метронидазол). Точность: низкая." },
];

const ACC_COLOR = { "высокая": "#38d9a9", "низкая-средняя": "#ffc300", "низкая": "#ff7b00" };

const pctVal = (x) => {
  if (x <= 0) return "0%";
  if (x >= 10) return Math.round(x) + "%";
  if (x >= 1) return x.toFixed(0) + "%";
  if (x >= 0.1) return x.toFixed(1).replace(".", ",") + "%";
  const digits = Math.max(2, Math.ceil(-Math.log10(x)) + 1);
  return parseFloat(x.toFixed(digits)).toString().replace(".", ",") + "%";
};
const pctAct = (v) => {
  const x = v * 100;
  if (x <= 0) return "0%";
  if (x >= 10) return Math.round(x) + "%";
  if (x >= 1) return x.toFixed(0) + "%";
  const digits = Math.max(2, Math.ceil(-Math.log10(x)) + 1);
  return parseFloat(x.toFixed(digits)).toString().replace(".", ",") + "%";
};

function annualSurvival(s, phi, N, actsPerYear, veMul = 1) {
  const betaEff = s.beta * (1 - phi * s.e) * veMul;
  const k = N > 0 ? actsPerYear / N : 0;
  const transmit = 1 - Math.pow(1 - betaEff, Math.max(k, 0));
  return Math.pow(1 - s.p * transmit, N);
}

/* ---- hoisted components (stable identity → sliders stay grabbed while dragging) ---- */

function Slider({ label, value, set, min, max, step, valueText, hint }) {
  return (
    <div style={{ flex: 1, minWidth: 190 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ color: C.mid, fontSize: 13, letterSpacing: 0.2 }}>{label}</span>
        <span style={{ color: C.accent, fontSize: 17, fontWeight: 600, fontFamily: "ui-monospace, SFMono-Regular, monospace", fontVariantNumeric: "tabular-nums" }}>
          {valueText}
        </span>
      </div>
      <input className="rng" type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => set(parseFloat(e.target.value))} />
      {hint && <div style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, label, hidden, showAny }) {
  if (!active || !payload?.length) return null;
  const yrs = Math.floor(label / 12), mos = label % 12;
  const rows = payload
    .filter((e) => (e.dataKey === "any" ? showAny : !hidden[e.dataKey]))
    .sort((a, b) => b.value - a.value);
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>
      <div style={{ color: C.mid, marginBottom: 6, fontVariantNumeric: "tabular-nums" }}>
        {yrs > 0 ? `${yrs} г ` : ""}{mos} мес
      </div>
      {rows.map((e) => {
        const s = STIS.find((x) => x.key === e.dataKey);
        return (
          <div key={e.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 18, color: C.hi, fontVariantNumeric: "tabular-nums" }}>
            <span><span style={{ color: e.stroke }}>●</span> {s ? s.label : "Хотя бы одна"}</span>
            <span>{pctVal(e.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Step({ n, title, gloss, formula, result, rc }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: n === 1 ? "none" : `1px solid ${C.border}` }}>
      <div style={{ flex: "0 0 24px", height: 24, borderRadius: "50%", background: C.panel2, border: `1px solid ${C.border}`, color: C.mid, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.hi, fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{title}</div>
        {gloss && <div style={{ color: C.dim, fontSize: 12, marginBottom: 6, lineHeight: 1.5 }}>{gloss}</div>}
        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 13, color: C.mid, fontVariantNumeric: "tabular-nums", wordBreak: "break-word" }}>
          {formula}{result != null && <> = <span style={{ color: rc || C.accent, fontWeight: 700 }}>{result}</span></>}
        </div>
      </div>
    </div>
  );
}

function Breakdown({ s, phi, partners, actsPerYear, condom, years, veMul = 1 }) {
  const A = actsPerYear, N = partners;
  const betaEff = s.beta * (1 - phi * s.e) * veMul;
  const vaxOn = veMul < 1, vePct = Math.round((1 - veMul) * 100);
  const k = N > 0 ? A / N : 0;
  const kR = Math.max(1, Math.round(k));
  const transmit = 1 - Math.pow(1 - betaEff, k);
  const perPartner = s.p * transmit;
  const annual = 1 - Math.pow(1 - perPartner, N);
  const horizon = 1 - Math.pow(1 - annual, years);
  const fmtP = (v) => pctVal(v * 100);
  const yWord = years === 1 ? "год" : years < 5 ? "года" : "лет";
  const calc = (phiX) => {
    const be = s.beta * (1 - phiX * s.e) * veMul;
    const tr = 1 - Math.pow(1 - be, k);
    const an = 1 - Math.pow(1 - s.p * tr, N);
    const ho = 1 - Math.pow(1 - an, years);
    return { be, ho };
  };
  const no = calc(0), yes = calc(1);
  const cutAct = no.be > 0 ? Math.round((1 - yes.be / no.be) * 100) : 0;
  const cutHor = no.ho > 0 ? Math.round((1 - yes.ho / no.ho) * 100) : 0;
  const bars = [
    { lab: "За 1 акт (если партнёр заражён)", a: no.be, b: yes.be, fmt: pctAct },
    { lab: `За ${years} ${yWord}`, a: no.ho, b: yes.ho, fmt: fmtP },
  ];

  if (partners <= 0) {
    return (
      <div style={{ color: C.mid, fontSize: 13, lineHeight: 1.6, padding: "8px 0" }}>
        При <b style={{ color: C.hi }}>0 новых партнёрах в год</b> риск приобрести новую инфекцию ≈ <b style={{ color: C.hi }}>0</b> — новых источников нет. Постоянный партнёр (если включён) считается проверенным и в кривую не входит. Добавь новых партнёров ползунком, чтобы увидеть разбор.
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.mid, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "#ff7b73" }} />без презерватива</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "#4dd4ac" }} />с презервативом (на каждом акте)</span>
        </div>
        {bars.map((row, i) => {
          const max = Math.max(row.a, row.b, 1e-9);
          return (
            <div key={i} style={{ marginBottom: 13 }}>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>{row.lab}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <div style={{ flex: 1, height: 16, background: C.panel2, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(2, (row.a / max) * 100)}%`, height: "100%", background: "#ff7b73" }} />
                </div>
                <span className="num" style={{ width: 56, textAlign: "right", fontSize: 12.5, color: C.hi, fontWeight: 600 }}>{row.fmt(row.a)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 16, background: C.panel2, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(2, (row.b / max) * 100)}%`, height: "100%", background: "#4dd4ac" }} />
                </div>
                <span className="num" style={{ width: 56, textAlign: "right", fontSize: 12.5, color: C.hi, fontWeight: 600 }}>{row.fmt(row.b)}</span>
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.55, marginTop: 6 }}>
          {cutAct - cutHor >= 4 ? (
            <>На <b style={{ color: C.hi }}>один акт</b> презерватив убирает <b style={{ color: "#4dd4ac" }}>{cutAct}%</b> риска. Но за <b style={{ color: C.hi }}>{years} {yWord}</b> с повторами — уже только <b style={{ color: "#ff7b73" }}>{cutHor}%</b>: при многих контактах с одним партнёром риск «насыщается», и относительная защита падает.</>
          ) : (
            <>И на <b style={{ color: C.hi }}>один акт</b>, и за <b style={{ color: C.hi }}>{years} {yWord}</b> презерватив убирает примерно одинаково (~<b style={{ color: "#4dd4ac" }}>{cutHor}%</b>) — поэтому зелёные полосы равны. У редко передающихся инфекций (как эта) риск даже за годы не «насыщается», так что относительная защита со временем не падает.</>
          )}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0 12px" }} />
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>Пошагово при текущем ползунке (презерватив {condom}%):</div>
      <Step n={1} title="Партнёр вообще заразен?"
        gloss="Вероятность, что случайный новый партнёр уже носит эту инфекцию (распространённость в популяции)."
        formula="распространённость p" result={fmtP(s.p)} />
      <Step n={2} title="Риск за один акт, если партнёр заразен"
        gloss={`${phi > 0 ? `Базовый риск за акт, срезанный презервативом (он на ${condom}% актов убирает ${Math.round(s.e * 100)}% риска).` : "Презерватив выключен — риск за акт не уменьшается."}${vaxOn ? ` Прививка убирает ещё ~${vePct}% (оценка).` : ""}`}
        formula={`${pctAct(s.beta)}${phi > 0 ? ` × (1 − ${condom}% × ${Math.round(s.e * 100)}%)` : ""}${vaxOn ? ` × (1 − ${vePct}%)` : ""}`}
        result={pctAct(betaEff)} />
      <Step n={3} title="Сколько актов с одним партнёром"
        gloss={`${Math.round(A)} актов в год делим на ${N} ${N === 1 ? "партнёра" : "партнёров"}.`}
        formula={`${Math.round(A)} ÷ ${N}`} result={`≈ ${kR} актов`} />
      <Step n={4} title="За эти акты — с заражённым партнёром"
        gloss="Берём шанс НЕ заразиться за один акт и повторяем его столько раз. Так риск накапливается за много контактов."
        formula={`1 − (1 − ${pctAct(betaEff)})^${kR}`} result={fmtP(transmit)} />
      <Step n={5} title="Риск получить от одного партнёра"
        gloss="Умножаем на шанс, что он вообще заразен (шаг 1)."
        formula={`${fmtP(s.p)} × ${fmtP(transmit)}`} result={fmtP(perPartner)} />
      <Step n={6} title="За всех партнёров за год"
        gloss={`Повторяем для каждого из ${N} ${N === 1 ? "партнёра" : "партнёров"}: шанс не заразиться ни от кого, и обратное к нему.`}
        formula={`1 − (1 − ${fmtP(perPartner)})^${N}`} result={fmtP(annual)} rc={s.color} />
      <div style={{ marginTop: 12, padding: "12px 14px", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, color: C.mid, lineHeight: 1.55 }}>
        За <b style={{ color: C.hi }}>{years}</b> {yWord} риск копится так же:&nbsp;
        <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>1 − (1 − {fmtP(annual)})^{years}</span> = <b style={{ color: s.color }}>{fmtP(horizon)}</b>.
        Это и есть высота кривой «{s.label.toLowerCase()}» на графике.
      </div>
    </div>
  );
}

const PRESETS = [
  { key: "celibate", label: "Целибат", primary: false, newPerYear: 0, dur: 0, perWeek: 0, condom: 0 },
  { key: "mono", label: "Моногамия", primary: true, newPerYear: 0, dur: 0, perWeek: 3, condom: 0 },
  { key: "serial", label: "Серийная моногамия", primary: false, newPerYear: 1, dur: 14, perWeek: 3, condom: 30 },
  { key: "monogamish", label: "Monogamish", primary: true, newPerYear: 1, dur: 0.25, perWeek: 3, condom: 40 },
  { key: "open", label: "Открытые / свинг", primary: true, newPerYear: 5, dur: 1, perWeek: 2, condom: 70 },
  { key: "poly", label: "Полиамория", primary: false, newPerYear: 1, dur: 36, perWeek: 2, condom: 50 },
  { key: "ons", label: "ONS / хукапы", primary: false, newPerYear: 12, dur: 0.25, perWeek: 1.5, condom: 80 },
  { key: "core", label: "Core group", primary: false, newPerYear: 30, dur: 0.2, perWeek: 1, condom: 60 },
];

const fmtRate = (v) => {
  if (v <= 0) return "нет";
  if (v < 1) {
    const inv = Math.round(1 / v);
    const w = inv === 1 ? "год" : inv >= 2 && inv <= 4 ? "года" : "лет";
    return `≈ раз в ${inv} ${w}`;
  }
  return `${(Math.round(v * 10) / 10).toString().replace(".", ",")}/год`;
};

const fmtDur = (m) => {
  if (m <= 0) return "разовые";
  if (m < 1) return `≈ ${Math.round(m * 4.33)} нед`;
  if (m < 12) return `${Math.round(m)} мес`;
  return `${(Math.round((m / 12) * 10) / 10).toString().replace(".", ",")} лет`;
};

function buildPartners(primary, newPerYear, durM, horizonM) {
  const list = [];
  if (primary) list.push({ start: 0, end: horizonM, primary: true });
  if (newPerYear > 0) {
    const interval = 12 / newPerYear;
    let i = 0, t = 0;
    while (t <= horizonM && list.length < 2000) {
      const h = Math.abs(Math.sin((i + 1) * 12.9898) * 43758.5453) % 1;
      const start = Math.max(0, t + (h - 0.5) * interval * 0.5);
      const d = Math.max(0.25, durM * (0.7 + h * 0.6));
      if (start < horizonM) list.push({ start, end: Math.min(horizonM, start + d), primary: false });
      i++; t += interval;
    }
  }
  return list;
}

function packLanes(list) {
  const sorted = [...list].sort((a, b) => (a.primary === b.primary ? a.start - b.start : a.primary ? -1 : 1));
  const laneEnd = [];
  sorted.forEach((p) => {
    let lane = -1;
    for (let i = 0; i < laneEnd.length; i++) { if (laneEnd[i] <= p.start + 0.01) { lane = i; break; } }
    if (lane === -1) { lane = laneEnd.length; laneEnd.push(p.end); } else laneEnd[lane] = p.end;
    p.lane = lane;
  });
  return { list: sorted, lanes: Math.max(1, laneEnd.length) };
}

function Timeline({ packed, horizonM, years }) {
  const { list, lanes } = packed;
  const maxH = 240;
  const gap = lanes > 12 ? 2 : 4;
  const rowH = Math.max(4, Math.min(15, Math.floor(maxH / Math.max(1, lanes)) - gap));
  const maxRender = 400;
  const step = list.length > maxRender ? Math.ceil(list.length / maxRender) : 1;
  const shown = step > 1 ? list.filter((p, i) => p.primary || i % step === 0) : list;
  const tickStepY = years <= 12 ? 1 : years <= 30 ? 5 : 10;
  const yticks = [];
  for (let y = 0; y <= years; y += tickStepY) yticks.push(y);
  return (
    <div>
      <div style={{ position: "relative", height: lanes * (rowH + gap) }}>
        {Array.from({ length: lanes }).map((_, i) => (
          <div key={`l${i}`} style={{ position: "absolute", left: 0, right: 0, top: i * (rowH + gap), height: rowH, background: C.panel2, borderRadius: 3 }} />
        ))}
        {shown.map((p, idx) => (
          <div key={idx} title={p.primary ? "постоянный партнёр" : `связь ~${fmtDur(p.end - p.start)}`}
            style={{ position: "absolute", top: p.lane * (rowH + gap), height: rowH, left: `${(p.start / horizonM) * 100}%`, width: `${Math.max(0.6, ((p.end - p.start) / horizonM) * 100)}%`, background: p.primary ? C.accent : "#2ec4b6", borderRadius: 3, opacity: p.primary ? 0.92 : 0.85 }} />
        ))}
      </div>
      <div style={{ position: "relative", height: 16, marginTop: 4 }}>
        {yticks.map((y) => (
          <span key={y} style={{ position: "absolute", left: `${(y / years) * 100}%`, fontSize: 11, color: C.dim, transform: y === 0 ? "none" : "translateX(-50%)" }}>{y === 0 ? "0" : `${y}г`}</span>
        ))}
      </div>
      {step > 1 && <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>показана часть связей для наглядности (статистика — по всем)</div>}
    </div>
  );
}

export default function App() {
  const [partners, setPartners] = useState(3);
  const [perWeek, setPerWeek] = useState(2);
  const [condom, setCondom] = useState(0);
  const [years, setYears] = useState(10);
  const [yMax, setYMax] = useState(100);
  const [hidden, setHidden] = useState({});
  const [showAny, setShowAny] = useState(false);
  const [selected, setSelected] = useState("chl");
  const [dur, setDur] = useState(6);
  const [primary, setPrimary] = useState(false);
  const [vaxHpv, setVaxHpv] = useState(false);
  const [vaxHbv, setVaxHbv] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const clearPreset = () => setActivePreset(null);
  const applyPreset = (pr) => {
    setPrimary(pr.primary); setPartners(pr.newPerYear); setDur(pr.dur);
    setPerWeek(pr.perWeek); setCondom(pr.condom); setActivePreset(pr.key);
  };

  const phi = condom / 100;
  const actsPerYear = perWeek * 52;
  const horizonM = years * 12;

  const packed = useMemo(() => packLanes(buildPartners(primary, partners, dur, horizonM)), [primary, partners, dur, horizonM]);
  const activeMonths = packed.list.reduce((a, p) => a + (Math.min(p.end, horizonM) - Math.max(p.start, 0)), 0);
  const avgConc = horizonM > 0 ? activeMonths / horizonM : 0;

  const survivals = useMemo(() => {
    const m = {};
    STIS.forEach((s) => {
      const vaccinated = (s.key === "hpv" && vaxHpv) || (s.key === "hbv" && vaxHbv);
      const veMul = s.vax && vaccinated ? (1 - s.vax.ve) : 1;
      m[s.key] = annualSurvival(s, phi, partners, actsPerYear, veMul);
    });
    return m;
  }, [phi, partners, actsPerYear, vaxHpv, vaxHbv]);

  const riskAt = (key, t) => (1 - Math.pow(survivals[key], t / 12)) * 100;

  const anyS = useMemo(() => {
    return STIS.reduce((acc, s) => (hidden[s.key] ? acc : acc * survivals[s.key]), 1);
  }, [survivals, hidden]);

  const chartData = useMemo(() => {
    const step = Math.max(1, Math.ceil(horizonM / 180));
    const pts = [];
    for (let t = 0; t <= horizonM; t += step) {
      const row = { t };
      STIS.forEach((s) => { row[s.key] = riskAt(s.key, t); });
      row.any = (1 - Math.pow(anyS, t / 12)) * 100;
      pts.push(row);
    }
    if (pts.length && pts[pts.length - 1].t !== horizonM) {
      const row = { t: horizonM };
      STIS.forEach((s) => { row[s.key] = riskAt(s.key, horizonM); });
      row.any = (1 - Math.pow(anyS, horizonM / 12)) * 100;
      pts.push(row);
    }
    return pts;
  }, [survivals, anyS, horizonM]);

  const tickStepY = years <= 12 ? 1 : years <= 30 ? 5 : 10;
  const ticks = [];
  for (let y = 0; y <= years; y += tickStepY) ticks.push(y * 12);

  const top = [...STIS].filter((s) => !hidden[s.key])
    .sort((a, b) => (1 - survivals[a.key]) - (1 - survivals[b.key])).reverse()[0];

  const toggle = (k) => setHidden((h) => ({ ...h, [k]: !h[k] }));

  const selSti = STIS.find((x) => x.key === selected);
  const selVeMul = selSti?.vax && ((selected === "hpv" && vaxHpv) || (selected === "hbv" && vaxHbv)) ? (1 - selSti.vax.ve) : 1;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.hi, fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: "28px 18px 48px" }}>
      <style>{`
        .rng { -webkit-appearance:none; appearance:none; width:100%; height:4px; border-radius:4px; background:${C.border}; outline:none; }
        .rng::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:18px; height:18px; border-radius:50%; background:${C.accent}; cursor:grab; border:3px solid ${C.bg}; box-shadow:0 0 0 1px ${C.accent}; }
        .rng::-webkit-slider-thumb:active { cursor:grabbing; }
        .rng::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:${C.accent}; cursor:grab; border:3px solid ${C.bg}; }
        summary { cursor:pointer; }
        @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
        .tbl-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
        table.inf { border-collapse:collapse; width:100%; min-width:760px; font-size:13px; }
        table.inf th, table.inf td { text-align:left; padding:10px 12px; border-bottom:1px solid ${C.border}; vertical-align:middle; }
        table.inf th { color:${C.dim}; font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }
        .num { font-variant-numeric:tabular-nums; }
        .chk { width:17px; height:17px; cursor:pointer; }
        .src { position:relative; display:inline-flex; align-items:center; gap:7px; cursor:help; }
        .src .ic { width:16px; height:16px; border-radius:50%; border:1px solid ${C.dim}; color:${C.dim}; font-size:11px; display:inline-flex; align-items:center; justify-content:center; }
        .src .box { display:none; position:absolute; right:0; bottom:140%; width:280px; background:${C.panel2}; border:1px solid ${C.border}; border-radius:8px; padding:10px 12px; font-size:12px; line-height:1.5; color:${C.mid}; z-index:20; box-shadow:0 8px 24px rgba(0,0,0,.4); text-transform:none; letter-spacing:0; font-weight:400; }
        .src:hover .box, .src:focus-within .box { display:block; }
        .pill { background:${C.panel2}; border:1px solid ${C.border}; color:${C.mid}; padding:6px 12px; border-radius:999px; font-size:12px; cursor:pointer; }
        .pill.on { background:${C.accent}; color:${C.bg}; border-color:${C.accent}; font-weight:600; }
      `}</style>

      <div style={{ maxWidth: 940, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: 0 }}>Риск ЗППП во времени</h1>
            <span style={{ fontSize: 10, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 4, padding: "3px 7px", letterSpacing: 0.5, textTransform: "uppercase" }}>иллюстративная модель</span>
          </div>
          <p style={{ color: C.mid, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            Кумулятивная вероятность заразиться хотя бы раз. Тяни ползунки — кривые пересчитываются. Сравнение и форма важнее точной цифры.
          </p>
        </div>

        {/* Warning */}
        <div style={{ background: "#241a0e", border: `1px solid ${C.accent}`, borderRadius: 12, padding: "14px 16px", marginBottom: 18, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ flex: "0 0 24px", width: 24, height: 24, borderRadius: "50%", background: C.accent, color: C.bg, fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>!</span>
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.55 }}>
            <b style={{ color: C.hi }}>Это любительский калькулятор, а не медицинский инструмент.</b> Цифры — грубые иллюстративные оценки (надёжные данные есть только по ВИЧ) и не предсказывают твой личный риск. Не принимай решения о тестировании, лечении или профилактике, опираясь на него, — консультируйся с врачом (венеролог/инфекционист) или в профильной службе. Модель показывает логику, а не заменяет специалиста.
          </div>
        </div>

        {/* Behavior controls */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>Пресет поведения</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {PRESETS.map((pr) => (
              <button key={pr.key} onClick={() => applyPreset(pr)} className={`pill ${activePreset === pr.key ? "on" : ""}`}>{pr.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
            <Slider label="Новых партнёров в год" value={partners} set={(v) => { setPartners(Math.round(v * 10) / 10); clearPreset(); }} min={0} max={30} step={0.1}
              valueText={fmtRate(partners)} hint="темп появления новых партнёров" />
            <Slider label="Длительность связи" value={dur} set={(v) => { setDur(v); clearPreset(); }} min={0} max={120} step={1}
              valueText={fmtDur(dur)} hint="как долго длится связь с новым партнёром" />
            <Slider label="Секс в неделю" value={perWeek} set={(v) => { setPerWeek(Math.round(v * 10) / 10); clearPreset(); }} min={0.1} max={14} step={0.1}
              valueText={`${perWeek.toFixed(1).replace(".", ",")}×`} hint={`≈ ${Math.round(actsPerYear)} актов в год`} />
            <Slider label="Презерватив" value={condom} set={(v) => { setCondom(v); clearPreset(); }} min={0} max={100} step={1}
              valueText={`${condom}%`} hint="доля актов с презервативом" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
            <button onClick={() => { setPrimary((v) => !v); clearPreset(); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: primary ? `${C.accent}22` : "transparent", border: `1px solid ${primary ? C.accent : C.border}`, color: primary ? C.hi : C.mid, padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${primary ? C.accent : C.dim}`, background: primary ? C.accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.bg, fontSize: 11, fontWeight: 700 }}>{primary ? "✓" : ""}</span>
              Постоянный партнёр
            </button>
            <span style={{ color: C.dim, fontSize: 12 }}>добавляет одну долгую связь на весь период (считается проверенным — в риск не входит)</span>
          </div>

          <div style={{ borderTop: `1px dashed ${C.border}`, margin: "18px 0 0" }} />
          <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.6, margin: "14px 0 10px" }}>Защита и иммунитет</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {[{ k: "hpv", on: vaxHpv, set: setVaxHpv, lab: "Привит от ВПЧ" }, { k: "hbv", on: vaxHbv, set: setVaxHbv, lab: "Привит от гепатита B" }].map((v) => {
              const st = STIS.find((x) => x.key === v.k);
              return (
                <button key={v.k} onClick={() => v.set((x) => !x)} title={st.vax.note}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, background: v.on ? `${C.accent}22` : "transparent", border: `1px solid ${v.on ? C.accent : C.border}`, color: v.on ? C.hi : C.mid, padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${v.on ? C.accent : C.dim}`, background: v.on ? C.accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", color: C.bg, fontSize: 11, fontWeight: 700 }}>{v.on ? "✓" : ""}</span>
                  {v.lab}
                </button>
              );
            })}
            <span style={{ color: C.dim, fontSize: 12 }}>режет риск ВПЧ / гепатита B (оценка — вакцина не 100% и работает до контакта)</span>
          </div>
        </div>
        {/* Partnership structure */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 18px 14px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Структура партнёрств во времени</h2>
            <div style={{ fontSize: 12, color: C.mid }}>
              одновременно: в среднем <b style={{ color: C.hi }}>{avgConc.toFixed(1).replace(".", ",")}</b> · пик <b style={{ color: C.hi }}>{packed.lanes}</b> · всего за {years} {years < 5 ? "года" : "лет"}: <b style={{ color: C.hi }}>{packed.list.length}</b>
            </div>
          </div>
          <p style={{ color: C.dim, fontSize: 12, margin: "0 0 14px", lineHeight: 1.5 }}>
            Каждая полоса — связь от начала до конца. Наложение полос по вертикали = одновременные партнёры (concurrency). <span style={{ color: C.accent }}>● оранжевый</span> — постоянный партнёр, <span style={{ color: "#2ec4b6" }}>● бирюзовый</span> — новые.
          </p>
          {packed.list.length === 0 ? (
            <div style={{ color: C.mid, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Нет партнёров — включи постоянного или добавь новых.</div>
          ) : (
            <Timeline packed={packed} horizonM={horizonM} years={years} />
          )}
          <div style={{ marginTop: 12, padding: "10px 14px", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
            На <b style={{ color: C.mid }}>кривую риска</b> сейчас влияют число новых партнёров, частота и презерватив. Длительность и одновременность показывают <b style={{ color: C.mid }}>структуру</b> сети — эпидемиологически concurrency важна, но её строгий учёт требует сетевой симуляции и в формулу здесь не заложен.
          </div>
        </div>

        {/* Chart panel */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 16px 12px", marginBottom: 14 }}>
          {/* axis controls */}
          <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 16 }}>
            <Slider label="Горизонт времени" value={years} set={setYears} min={1} max={50} step={1}
              valueText={`${years} ${years === 1 ? "год" : years < 5 ? "года" : "лет"}`} hint="ось X — месяцы и годы" />
            <Slider label="Масштаб шкалы вероятности" value={yMax} set={setYMax} min={1} max={100} step={1}
              valueText={`до ${yMax}%`} hint="уменьши, чтобы разглядеть редкие инфекции" />
          </div>

          {/* mini legend (read-only) */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
            {STIS.filter((s) => !hidden[s.key]).map((s) => (
              <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mid }}>
                <span style={{ width: 14, height: 0, borderTop: `3px ${s.grounded ? "solid" : "dashed"} ${s.color}`, display: "inline-block" }} />
                {s.label}
              </span>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="t" type="number" domain={[0, horizonM]} ticks={ticks} interval={0}
                stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }}
                tickFormatter={(t) => (t === 0 ? "0" : `${t / 12}г`)} />
              <YAxis domain={[0, yMax]} allowDataOverflow stroke={C.dim} tick={{ fontSize: 12, fill: C.dim }}
                tickFormatter={(v) => `${v}%`} width={46} />
              <Tooltip content={(p) => <ChartTooltip {...p} hidden={hidden} showAny={showAny} />} />
              {STIS.map((s) => (hidden[s.key] ? null : (
                <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2.2}
                  dot={false} strokeDasharray={s.grounded ? "0" : "6 4"} isAnimationActive={false} />
              )))}
              {showAny && (
                <Line type="monotone" dataKey="any" stroke={C.hi} strokeWidth={1.6} strokeDasharray="1 3" dot={false} isAnimationActive={false} />
              )}
            </LineChart>
          </ResponsiveContainer>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            <div style={{ color: C.mid, fontSize: 13 }}>
              {top ? <>За {years} {years < 5 ? "года" : "лет"} выше всего риск <span style={{ color: top.color, fontWeight: 600 }}>{top.label.toLowerCase()}</span> — около <span style={{ color: C.hi, fontWeight: 600 }}>{pctVal(riskAt(top.key, horizonM))}</span>.</> : "Включи хотя бы одну инфекцию в таблице ниже."}
            </div>
            <button className={`pill ${showAny ? "on" : ""}`} onClick={() => setShowAny((v) => !v)}>хотя бы одна из включённых</button>
          </div>
        </div>

        {/* Infections table */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "6px 6px", marginBottom: 14 }}>
          <div className="tbl-wrap">
            <table className="inf">
              <thead>
                <tr>
                  <th style={{ width: 34 }}></th>
                  <th>Инфекция</th>
                  <th>Риск к {years} {years < 5 ? "г." : "годам"}</th>
                  <th>На акт: без → с презервативом</th>
                  <th>Лечение</th>
                  <th>Последствия</th>
                  <th style={{ width: 60, textAlign: "right" }}>Источник</th>
                </tr>
              </thead>
              <tbody>
                {STIS.map((s) => (
                  <tr key={s.key} style={{ borderLeft: `3px solid ${SEV[s.sev]}`, opacity: hidden[s.key] ? 0.45 : 1, background: selected === s.key ? "#ffffff0d" : "transparent" }}>
                    <td><input className="chk" type="checkbox" checked={!hidden[s.key]} onChange={() => toggle(s.key)} style={{ accentColor: s.color }} /></td>
                    <td onClick={() => setSelected(s.key)} title="показать разбор расчёта" style={{ whiteSpace: "nowrap", cursor: "pointer" }}>
                      <span style={{ color: s.color, marginRight: 7 }}>{s.grounded ? "●" : "◌"}</span>{s.label}
                      {((s.key === "hpv" && vaxHpv) || (s.key === "hbv" && vaxHbv)) && (
                        <span title={s.vax.note} style={{ marginLeft: 8, fontSize: 11, color: "#38d9a9", background: "#38d9a922", border: "1px solid #38d9a955", padding: "1px 7px", borderRadius: 6 }}>привит</span>
                      )}
                    </td>
                    <td className="num" style={{ color: C.hi, fontWeight: 600 }}>{pctVal(riskAt(s.key, horizonM))}</td>
                    <td className="num" style={{ color: C.mid, whiteSpace: "nowrap" }}>
                      {pctAct(s.beta)} <span style={{ color: C.dim }}>→</span> {pctAct(s.beta * (1 - s.e))}
                    </td>
                    <td>
                      <span style={{ background: `${SEV[s.sev]}22`, color: SEV[s.sev], padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 500, display: "inline-block" }}>{s.treat}</span>
                    </td>
                    <td style={{ color: C.mid, fontSize: 12.5 }}>{s.cons}</td>
                    <td style={{ textAlign: "right" }}>
                      <span className="src" tabIndex={0}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ACC_COLOR[s.acc] }} title={`точность: ${s.acc}`} />
                        <span className="ic">i</span>
                        <span className="box">
                          <b style={{ color: C.hi }}>Точность: {s.acc}</b><br />{s.src}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "10px 14px 8px", fontSize: 11, color: C.dim }}>
            <span><span style={{ color: C.hi }}>●</span> сплошная = данные надёжны &nbsp; <span style={{ color: C.hi }}>◌</span> пунктир = оценка</span>
            <span>цветная полоска слева = уровень опасности:
              <span style={{ color: SEV[5] }}> критично</span> ·
              <span style={{ color: SEV[4] }}> высоко</span> ·
              <span style={{ color: SEV[3] }}> средне</span> ·
              <span style={{ color: SEV[2] }}> ниже</span> ·
              <span style={{ color: SEV[1] }}> легко</span>
            </span>
            <span>наведи на <span className="ic" style={{ display: "inline-flex", width: 14, height: 14, fontSize: 10 }}>i</span> — источник и точность</span>
          </div>
        </div>

        {/* Breakdown */}
        <details open style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <summary style={{ color: C.hi, fontSize: 15, fontWeight: 600 }}>Разбор расчёта — откуда берётся цифра</summary>
          <p style={{ color: C.mid, fontSize: 13, lineHeight: 1.6, margin: "12px 0 12px" }}>
            Считаем шаг за шагом для одной инфекции при текущих ползунках. Двигай ползунки — числа в разборе меняются. Выбери инфекцию:
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {STIS.map((s) => (
              <button key={s.key} onClick={() => setSelected(s.key)}
                style={{ border: `1px solid ${selected === s.key ? s.color : C.border}`, background: selected === s.key ? `${s.color}22` : "transparent", color: selected === s.key ? C.hi : C.mid, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: s.color }}>●</span>{s.label}
              </button>
            ))}
          </div>
          <Breakdown s={selSti} phi={phi} partners={partners} actsPerYear={actsPerYear} condom={condom} years={years} veMul={selVeMul} />
        </details>

        {/* Methodology */}
        <details style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <summary style={{ color: C.hi, fontSize: 15, fontWeight: 600 }}>Допущения и как это считается</summary>
          <div style={{ color: C.mid, fontSize: 13, lineHeight: 1.65, marginTop: 14 }}>
            <p style={{ marginTop: 0 }}>
              Только для <b style={{ color: C.hi }}>ВИЧ</b> вероятность передачи на акт и эффективность презерватива взяты из исследований (сплошная линия). Для остальных надёжных per-act чисел нет — взяты правдоподобные средние (пунктир). Поэтому это сравнение и форма кривых, а не точный прогноз.
            </p>
            <p>
              <b style={{ color: C.hi }}>Распространённость (p)</b> — оценка для общей популяции молодых взрослых в Европе. В группах высокого риска и при анальном сексе цифры другие (рецептивный анальный по ВИЧ ~в 17 раз опаснее вагинального). <b style={{ color: C.hi }}>Гепатит B</b> сильно зависит от прививки; <b style={{ color: C.hi }}>гепатит C</b> передаётся в основном через кровь, поэтому его сексуальная кривая здесь — нижняя грубая оценка.
            </p>
            <p>
              <b style={{ color: C.hi }}>Прививки.</b> «Привит от ВПЧ / гепатита B» — множитель, снижающий передачу за акт (ВПЧ ~85%, HBV ~95%). Это оценка эффекта: вакцина покрывает не все типы и наиболее эффективна до начала половой жизни. На остальные инфекции не влияет.
            </p>
            <p style={{ marginBottom: 0 }}>
              <b style={{ color: C.hi }}>Формула:</b> на акт β_eff = β·(1 − доля_презерватива·e); с одним заражённым партнёром за k актов риск = 1 − (1 − β_eff)^k; умножается на распространённость, складывается по числу партнёров за год и разворачивается во времени (постоянный риск). «Хотя бы одна» — в предположении независимости инфекций (грубая верхняя оценка).
            </p>
          </div>
        </details>

        <p style={{ color: C.dim, fontSize: 12, lineHeight: 1.6, textAlign: "center", marginTop: 0 }}>
          Образовательная модель, не медицинский прогноз и не основание для решений о тестировании.
          Заметь: даже 100% презерватив слабо влияет на кривую ВПЧ — против него работает прививка, а не барьер.
        </p>
      </div>
    </div>
  );
}
