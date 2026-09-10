import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer, Legend,
} from "recharts";

// ---------- tokens ----------
const T = {
  paper: "#FAFAF8",
  ink: "#14213D",
  muted: "#5B6B7B",
  rule: "#D6DCE3",
  field: "#FFFFFF",
  plasma: "#0E7C7B",
  plasmaPlan: "#5FB3B1",
  plasmaFull: "#9CB7C4",
  deficit: "#8B4A6B",
  salt: "#B8860B",
  saltIn: "#D9B45C",
  warn: "#B03A2E",
  band: "rgba(14,124,123,0.08)",
};
const NA_MG = 22.99;

// ---------- model (Kurtz-Nguyen) ----------
function simulate(p) {
  const tbw0 = p.mass * (p.tbwPct / 100);
  const durMin = Math.max(1, Math.round(p.duration * 60));
  const step = Math.max(1, Math.ceil(durMin / 240));
  const naInPerMin = p.naMgPerHr / NA_MG / 60; // mmol/min
  const rows = [];
  let sweat = 0, intake = 0, prev = 0;
  const kn = (S, I, naIn) => {
    const tbw = tbw0 - S + I;
    const dE = naIn - (p.sweatNa + p.sweatK) * S;
    return ((p.na0 + 23.8) * tbw0 + 1.03 * dE) / tbw - 23.8;
  };
  const marks = [];
  for (let m = 0; m < durMin; m += step) marks.push(m);
  marks.push(durMin);
  for (const m of marks) {
    // integrate minute by minute from the previous mark, with a linear onset ramp
    for (let k = prev + 1; k <= m; k++) {
      const ramp = p.rampMin > 0 ? Math.min(1, k / p.rampMin) : 1;
      sweat += (p.sweatRate / 60) * ramp;
      intake += p.intakeRate / 60;
    }
    prev = m;
    const naLossMg = p.sweatNa * sweat * NA_MG;
    rows.push({
      t: +(m / 60).toFixed(2),
      deficitPct: ((sweat - intake) / p.mass) * 100,
      naNone: kn(sweat, intake, 0),
      naPlan: kn(sweat, intake, naInPerMin * m),
      naFull: kn(sweat, intake, p.sweatNa * sweat),
      naLossMg,
      naInMg: naInPerMin * m * NA_MG,
    });
  }
  return { rows, tbw0, sweatTotal: sweat, intakeTotal: intake };
}

function derive(p) {
  // effective loss accounting for a linear onset ramp
  const effHours = p.duration - (Math.min(p.rampMin, p.duration * 60) / 60) * 0.5;
  const loss = p.sweatRate * effHours;
  const accDef = (p.accDefPct / 100) * p.mass;
  const required = Math.max(0, Math.min(1, (loss - accDef) / loss));
  const achievable = Math.min(1, (p.maxIntake * p.duration) / loss);
  const requiredRate = (required * loss) / p.duration;
  const intakeRate = p.auto ? Math.min(requiredRate, p.maxIntake) : p.plannedIntake;
  const fOp = Math.min(1, (intakeRate * p.duration) / loss);
  const fStar = 1 - (1.03 * (p.sweatNa + p.sweatK)) / (p.na0 + 23.8);
  const sim = simulate({ ...p, intakeRate });
  const last = sim.rows[sim.rows.length - 1];
  const tbwPost = sim.tbw0 - sim.sweatTotal + sim.intakeTotal;
  const holdMmol = Math.max(
    0,
    ((tbwPost - sim.tbw0) * (p.na0 + 23.8)) / 1.03 + (p.sweatNa + p.sweatK) * sim.sweatTotal
  );
  const holdMg = holdMmol * NA_MG;
  return {
    loss, required, achievable, requiredRate, intakeRate, fOp, fStar,
    fluidLimited: achievable < required - 1e-6,
    endDeficit: last.deficitPct, endNaNone: last.naNone, endNaPlan: last.naPlan,
    endNaFull: last.naFull, naLossTotalMg: last.naLossMg,
    holdMgPerHr: holdMg / p.duration,
    holdMgPer100: sim.intakeTotal > 0 ? holdMg / (sim.intakeTotal * 10) : 0,
    rows: sim.rows,
  };
}

