'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { motion, MotionConfig, useScroll, useTransform, useMotionValueEvent } from 'motion/react';
import { HeroVisual } from './hero-visual';
import { OrderDemo } from './order-demo';
import { Backdrop, EASE, Eyebrow, Iridescent, Logo } from './ui';

// ---------- elementy wspólne ----------

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 32, filter: 'blur(8px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Spotlight({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--x', `${e.clientX - r.left}px`);
        el.style.setProperty('--y', `${e.clientY - r.top}px`);
      }}
      className={`group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition-colors duration-300 hover:border-white/20 sm:p-8 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'radial-gradient(420px circle at var(--x) var(--y), rgba(167,139,250,0.16), transparent 60%)' }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

const ICONS = {
  rx: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  box: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  star: 'M11.48 3.5a.56.56 0 011.04 0l2.13 5.11 5.52.44c.5.04.7.66.32.99l-4.2 3.6 1.28 5.38a.56.56 0 01-.84.61L12 16.77l-4.73 2.86a.56.56 0 01-.84-.61l1.28-5.38-4.2-3.6a.56.56 0 01.32-.99l5.52-.44 2.13-5.11z',
  chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  print: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
  users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
} as const;

function Icon({ name, className = 'h-6 w-6' }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[name]} />
    </svg>
  );
}

function IconBadge({ name, tone }: { name: keyof typeof ICONS; tone: string }) {
  return (
    <div className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 ${tone}`}>
      <Icon name={name} />
    </div>
  );
}

// ---------- sekcje ----------

function Nav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 24));

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? 'border-b border-white/10 bg-[#05060a]/70 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo href="/" />
        <nav className="hidden items-center gap-8 text-sm text-white/60 md:flex">
          <a href="#funkcje" className="transition-colors hover:text-white">Funkcje</a>
          <a href="#demo" className="transition-colors hover:text-white">Zlecenia</a>
          <a href="#jak-dziala" className="transition-colors hover:text-white">Jak to działa</a>
          <a href="#faq" className="transition-colors hover:text-white">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm text-white/70 transition-colors hover:text-white sm:block">
            Zaloguj się
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#05060a] transition-transform hover:scale-[1.03]"
          >
            Załóż konto
          </Link>
        </div>
      </div>
    </header>
  );
}

const HEADLINE = ['Twój', 'salon', 'optyczny.'];

function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-8">
        <div className="text-center lg:text-left">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Eyebrow>CRM dla salonów optycznych</Eyebrow>
          </motion.div>

          <h1 className="mt-7 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.03em] text-white sm:text-6xl lg:text-7xl">
            {HEADLINE.map((w, i) => (
              <motion.span
                key={w}
                className="mr-[0.25em] inline-block"
                initial={{ opacity: 0, filter: 'blur(16px)', y: 20 }}
                animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                transition={{ duration: 1, delay: 0.15 + i * 0.12, ease: EASE }}
              >
                {w}
              </motion.span>
            ))}
            <br />
            <motion.span
              className="inline-block"
              initial={{ opacity: 0, filter: 'blur(24px)', scale: 0.96 }}
              animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
              transition={{ duration: 1.6, delay: 0.6, ease: EASE }}
            >
              <Iridescent>W pełnej ostrości.</Iridescent>
            </motion.span>
          </h1>

          <motion.p
            className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-white/60 lg:mx-0"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1 }}
          >
            Klienci, wizyty, zlecenia z receptą, magazyn soczewek i oprawek oraz automatyczne SMS-y — w jednym
            systemie. Mniej kartek i telefonów. Więcej czasu dla klienta i więcej opinii w Google.
          </motion.p>

          <motion.div
            className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.2 }}
          >
            <Link
              href="/register"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-white px-7 py-3.5 font-semibold text-[#05060a] shadow-[0_0_40px_rgba(167,139,250,0.35)] transition-transform hover:scale-[1.03]"
            >
              Wypróbuj 5 dni za darmo
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-7 py-3.5 font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white"
            >
              Zobacz, jak działa
            </a>
          </motion.div>

          <motion.ul
            className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/45 lg:justify-start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.8 }}
          >
            {['5 dni za darmo', 'Działa w przeglądarce', 'SMSAPI i SMSPlanet', 'Wydruk zlecenia'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="text-emerald-300">✓</span>
                {t}
              </li>
            ))}
          </motion.ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

const PAIN = ['zeszyt zleceń', 'recepty na karteczkach', 'Excel z numerami', 'dzwonienie z przypomnieniem', '„czy okulary już są?”', 'stan magazynu „na oko”'];

