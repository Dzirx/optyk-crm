import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserBusiness } from '@/lib/api/get-user-business';
import { isUuid } from '@/lib/api/ownership';
import { formatCountDate, formatMoney, formatMoneyCents } from '@/lib/stock-count/format';
import { parsePriceBasis, valueCents } from '@/lib/stock-count/math';
import { StockCountError, loadStockCount, priceOf, sortByName } from '@/lib/stock-count/service';
import { formatPhone } from '@/lib/phone';
import { formatDateTimePl } from '@/lib/time';
import { pozycjePl } from '@/lib/plural';
import { PrintToolbar } from './print-toolbar';
import styles from './print.module.css';

export default async function StockCountPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ price?: string }>;
}) {
  const { id } = await params;
  const basis = parsePriceBasis((await searchParams).price);

  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const business = await getUserBusiness(session.user.id);
  if (!business) redirect('/login');
  if (!isUuid(id)) notFound();

  let count;
  try {
    count = await loadStockCount(business.id, id, true);
  } catch (error) {
    if (error instanceof StockCountError) notFound();
    throw error;
  }

  const draft = count.status === 'open';
  const rows = sortByName(count.lines)
    .filter((l) => l.countedQty !== null && l.countedQty > 0)
    .map((l) => {
      const price = priceOf(l, basis);
      return { ...l, qty: l.countedQty as number, price, value: price === null ? null : valueCents(l.countedQty as number, price) };
    });
  const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const priceless = rows.filter((r) => r.price === null).length;

  return (
    <div className={styles.screenWrapper}>
      <PrintToolbar id={id} basis={basis} />
      <article className={styles.page}>
        {draft && <div className={styles.watermark} aria-hidden>PROJEKT</div>}
        <header className={styles.header}>
          <h1 className={styles.title}>
            Arkusz spisu z natury{draft && <span className={styles.draft}> — PROJEKT</span>}
          </h1>
          <p className={styles.business}>
            {business.name}
            {business.phone ? `, tel. ${formatPhone(business.phone)}` : ''}
          </p>
          <p className={styles.meta}>
            Data spisu: <strong>{formatCountDate(count.countDate)}</strong>
            <span className={styles.basis}> · Wycena wg ceny {basis === 'sale' ? 'sprzedaży' : 'zakupu'}</span>
          </p>
          {count.asOf && (
            <p className={styles.meta}>
              Stan na: <strong>{formatDateTimePl(count.asOf)}</strong>
            </p>
          )}
          <p className={styles.meta}>
            {draft
              ? `Spis przeprowadzono: od ${formatDateTimePl(count.createdAt)}, w toku`
              : `Spis przeprowadzono: ${formatDateTimePl(count.createdAt)} – ${count.closedAt ? formatDateTimePl(count.closedAt) : ''}`}
          </p>
        </header>

        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.num}>Lp.</th>
              <th className={styles.name}>Nazwa</th>
              <th>J.m.</th>
              <th className={styles.right}>Ilość</th>
              <th className={styles.right}>Cena jedn.</th>
              <th className={styles.right}>Wartość</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className={styles.num}>{i + 1}</td>
                <td className={styles.name}>{r.name}</td>
                <td>{r.unit}</td>
                <td className={styles.right}>{r.qty}</td>
                <td className={styles.right}>{r.price === null ? '—' : formatMoney(r.price)}</td>
                <td className={styles.right}>{r.value === null ? '—' : formatMoneyCents(r.value)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.empty}>Brak policzonych pozycji.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className={styles.right}><strong>Razem</strong></td>
              <td className={styles.right}><strong>{formatMoneyCents(total)}</strong></td>
            </tr>
          </tfoot>
        </table>

        <p className={styles.note}>Spis zakończono na pozycji nr {rows.length}.</p>

        {priceless > 0 && <p className={styles.note}>{priceless} {pozycjePl(priceless)} bez ceny — nie wliczono do sumy</p>}

        <section className={styles.signatures}>
          <div className={styles.sigRow}>
            <div className={styles.sig}><span>Osoby spisujące</span></div>
            <div className={styles.sig}><span>Osoby spisujące</span></div>
          </div>
          <div className={styles.sigRow}>
            <div className={styles.sig}><span>Osoba materialnie odpowiedzialna</span></div>
            <div className={styles.sig}><span>Data i podpis</span></div>
          </div>
        </section>
      </article>
    </div>
  );
}
