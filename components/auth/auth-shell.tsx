'use client';

// Rama stron logowania i rejestracji w stylu strony głównej:
// ciemne tło z siatką, opis po lewej, szklana karta z formularzem po prawej.

import Link from 'next/link';
import { useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { Backdrop, EASE, Eyebrow, Iridescent, Logo } from '@/components/landing/ui';

interface AuthShellProps {
  desktop?: boolean;
  eyebrow: string;
  title: React.ReactNode;
  highlight: string;
  lead: string;
  points: string[];
  topLink?: { text: string; label: string; href: string };
  children: React.ReactNode;
}

export function AuthShell({ desktop = false, eyebrow, title, highlight, lead, points, topLink, children }: AuthShellProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-x-clip bg-[#05060a] font-sans text-white antialiased selection:bg-violet-400/30">
        <Backdrop />

        <header className="relative z-10">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Logo href={desktop ? undefined : '/'} />
            {topLink && (
              <p className="text-sm text-white/50">
                <span className="hidden sm:inline">{topLink.text} </span>
                <Link href={topLink.href} className="font-medium text-white transition-colors hover:text-violet-200">
                  {topLink.label} →
                </Link>
              </p>
            )}
          </div>
        </header>

        <main className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_440px] lg:gap-16">
          <div className="hidden lg:block">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <Eyebrow>{eyebrow}</Eyebrow>
            </motion.div>
            <motion.h1
              className="mt-7 text-5xl font-semibold leading-[1.05] tracking-[-0.03em] xl:text-6xl"
              initial={{ opacity: 0, filter: 'blur(16px)', y: 16 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              transition={{ duration: 1, delay: 0.1, ease: EASE }}
            >
              {title}
              <br />
              <Iridescent>{highlight}</Iridescent>
            </motion.h1>
            <motion.p
              className="mt-6 max-w-md text-lg leading-relaxed text-white/55"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              {lead}
            </motion.p>
            <ul className="mt-8 space-y-3">
              {points.map((p, i) => (
                <motion.li
                  key={p}
                  className="flex items-center gap-3 text-white/70"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.6 + i * 0.1, ease: EASE }}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-xs text-emerald-300">
                    ✓
                  </span>
                  {p}
                </motion.li>
              ))}
            </ul>
          </div>

          <motion.div
            className="relative mx-auto w-full max-w-[440px]"
            initial={{ opacity: 0, y: 24, scale: 0.98, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
          >
            {/* tęczowa poświata za kartą */}
            <div className="pointer-events-none absolute -inset-10 rounded-full bg-[conic-gradient(from_0deg,#22d3ee,#a78bfa,#f472b6,#34d399,#22d3ee)] opacity-[0.12] blur-[80px]" />
            <div className="relative rounded-3xl bg-[linear-gradient(140deg,rgba(103,232,249,0.35),rgba(196,181,253,0.15)_35%,rgba(255,255,255,0.06)_60%,rgba(249,168,212,0.3))] p-px">
              <div className="rounded-[calc(1.5rem-1px)] bg-[#0a0b12]/90 p-7 backdrop-blur-xl sm:p-9">{children}</div>
            </div>
          </motion.div>
        </main>
      </div>
    </MotionConfig>
  );
}

const INPUT =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/25 outline-none transition ' +
  'focus:border-violet-300/50 focus:bg-white/[0.06] focus:ring-4 focus:ring-violet-400/10 ' +
  // autouzupełnianie przeglądarki nie może wybielać pola
  '[&:-webkit-autofill]:[-webkit-text-fill-color:white] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_#11131c] [&:-webkit-autofill]:[caret-color:white]';

export function Field({
  label,
  type = 'text',
  aside,
  ...props
}: { label: string; aside?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={props.id} className="text-sm font-medium text-white/70">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        <input {...props} type={isPassword && visible ? 'text' : type} className={INPUT + (isPassword ? ' pr-20' : '')} />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-3 my-auto h-7 rounded-lg px-2 text-xs font-medium text-white/45 transition-colors hover:text-white"
            aria-label={visible ? 'Ukryj hasło' : 'Pokaż hasło'}
          >
            {visible ? 'Ukryj' : 'Pokaż'}
          </button>
        )}
      </div>
    </div>
  );
}

export function SubmitButton({ loading, children, loadingText }: { loading: boolean; children: React.ReactNode; loadingText: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-white px-6 py-3.5 font-semibold text-[#05060a] shadow-[0_0_40px_rgba(167,139,250,0.3)] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
    >
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#05060a]/20 border-t-[#05060a]" />
          {loadingText}
        </>
      ) : (
        <>
          {children}
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </>
      )}
    </button>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const styles = {
    error: 'border-rose-400/30 bg-rose-400/10 text-rose-100',
    success: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
    info: 'border-violet-300/25 bg-violet-300/10 text-violet-100',
  }[tone];
  return (
    <motion.div
      role={tone === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border px-4 py-3 text-sm ${styles}`}
    >
      {children}
    </motion.div>
  );
}