function Pain() {
  return (
    <section className="relative border-y border-white/5 bg-white/[0.015] py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
        <Reveal>
          <p className="text-sm uppercase tracking-[0.25em] text-white/40">Koniec z</p>
        </Reveal>
        <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-4 sm:gap-x-10">
          {PAIN.map((p, i) => (
            <motion.span
              key={p}
              className="relative text-2xl font-medium text-white/80 sm:text-4xl"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
            >
              <motion.span
                className="text-white/30"
                initial={{ color: 'rgba(255,255,255,0.8)' }}
                whileInView={{ color: 'rgba(255,255,255,0.28)' }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.4, delay: 0.6 + i * 0.12 }}
              >
                {p}
              </motion.span>
              <motion.span
                className="absolute left-0 top-1/2 h-[3px] w-full origin-left rounded-full bg-gradient-to-r from-pink-400 to-violet-400"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.5, delay: 0.6 + i * 0.12, ease: EASE }}
              />
            </motion.span>
          ))}
        </div>
        <Reveal delay={0.3} className="mt-14">
          <p className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Jeden system <Iridescent>zamiast nich.</Iridescent>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="funkcje" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>Funkcje</Eyebrow>
          <h2 className="mt-6 text-4xl font-semibold tracking-[-0.02em] text-white sm:text-5xl">
            Wszystko, czego potrzebuje salon. <span className="text-white/40">Nic ponad to.</span>
          </h2>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-6">
          <Reveal className="md:col-span-4">
            <Spotlight>
              <IconBadge name="rx" tone="bg-violet-400/10 text-violet-300" />
              <h3 className="text-2xl font-semibold text-white">Zlecenia z pełną receptą</h3>
              <p className="mt-3 max-w-lg leading-relaxed text-white/55">
                SPH, CYL, oś, ADD i PD osobno dla oka prawego i lewego. Okulary do dali, do bliży, progresywne i soczewki
                kontaktowe. Oprawka, szkła, zaliczka — a suma i kwota do zapłaty liczą się same.
              </p>
              <div className="mt-6 grid grid-cols-6 gap-1.5 font-mono text-xs">
                {['', 'SPH', 'CYL', 'OŚ', 'ADD', 'PD', 'OP', '-1,25', '-0,50', '180', '+1,50', '31,5', 'OL', '-1,00', '-0,75', '175', '+1,50', '31,5'].map(
                  (c, i) => (
                    <div
                      key={i}
                      className={`rounded-lg px-2 py-2 text-center ${
                        i < 6 || i % 6 === 0 ? 'text-white/40' : 'border border-white/5 bg-white/[0.04] text-white/85'
                      }`}
                    >
                      {c}
                    </div>
                  ),
                )}
              </div>
            </Spotlight>
          </Reveal>

          <Reveal delay={0.1} className="md:col-span-2">
            <Spotlight>
              <IconBadge name="box" tone="bg-cyan-400/10 text-cyan-300" />
              <h3 className="text-xl font-semibold text-white">Magazyn, który się zgadza</h3>
              <p className="mt-3 leading-relaxed text-white/55">
                Soczewki i oprawki na stanie. Wybierasz je w zleceniu — stan zmniejsza się automatycznie.
              </p>
              <div className="mt-6 space-y-2">
                {[
                  ['Soczewki 1,6 AR', 0.72],
                  ['Oprawki damskie', 0.45],
                  ['Kontaktowe 1-day', 0.88],
                ].map(([n, v], i) => (
                  <div key={n as string}>
                    <div className="mb-1 flex justify-between text-xs text-white/45">
                      <span>{n}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                        initial={{ width: 0 }}
                        whileInView={{ width: `${(v as number) * 100}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.2, delay: 0.3 + i * 0.15, ease: EASE }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Spotlight>
          </Reveal>

          <Reveal className="md:col-span-2">
            <Spotlight>
              <IconBadge name="bell" tone="bg-amber-400/10 text-amber-300" />
              <h3 className="text-xl font-semibold text-white">Przypomnienia SMS</h3>
              <p className="mt-3 leading-relaxed text-white/55">
                Ustawiasz datę — system sam wysyła przypomnienie o wizycie. Mniej pustych terminów w kalendarzu.
              </p>
            </Spotlight>
          </Reveal>

          <Reveal delay={0.1} className="md:col-span-2">
            <Spotlight>
              <IconBadge name="star" tone="bg-pink-400/10 text-pink-300" />
              <h3 className="text-xl font-semibold text-white">Opinie w Google</h3>
              <p className="mt-3 leading-relaxed text-white/55">
                Po wizycie lub odbiorze okularów klient dostaje SMS z linkiem do opinii. Zadowoleni klienci piszą — Ty nie
                musisz prosić.
              </p>
            </Spotlight>
          </Reveal>

          <Reveal delay={0.2} className="md:col-span-2">
            <Spotlight>
              <IconBadge name="chat" tone="bg-emerald-400/10 text-emerald-300" />
              <h3 className="text-xl font-semibold text-white">Wysyłki grupowe</h3>
              <p className="mt-3 leading-relaxed text-white/55">
                Jedna wiadomość do wybranych klientów, z własnym szablonem. Przez SMSAPI lub SMSPlanet.
              </p>
            </Spotlight>
          </Reveal>

          <Reveal className="md:col-span-3">
            <Spotlight>
              <IconBadge name="print" tone="bg-white/5 text-white/80" />
              <h3 className="text-xl font-semibold text-white">Wydruk zlecenia</h3>
              <p className="mt-3 leading-relaxed text-white/55">
                Jedna kartka, dwie części: dla salonu i dla klienta — z receptą, cenami, zaliczką i kwotą do zapłaty.
              </p>
            </Spotlight>
          </Reveal>

          <Reveal delay={0.1} className="md:col-span-3">
            <Spotlight>
              <IconBadge name="users" tone="bg-white/5 text-white/80" />
              <h3 className="text-xl font-semibold text-white">Karta klienta i panel</h3>
              <p className="mt-3 leading-relaxed text-white/55">
                Historia wizyt i zleceń w jednym miejscu, zgody na SMS i panel z najważniejszymi liczbami na start dnia.
              </p>
            </Spotlight>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Demo() {
  return (
    <section id="demo" className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <Eyebrow>Zlecenia</Eyebrow>
          <h2 className="mt-6 text-4xl font-semibold tracking-[-0.02em] text-white sm:text-5xl">
            Zlecenie, które <Iridescent>liczy się samo.</Iridescent>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-white/55">
            Wpisujesz receptę, wybierasz oprawkę i szkła z magazynu. System sumuje pozycje, odejmuje zaliczkę i pokazuje
            kwotę do zapłaty. Rabat? Wpisz własną kwotę — suma pozycji zostaje pod ręką.
          </p>
          <ul className="mt-8 space-y-3 text-white/70">
            {[
              'Cena szkieł z magazynu dla obu oczu',
              'Stan magazynu zmniejsza się przy zapisie zlecenia',
              'Statusy: w realizacji → gotowe → odebrane',
              'Po odbiorze — SMS z prośbą o opinię',
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-xs text-cyan-300">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.15}>
          <OrderDemo />
        </Reveal>
      </div>
    </section>
  );
}

const STEPS = [
  { title: 'Klient i wizyta', desc: 'Dodajesz klienta i umawiasz wizytę. Przypomnienie SMS ustawiasz jednym polem.' },
  { title: 'Zlecenie', desc: 'Recepta, oprawka i szkła. Towar z magazynu, suma i zaliczka liczone automatycznie.' },
  { title: 'Wydruk i odbiór', desc: 'Drukujesz zlecenie dla klienta. Zmieniasz status, gdy okulary są gotowe.' },
  { title: 'Opinia w Google', desc: 'Klient dostaje SMS z linkiem do opinii. Twoja ocena rośnie bez dodatkowej pracy.' },
];

function Steps() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="jak-dziala" className="relative border-t border-white/5 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <Reveal className="text-center">
          <Eyebrow>Jak to działa</Eyebrow>
          <h2 className="mt-6 text-4xl font-semibold tracking-[-0.02em] text-white sm:text-5xl">
            Od wizyty do opinii.
            <br />
            <span className="text-white/40">W czterech krokach.</span>
          </h2>
        </Reveal>

        <div ref={ref} className="relative mt-16 pl-12 sm:pl-16">
          <div className="absolute bottom-2 left-[15px] top-2 w-px bg-white/10 sm:left-[23px]" />
          <motion.div
            style={{ scaleY }}
            className="absolute bottom-2 left-[15px] top-2 w-px origin-top bg-gradient-to-b from-cyan-300 via-violet-400 to-pink-400 sm:left-[23px]"
          />
          <div className="space-y-14">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={0.05}>
                <div className="relative">
                  <span className="absolute -left-12 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-[#0b0d15] font-mono text-sm text-white sm:-left-16 sm:h-12 sm:w-12 sm:text-base">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="pt-1 text-2xl font-semibold text-white sm:pt-2.5">{s.title}</h3>
                  <p className="mt-2 max-w-lg leading-relaxed text-white/55">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Deploy() {
  return (
    <section className="py-24 sm:py-28">
      <div className="mx-auto grid max-w-5xl gap-4 px-4 sm:px-6 md:grid-cols-2">
        <Reveal>
          <Spotlight>
            <IconBadge name="chart" tone="bg-cyan-400/10 text-cyan-300" />
            <h3 className="text-2xl font-semibold text-white">W chmurze</h3>
            <p className="mt-3 leading-relaxed text-white/55">
              Logujesz się z przeglądarki na komputerze w salonie. Bez instalacji i bez serwera na zapleczu.
            </p>
          </Spotlight>
        </Reveal>
        <Reveal delay={0.1}>
          <Spotlight>
            <div className="mb-5 flex items-center justify-between">
              <IconBadge name="box" tone="bg-violet-400/10 text-violet-300" />
              <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs text-violet-200">Wkrótce</span>
            </div>
            <h3 className="text-2xl font-semibold text-white">Na Windows</h3>
            <p className="mt-3 leading-relaxed text-white/55">
              Instalator z lokalną bazą danych. Dane zostają na komputerze w salonie.
            </p>
          </Spotlight>
        </Reveal>
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: 'Czy muszę coś instalować?',
    a: 'Nie. Wersja w chmurze działa w przeglądarce. Wersja instalowana na Windows z lokalną bazą danych jest w przygotowaniu.',
  },
  {
    q: 'Jakich dostawców SMS mogę użyć?',
    a: 'SMSAPI.pl i SMSPlanet. Potrzebujesz własnego konta u wybranego dostawcy — klucz wpisujesz w ustawieniach salonu.',
  },
  {
    q: 'Czy SMS-y wysyłają się same?',
    a: 'Tak. Przypomnienia o wizytach i prośby o opinię po wizycie wysyłają się automatycznie o ustalonej porze. Prośbę o opinię po odbiorze okularów wysyłasz jednym kliknięciem.',
  },
  {
    q: 'Czy system pilnuje stanu magazynu?',
    a: 'Tak. Gdy wybierasz soczewki lub oprawkę z magazynu w zleceniu, stan zmniejsza się przy zapisie, a po usunięciu zlecenia wraca. Gdy szkła albo oprawki nie ma na stanie, oznaczasz ten element jako „do zamówienia” — lista zleceń pokazuje, na co czekasz.',
  },
  {
    q: 'Ile kosztuje i jak zacząć?',
    a: 'Zakładasz konto i przez 5 dni korzystasz za darmo ze wszystkich funkcji. Po tym czasie skontaktuj się z nami — ustalimy warunki i przedłużymy dostęp. Twoje dane zostają zapisane.',
  },
  {
    q: 'Czy mogę wydrukować zlecenie dla klienta?',
    a: 'Tak. Wydruk ma część dla salonu i część dla klienta: receptę, ceny, zaliczkę i kwotę do zapłaty.',
  },
];

function Faq() {
  return (
    <section id="faq" className="border-t border-white/5 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal className="text-center">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-6 text-4xl font-semibold tracking-[-0.02em] text-white sm:text-5xl">Pytania</h2>
        </Reveal>
        <div className="mt-12 space-y-3">
          {FAQ.map((item, i) => (
            <Reveal key={item.q} delay={i * 0.05}>
              <details className="group rounded-2xl border border-white/10 bg-white/[0.03] transition-colors open:bg-white/[0.05]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-medium text-white [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/60 transition-transform duration-300 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="px-5 pb-5 leading-relaxed text-white/55">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden py-28 sm:py-40">
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_0deg,#22d3ee,#a78bfa,#f472b6,#34d399,#22d3ee)] opacity-25 blur-[100px]"
        animate={{ rotate: 360 }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
      />
      <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-4xl font-semibold tracking-[-0.03em] text-white sm:text-6xl">
          Zobacz swój salon
          <br />
          <Iridescent>w pełnej ostrości.</Iridescent>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-white/55">
          Klienci, wizyty, zlecenia, magazyn i SMS-y. Jeden system dla całego salonu.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="rounded-full bg-white px-8 py-4 font-semibold text-[#05060a] shadow-[0_0_50px_rgba(167,139,250,0.4)] transition-transform hover:scale-[1.03]"
          >
            Wypróbuj 5 dni za darmo →
          </Link>
          <Link href="/login" className="rounded-full border border-white/15 px-8 py-4 font-medium text-white/80 transition-colors hover:text-white">
            Mam już konto
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 text-sm text-white/40 sm:flex-row sm:px-6">
        <span className="font-medium text-white/70">OptykCRM</span>
        <nav className="flex flex-wrap justify-center gap-6">
          <a href="#funkcje" className="hover:text-white">Funkcje</a>
          <a href="#demo" className="hover:text-white">Zlecenia</a>
          <a href="#faq" className="hover:text-white">FAQ</a>
          <Link href="/login" className="hover:text-white">Logowanie</Link>
        </nav>
        <p>© {new Date().getFullYear()} OptykCRM</p>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-x-clip bg-[#05060a] font-sans text-white antialiased selection:bg-violet-400/30">
        <Backdrop />

        <Nav />
        <main className="relative">
          <Hero />
          <Pain />
          <Features />
          <Demo />
          <Steps />
          <Deploy />
          <Faq />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