// ---------- presets ----------
const PRESETS = {
  "My chamber test": { mass: 87, tbwPct: 60, na0: 140, sweatRate: 2.41, sweatNa: 53.7, sweatK: 3.5, rampMin: 0, duration: 3, accDefPct: 2, maxIntake: 1.0, plannedIntake: 1.0, auto: true, naMgPerHr: 0 },
  "Salty marathoner": { mass: 70, tbwPct: 60, na0: 140, sweatRate: 1.4, sweatNa: 80, sweatK: 3.5, rampMin: 0, duration: 3.5, accDefPct: 2, maxIntake: 1.2, plannedIntake: 1.0, auto: false, naMgPerHr: 0 },
  "McCubbin's rugby player": { mass: 95, tbwPct: 60, na0: 140, sweatRate: 2.5, sweatNa: 60, sweatK: 3.5, rampMin: 0, duration: 1.33, accDefPct: 2, maxIntake: 0.375, plannedIntake: 0.375, auto: false, naMgPerHr: 0 },
};

// ---------- small components ----------
function Field({ label, value, onChange, step = 1, min = 0, unit, note, disabled }) {
  return (
    <label className="block" style={{ opacity: disabled ? 0.45 : 1 }}>
      <span className="block text-sm" style={{ color: T.muted }}>{label}</span>
      <span className="flex items-baseline gap-2 mt-1">
        <input
          type="number" inputMode="decimal" step={step} min={min} value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))}
          className="w-24 px-2 py-1 text-base rounded-none"
          style={{
            color: T.ink, background: T.field, border: `1px solid ${T.rule}`,
            borderBottom: `2px solid ${T.ink}`, outlineColor: T.plasma,
            fontVariantNumeric: "tabular-nums",
          }}
        />
        {unit && <span className="text-sm" style={{ color: T.muted }}>{unit}</span>}
      </span>
      {note && <span className="block text-xs mt-1" style={{ color: T.muted }}>{note}</span>}
    </label>
  );
}

