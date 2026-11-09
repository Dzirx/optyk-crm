'use client';

import { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';

// Tablica Snellena: rozmiar w jednostkach cqw (procent szerokości soczewki).
const CHART: Array<{ text: string; size: number }> = [
  { text: 'E', size: 15 },
  { text: 'FP', size: 9.5 },
  { text: 'TOZ', size: 7 },
  { text: 'LPED', size: 5.2 },
  { text: 'PECFD', size: 4 },
];

const EASE = [0.22, 1, 0.36, 1] as const;

function FloatingCard({
  x,
  y,
  className,
  delay,
  floatDuration,
  children,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  className: string;
  delay: number;
  floatDuration: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div style={{ x, y }} className={`absolute z-20 ${className}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.9, delay, ease: EASE }}
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: floatDuration, repeat: Infinity, ease: 'easeInOut' }}
          className="rounded-2xl border border-white/10 bg-[#0d0f18]/80 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function HeroVisual() {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 50, damping: 18 });
  const sy = useSpring(my, { stiffness: 50, damping: 18 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [mx, my]);

  const lensX = useTransform(sx, (v) => v * 24);
  const lensY = useTransform(sy, (v) => v * 24);
  const nearX = useTransform(sx, (v) => v * -46);
  const nearY = useTransform(sy, (v) => v * -46);
  const farX = useTransform(sx, (v) => v * 36);
  const farY = useTransform(sy, (v) => v * 36);
  const rotateX = useTransform(sy, (v) => v * -14);
  const rotateY = useTransform(sx, (v) => v * 14);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[540px] [perspective:1200px]" aria-hidden="true">
      {/* poświata */}
      <motion.div
        className="absolute inset-[6%] rounded-full bg-[conic-gradient(from_90deg,#22d3ee,#a78bfa,#f472b6,#34d399,#22d3ee)] opacity-30 blur-3xl"
        animate={{ rotate: -360 }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      />

      <motion.div
        style={{ x: lensX, y: lensY, rotateX, rotateY }}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: EASE }}
        className="absolute inset-[9%] [transform-style:preserve-3d]"
      >
        {/* opalizujący pierścień = powłoka antyrefleksyjna */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#22d3ee,#a78bfa,#f472b6,#fbbf24,#34d399,#22d3ee)] p-[3px]"
        >
          <div className="h-full w-full rounded-full bg-[#06070c]" />
        </motion.div>

        {/* szkło */}
        <div
          className="absolute inset-[5px] overflow-hidden rounded-full border border-white/10 bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.16),transparent_42%),radial-gradient(circle_at_72%_82%,rgba(167,139,250,0.22),transparent_55%),radial-gradient(circle_at_50%_50%,#0b0d16,#05060a)]"
          style={{ containerType: 'inline-size' }}
        >
          {[18, 30, 40].map((inset, i) => (
            <motion.div
              key={inset}
              className="absolute rounded-full border border-white/[0.07]"
              style={{ inset: `${inset}%` }}
              animate={{ opacity: [0.2, 0.7, 0.2], scale: [1, 1.03, 1] }}
              transition={{ duration: 5, delay: i * 0.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}

          {/* tablica okulistyczna: z rozmycia do ostrości */}
          <motion.div
            initial={{ filter: 'blur(14px)', opacity: 0.3 }}
            animate={{ filter: 'blur(0px)', opacity: 1 }}
            transition={{ duration: 2.4, delay: 0.5, ease: EASE }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-[2.2cqw] font-mono font-bold text-white"
          >
            {CHART.map((row) => (
              <div
                key={row.text}
                className="leading-none tracking-[0.35em] [text-shadow:0_0_24px_rgba(167,139,250,0.45)]"
                style={{ fontSize: `${row.size}cqw`, marginRight: '-0.35em' }}
              >
                {row.text}
              </div>
            ))}
          </motion.div>

          {/* linia skanowania */}
          <motion.div
            className="absolute inset-x-0 h-[22%] bg-gradient-to-b from-transparent via-cyan-300/[0.12] to-transparent"
            initial={{ top: '-25%' }}
            animate={{ top: ['-25%', '105%'] }}
            transition={{ duration: 3.6, delay: 2.6, repeat: Infinity, repeatDelay: 2.2, ease: 'easeInOut' }}
          />

          {/* odblask */}
          <div className="absolute -left-[10%] top-[6%] h-[30%] w-[70%] -rotate-[24deg] rounded-full bg-gradient-to-b from-white/[0.14] to-transparent blur-md" />
        </div>
      </motion.div>

      <FloatingCard x={nearX} y={nearY} className="-left-2 top-[8%] sm:-left-8" delay={1.4} floatDuration={5}>
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">✓</span>
          <div>
            <p className="text-xs text-white/50">Zlecenie ZL/2026/014</p>
            <p className="text-sm font-semibold text-white">Gotowe do odbioru</p>
          </div>
        </div>
      </FloatingCard>

      <FloatingCard x={farX} y={farY} className="-right-2 top-[42%] sm:-right-10" delay={1.8} floatDuration={6}>
        <p className="text-xs text-white/50">SMS · przypomnienie</p>
        <p className="max-w-[190px] text-sm text-white">
          Przypominamy o wizycie <span className="text-cyan-300">jutro o 10:00</span>.
        </p>
      </FloatingCard>

      <FloatingCard x={nearX} y={farY} className="bottom-[4%] left-[8%]" delay={2.2} floatDuration={5.5}>
        <div className="flex items-center gap-3">
          <span className="text-lg tracking-tight text-amber-300">★★★★★</span>
          <div>
            <p className="text-xs text-white/50">Google</p>
            <p className="text-sm font-semibold text-white">Nowa opinia</p>
          </div>
        </div>
      </FloatingCard>
    </div>
  );
}
