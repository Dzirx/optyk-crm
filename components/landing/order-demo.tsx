'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, AnimatePresence, motion, useInView } from 'motion/react';

// Dane przykładowe — tylko do animacji na stronie.
const RX = [
  { eye: 'OP', sph: '-1,25', cyl: '-0,50', axis: '180', add: '—', pd: '31,5' },
  { eye: 'OL', sph: '-1,00', cyl: '-0,75', axis: '175', add: '—', pd: '31,5' },
];
const LINES = [
  { label: 'Oprawka', detail: 'z magazynu · −1 szt.', value: 349 },
  { label: 'Szkło OP', detail: 'organiczne AR', value: 210 },
  { label: 'Szkło OL', detail: 'organiczne AR', value: 210 },
];
const TOTAL = LINES.reduce((s, l) => s + l.value, 0);
const DEPOSIT = 200;

// Kolejne etapy animacji i czas (ms) do następnego etapu.
const PHASES = [700, 1500, 650, 650, 650, 1500, 1300, 1500, 0];
// 0 start · 1 recepta · 2–4 pozycje · 5 suma · 6 zaliczka · 7 gotowe · 8 odebrane + SMS

const pln = (v: number) =>
  `${v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

function CountUp({ to, active }: { to: number; active: boolean }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    const c = animate(0, to, { duration: 1.2, ease: [0.22, 1, 0.36, 1], onUpdate: setV });
    return () => c.stop();
  }, [active, to]);
  return <>{pln(active ? v : 0)}</>;
}

const STATUS = [
  { label: 'W realizacji', cls: 'bg-amber-400/15 text-amber-300 border-amber-400/30' },
  { label: 'Gotowe', cls: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/30' },
  { label: 'Odebrane', cls: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30' },
];

export function OrderDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [phase, setPhase] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    for (let i = 1; i < PHASES.length; i++) {
      t += PHASES[i - 1];
      const p = i;
      timers.push(setTimeout(() => setPhase(p), t));
    }
    return () => timers.forEach(clearTimeout);
  }, [inView, run]);

  const status = phase >= 8 ? STATUS[2] : phase >= 7 ? STATUS[1] : STATUS[0];

  return (
    <div ref={ref} className="relative">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-violet-500/20 via-cyan-400/10 to-pink-500/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b0d15]/90 shadow-2xl backdrop-blur-xl">
        {/* nagłówek okna */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-white/15" />
            <span className="h-3 w-3 rounded-full bg-white/15" />
            <span className="h-3 w-3 rounded-full bg-white/15" />
            <span className="ml-3 text-sm text-white/60">Zlecenie ZL/2026/014</span>
          </div>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={status.label}
              initial={{ opacity: 0, y: -8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.9 }}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${status.cls}`}
            >
              {status.label}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {/* recepta */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-white/40">Recepta · do dali</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[340px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-white/40">
                    <th className="pb-2 font-medium" />
                    <th className="pb-2 font-medium">SPH</th>
                    <th className="pb-2 font-medium">CYL</th>
                    <th className="pb-2 font-medium">OŚ</th>
                    <th className="pb-2 font-medium">ADD</th>
                    <th className="pb-2 font-medium">PD</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {RX.map((r, ri) => (
                    <tr key={r.eye} className="border-t border-white/5">
                      <td className="py-2 font-sans font-semibold text-white/70">{r.eye}</td>
                      {[r.sph, r.cyl, r.axis, r.add, r.pd].map((v, ci) => (
                        <td key={ci} className="py-2">
                          <motion.span
                            className="inline-block text-white"
                            initial={false}
                            animate={phase >= 1 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(6px)' }}
                            transition={{ duration: 0.4, delay: phase >= 1 ? (ri * 5 + ci) * 0.09 : 0 }}
                          >
                            {v}
                          </motion.span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* pozycje */}
          <div className="space-y-2">
            {LINES.map((l, i) => (
              <motion.div
                key={l.label}
                initial={false}
                animate={phase >= 2 + i ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-4 py-2.5"
              >
                <div>
                  <p className="text-sm text-white">{l.label}</p>
                  <p className="text-xs text-white/40">{l.detail}</p>
                </div>
                <p className="font-mono text-sm text-white/80">{pln(l.value)}</p>
              </motion.div>
            ))}
          </div>

          {/* podsumowanie */}
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-white/60">Suma (liczona automatycznie)</p>
              <p className="font-mono text-2xl font-bold text-white">
                <CountUp to={TOTAL} active={phase >= 5} />
              </p>
            </div>
            <motion.div
              initial={false}
              animate={phase >= 6 ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 flex justify-between text-sm text-white/50">
                <span>Zaliczka</span>
                <span className="font-mono">− {pln(DEPOSIT)}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm font-semibold">
                <span className="text-cyan-300">Do zapłaty przy odbiorze</span>
                <span className="font-mono text-cyan-300">{pln(TOTAL - DEPOSIT)}</span>
              </div>
            </motion.div>
          </div>

          <AnimatePresence>
            {phase >= 8 && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
              >
                <span className="text-lg">✉</span>
                SMS z prośbą o opinię w Google wysłany jednym kliknięciem.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => {
            setPhase(0);
            setRun((r) => r + 1);
          }}
          className="text-sm text-white/50 underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          ↻ Odtwórz ponownie
        </button>
      </div>
    </div>
  );
}
