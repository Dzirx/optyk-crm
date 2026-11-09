'use client';

// Wspólne elementy wizualne strony głównej, logowania i rejestracji.

import Link from 'next/link';
import { motion } from 'motion/react';

export const EASE = [0.22, 1, 0.36, 1] as const;

export function Iridescent({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      className="bg-[linear-gradient(90deg,#67e8f9,#c4b5fd,#f9a8d4,#fcd34d,#6ee7b7,#67e8f9)] bg-[length:200%_auto] bg-clip-text text-transparent"
      animate={{ backgroundPositionX: ['0%', '200%'] }}
      transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
    >
      {children}
    </motion.span>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-white/60">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />
      {children}
    </span>
  );
}

/** Logo: tęczowy pierścień soczewki + nazwa. Bez href — samo logo (np. wersja Windows). */
export function Logo({ href }: { href?: string }) {
  const content = (
    <>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[conic-gradient(from_0deg,#22d3ee,#a78bfa,#f472b6,#34d399,#22d3ee)] p-[2px]">
        <span className="flex h-full w-full items-center justify-center rounded-full bg-[#05060a]">
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
        </span>
      </span>
      <span className="text-lg font-semibold tracking-tight text-white">OptykCRM</span>
    </>
  );
  return href ? (
    <Link href={href} className="flex items-center gap-2.5">
      {content}
    </Link>
  ) : (
    <span className="flex items-center gap-2.5">{content}</span>
  );
}

/** Tło: siatka wygaszana ku dołowi + fioletowa poświata u góry. */
export function Backdrop() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-violet-700/20 blur-[140px]" />
    </>
  );
}