function Stat({ value, label, tone }) {
  return (
    <div>
      <div className="text-2xl md:text-3xl" style={{ color: tone || T.ink, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{value}</div>
      <div className="text-sm mt-0.5" style={{ color: T.muted }}>{label}</div>
    </div>
  );
}

function ChartBlock({ title, children }) {
  return (
    <section className="pt-5 mt-5" style={{ borderTop: `1px solid ${T.rule}` }}>
      <h3 className="text-base mb-2" style={{ color: T.ink, fontWeight: 500 }}>{title}</h3>
      <div style={{ width: "100%", height: 240 }}>{children}</div>
    </section>
  );
}

const tick = { fill: T.muted, fontSize: 12 };
const tipStyle = { background: "#fff", border: `1px solid ${T.rule}`, borderRadius: 0, fontSize: 12, color: T.ink };

// ---------- main ----------
export default function SodiumFluidSimulator() {
  const [p, setP] = useState(PRESETS["My chamber test"]);
  const set = (k) => (v) => setP((s) => ({ ...s, [k]: v }));
  const d = useMemo(() => derive(p), [p]);

  const pct = (x) => `${Math.round(x * 100)}%`;
  const na1 = (x) => x.toFixed(1);

  // verdict
  let verdict, detail;
  if (d.fluidLimited && p.auto) {
    verdict = "Fluid-limited. Drinking rate is the constraint, not sodium.";
    detail = `The most you can drink covers ${pct(d.achievable)} of a ${d.loss.toFixed(1)} L loss; holding a ${p.accDefPct}% deficit would need ${pct(d.required)} (${d.requiredRate.toFixed(2)} L/h). Plasma sodium finishes near ${na1(d.endNaNone)} mmol/L and is rising — salt in the bottle cannot change that direction.`;
  } else if (d.fOp < d.fStar) {
    verdict = "Plasma sodium rises. Season to taste.";
    detail = `At ${d.intakeRate.toFixed(2)} L/h you replace ${pct(d.fOp)}, below your crossover of ${pct(d.fStar)}. Plasma sodium finishes near ${na1(d.endNaNone)} mmol/L with no sodium at all. Choose sodium for palatability and thirst, not for blood chemistry.`;
  } else {
    verdict = "Sodium matters at this drinking rate.";
    detail = `At ${d.intakeRate.toFixed(2)} L/h you replace ${pct(d.fOp)}, above your crossover of ${pct(d.fStar)}. Without sodium, plasma sodium falls to ${na1(d.endNaNone)} mmol/L. Holding it flat takes about ${Math.round(d.holdMgPerHr)} mg/h — roughly ${Math.round(d.holdMgPer100)} mg per 100 mL of what you drink, or ${Math.round(((d.holdMgPerHr * p.duration) / d.naLossTotalMg) * 100)}% of your sweat losses.`;
  }
  const overFull = d.endNaFull > 145;

  return (
    <div style={{ background: T.paper, color: T.ink, fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:ital,wght@0,400;0,500;1,400&display=swap');
        input:focus-visible { outline: 2px solid ${T.plasma}; outline-offset: 2px; }
        button:focus-visible { outline: 2px solid ${T.plasma}; outline-offset: 2px; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.6; }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-10">
        <header className="mb-6" style={{ borderBottom: `2px solid ${T.ink}`, paddingBottom: 12 }}>
          <h1 className="text-2xl md:text-3xl" style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontWeight: 500 }}>
            Fluid and sodium balance during exercise
          </h1>
          <p className="text-sm mt-1 max-w-2xl" style={{ color: T.muted }}>
            Kurtz-Nguyen model as used in McCubbin (2025). Enter what you know; sweat composition only matters at the last step.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.keys(PRESETS).map((k) => (
              <button key={k} onClick={() => setP(PRESETS[k])}
                className="text-sm px-3 py-1"
                style={{ border: `1px solid ${T.ink}`, background: "transparent", color: T.ink, cursor: "pointer" }}>
                {k}
              </button>
            ))}
          </div>
        </header>

        <div className="grid gap-8 md:grid-cols-[260px_1fr]">
          {/* ---------- inputs ---------- */}
          <aside className="space-y-6">
            <div>
              <h2 className="text-sm mb-3" style={{ fontWeight: 600 }}>Body</h2>
              <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
                <Field label="Body mass" value={p.mass} onChange={set("mass")} step={0.5} unit="kg" />
                <Field label="Body water" value={p.tbwPct} onChange={set("tbwPct")} step={1} unit="% of mass" note="55–65% typical; leaner is higher" />
                <Field label="Starting plasma sodium" value={p.na0} onChange={set("na0")} step={1} unit="mmol/L" />
              </div>
            </div>
            <div>
              <h2 className="text-sm mb-3" style={{ fontWeight: 600 }}>Sweat</h2>
              <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
                <Field label="Sweat rate" value={p.sweatRate} onChange={set("sweatRate")} step={0.05} unit="L/h" />
                <Field label="Sweat sodium, whole-body" value={p.sweatNa} onChange={set("sweatNa")} step={1} unit="mmol/L" note="ppm ÷ 23. Regional patch values run high; use the extrapolated number." />
                <Field label="Sweat potassium" value={p.sweatK} onChange={set("sweatK")} step={0.5} unit="mmol/L" />
                <Field label="Onset ramp" value={p.rampMin} onChange={set("rampMin")} step={5} unit="min" note="Minutes for sweat to reach full rate" />
              </div>
            </div>
            <div>
              <h2 className="text-sm mb-3" style={{ fontWeight: 600 }}>Event</h2>
              <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
                <Field label="Duration" value={p.duration} onChange={set("duration")} step={0.25} min={0.25} unit="h" />
                <Field label="Acceptable mass loss" value={p.accDefPct} onChange={set("accDefPct")} step={0.5} unit="%" />
              </div>
            </div>
            <div>
              <h2 className="text-sm mb-3" style={{ fontWeight: 600 }}>Drinking</h2>
              <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
                <Field label="Most you can tolerate" value={p.maxIntake} onChange={set("maxIntake")} step={0.1} unit="L/h" />
                <Field label="Planned intake" value={p.auto ? +d.intakeRate.toFixed(2) : p.plannedIntake} onChange={set("plannedIntake")} step={0.1} unit="L/h" disabled={p.auto} />
              </div>
              <label className="flex items-start gap-2 mt-3 text-sm cursor-pointer">
                <input type="checkbox" checked={p.auto} onChange={(e) => set("auto")(e.target.checked)} className="mt-1" />
                <span>Drink the lesser of what's required and what I can tolerate</span>
              </label>
            </div>
            <div>
              <h2 className="text-sm mb-3" style={{ fontWeight: 600 }}>Sodium</h2>
              <Field label="Sodium intake" value={p.naMgPerHr} onChange={set("naMgPerHr")} step={50} unit="mg/h" />
              <button onClick={() => set("naMgPerHr")(Math.round(d.holdMgPerHr))}
                className="mt-3 text-sm px-3 py-1.5"
                style={{ background: T.ink, color: T.paper, border: "none", cursor: "pointer" }}>
                Set to hold plasma sodium flat
              </button>
            </div>
          </aside>

          {/* ---------- outputs ---------- */}
          <main>
            <div className="pb-5" style={{ borderBottom: `1px solid ${T.rule}` }}>
              <p className="text-xl md:text-2xl leading-snug" style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontWeight: 500 }}>
                {verdict}
              </p>
              <p className="mt-2 text-base leading-relaxed max-w-3xl" style={{ color: T.ink }}>{detail}</p>
              {overFull && (
                <p className="mt-2 text-sm max-w-3xl" style={{ color: T.warn }}>
                  Replacing 100% of your sweat sodium here would push plasma sodium to {na1(d.endNaFull)} mmol/L — above the reference range.
                </p>
              )}
              {p.rampMin > 0 && (
                <p className="mt-2 text-xs max-w-3xl" style={{ color: T.muted }}>
                  Onset ramp reduces total loss to {d.loss.toFixed(2)} L over the event.
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 md:grid-cols-6 gap-x-4 gap-y-5 py-5">
              <Stat value={d.loss.toFixed(1) + " L"} label="Total fluid loss" />
              <Stat value={pct(d.required)} label={`Needed to stay within ${p.accDefPct}%`} />
              <Stat value={pct(d.achievable)} label="Achievable at max intake" />
              <Stat value={pct(d.fStar)} label="Crossover f* for your sweat" tone={T.plasma} />
              <Stat value={d.endDeficit.toFixed(1) + "%"} label="Mass deficit at finish" tone={d.endDeficit > p.accDefPct ? T.deficit : T.ink} />
              <Stat value={na1(p.naMgPerHr > 0 ? d.endNaPlan : d.endNaNone)} label="Plasma Na at finish"
                tone={(p.naMgPerHr > 0 ? d.endNaPlan : d.endNaNone) < 135 || (p.naMgPerHr > 0 ? d.endNaPlan : d.endNaNone) > 145 ? T.warn : T.plasma} />
            </div>

            <ChartBlock title="Plasma sodium over the event">
              <ResponsiveContainer>
                <LineChart data={d.rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={T.rule} strokeDasharray="2 4" vertical={false} />
                  <ReferenceArea y1={135} y2={145} fill={T.band} stroke="none" />
                  <XAxis dataKey="t" type="number" domain={[0, p.duration]} tickCount={Math.min(9, Math.round(p.duration * 2) + 1)} tick={tick} unit="h" stroke={T.rule} />
                  <YAxis domain={[(m) => Math.min(130, Math.floor(m - 1)), (m) => Math.max(150, Math.ceil(m + 1))]} tick={tick} stroke={T.rule} />
                  <Tooltip contentStyle={tipStyle} formatter={(v) => v.toFixed(1) + " mmol/L"} labelFormatter={(l) => `${l} h`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={p.na0} stroke={T.muted} strokeDasharray="4 4" />
                  <Line name="No sodium" dataKey="naNone" stroke={T.plasma} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  {p.naMgPerHr > 0 && <Line name={`Your plan (${p.naMgPerHr} mg/h)`} dataKey="naPlan" stroke={T.plasmaPlan} strokeWidth={2.5} dot={false} isAnimationActive={false} />}
                  <Line name="100% sodium replacement" dataKey="naFull" stroke={T.plasmaFull} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartBlock>

            <ChartBlock title="Body mass deficit">
              <ResponsiveContainer>
                <LineChart data={d.rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={T.rule} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={[0, p.duration]} tickCount={Math.min(9, Math.round(p.duration * 2) + 1)} tick={tick} unit="h" stroke={T.rule} />
                  <YAxis tick={tick} stroke={T.rule} unit="%" domain={[0, (m) => Math.max(p.accDefPct + 1, Math.ceil(m + 0.5))]} />
                  <Tooltip contentStyle={tipStyle} formatter={(v) => v.toFixed(2) + " %"} labelFormatter={(l) => `${l} h`} />
                  <ReferenceLine y={p.accDefPct} stroke={T.deficit} strokeDasharray="4 4" label={{ value: `${p.accDefPct}% limit`, position: "insideTopRight", fill: T.deficit, fontSize: 12 }} />
                  <Line name="Deficit" dataKey="deficitPct" stroke={T.deficit} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartBlock>

            <ChartBlock title="Sweat sodium lost vs. sodium taken in">
              <ResponsiveContainer>
                <LineChart data={d.rows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke={T.rule} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={[0, p.duration]} tickCount={Math.min(9, Math.round(p.duration * 2) + 1)} tick={tick} unit="h" stroke={T.rule} />
                  <YAxis tick={tick} stroke={T.rule} tickFormatter={(v) => (v / 1000).toFixed(1) + " g"} />
                  <Tooltip contentStyle={tipStyle} formatter={(v) => Math.round(v) + " mg"} labelFormatter={(l) => `${l} h`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line name="Lost in sweat" dataKey="naLossMg" stroke={T.salt} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line name="Taken in" dataKey="naInMg" stroke={T.saltIn} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartBlock>

            <section className="pt-5 mt-5" style={{ borderTop: `1px solid ${T.rule}` }}>
              <h3 className="text-base mb-3" style={{ fontWeight: 500 }}>Decision path</h3>
              <ol className="space-y-2 text-sm max-w-3xl" style={{ listStyle: "decimal", paddingLeft: 20 }}>
                <li>Total loss: {p.sweatRate} L/h × {p.duration} h = <b>{d.loss.toFixed(2)} L</b></li>
                <li>Required to stay within {p.accDefPct}% of {p.mass} kg: ({d.loss.toFixed(2)} − {((p.accDefPct / 100) * p.mass).toFixed(2)}) / {d.loss.toFixed(2)} = <b>{pct(d.required)}</b> → {d.requiredRate.toFixed(2)} L/h</li>
                <li>Achievable at {p.maxIntake} L/h: <b>{pct(d.achievable)}</b></li>
                <li>Operating point: {d.intakeRate.toFixed(2)} L/h → <b>{pct(d.fOp)}</b> replaced, {d.endDeficit.toFixed(1)}% deficit at finish{d.fluidLimited && p.auto ? " — fluid-limited" : ""}</li>
                <li>Crossover for {p.sweatNa} + {p.sweatK} mmol/L sweat: f* = <b>{pct(d.fStar)}</b>. {d.fOp >= d.fStar ? `Above it — sodium to hold flat ≈ ${Math.round(d.holdMgPerHr)} mg/h.` : "Below it — plasma sodium rises regardless."}</li>
              </ol>
              <p className="text-xs mt-4 max-w-3xl" style={{ color: T.muted }}>
                Assumes no urine output, no metabolic water, potassium unreplaced, and sodium taken evenly through the event. Modelling only — no outcome data exist at these operating points. Not medical advice.
              </p>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
