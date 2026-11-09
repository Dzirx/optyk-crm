import type { Business, Customer, WorkOrder, WorkOrderItem } from '@prisma/client';
import styles from './print.module.css';
import { itemsTotal, hasPrices } from '@/lib/work-orders/totals';
import { formatPhone } from '@/lib/phone';

type WorkOrderWithRelations = WorkOrder & {
  customer: Customer;
  items: WorkOrderItem[];
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  do_dali: 'Do dali',
  do_blizy: 'Do bliży',
  progresywne: 'Progresywne',
  soczewki_kontaktowe: 'Soczewki kontaktowe',
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const maybeDecimal = value as { toNumber?: () => number };
  return typeof maybeDecimal.toNumber === 'function' ? maybeDecimal.toNumber() : Number(value);
}

function formatDate(value: Date | string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('pl-PL');
}

// Stare zlecenia mogą nie mieć kwoty — wtedy pokazujemy sumę cen pozycji.
function orderTotal(workOrder: WorkOrderWithRelations): number | null {
  return toNumber(workOrder.totalAmount) ?? (hasPrices(workOrder.items) ? itemsTotal(workOrder.items) : null);
}

function formatMoney(value: number | null): string {
  return value != null ? `${value.toFixed(2)} zł` : '';
}

function formatRx(value: number | null, decimals = 2): string {
  if (value == null) return '—';
  return (value > 0 ? '+' : '') + value.toFixed(decimals);
}

function formatAxis(value: number | null): string {
  return value == null ? '—' : String(value);
}

function Field({
  label,
  value,
  grow,
  strong,
}: {
  label: string;
  value: string;
  grow?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={`${styles.field} ${grow ? styles.fieldGrow : ''}`}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={`${styles.fieldValue} ${strong ? styles.fieldValueStrong : ''}`}>{value}</span>
    </div>
  );
}

function RxTable({ item }: { item: WorkOrderItem }) {
  return (
    <table className={styles.rxTable}>
      <thead>
        <tr>
          <th></th>
          <th>Sfera</th>
          <th>Cylinder</th>
          <th>Oś</th>
          <th>Add</th>
          <th>PD</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>OP</td>
          <td>{formatRx(toNumber(item.opSph))}</td>
          <td>{formatRx(toNumber(item.opCyl))}</td>
          <td>{formatAxis(item.opAxis)}</td>
          <td>{formatRx(toNumber(item.opAdd))}</td>
          <td>{formatRx(toNumber(item.opPd), 1)}</td>
        </tr>
        <tr>
          <td>OL</td>
          <td>{formatRx(toNumber(item.olSph))}</td>
          <td>{formatRx(toNumber(item.olCyl))}</td>
          <td>{formatAxis(item.olAxis)}</td>
          <td>{formatRx(toNumber(item.olAdd))}</td>
          <td>{formatRx(toNumber(item.olPd), 1)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function ItemBlock({ item }: { item: WorkOrderItem }) {
  const framePrice = toNumber(item.framePrice);
  const lensPrice = toNumber(item.lensPrice);

  return (
    <div className={styles.itemBlock}>
      <p className={styles.itemTitle}>{ITEM_TYPE_LABELS[item.type] ?? item.type}</p>
      {item.type !== 'soczewki_kontaktowe' && <RxTable item={item} />}
      <div className={styles.itemDetails}>
        {item.type === 'soczewki_kontaktowe' ? (
          <span>Model soczewek: {item.lensType || '—'}</span>
        ) : (
          <>
            <span>
              Oprawka: {item.frameModel || '—'}
              {item.ownFrame ? ' (własna)' : ''}
            </span>
            <span>Rodzaj szkieł: {item.lensType || '—'}</span>
          </>
        )}
        {framePrice != null && <span>Cena oprawki: {formatMoney(framePrice)}</span>}
        {lensPrice != null && (
          <span>{item.type === 'soczewki_kontaktowe' ? 'Cena soczewek' : 'Cena szkieł'}: {formatMoney(lensPrice)}</span>
        )}
      </div>
    </div>
  );
}

function OrderFormHalf({ workOrder }: { workOrder: WorkOrderWithRelations }) {
  const total = orderTotal(workOrder);
  const deposit = toNumber(workOrder.deposit);
  const toPay = total != null ? total - (deposit ?? 0) : null;

  return (
    <div className={styles.half}>
      <div className={styles.row}>
        <Field label="Data przyjęcia" value={formatDate(workOrder.receivedAt)} />
        <Field label="Data odbioru" value={formatDate(workOrder.pickupDate)} />
        <Field label="Nr zlecenia" value={workOrder.orderNumber} />
      </div>

      <div className={styles.row}>
        <Field
          label="Nazwisko i imię"
          value={`${workOrder.customer.name} ${workOrder.customer.surname}`}
          grow
        />
        <Field label="Nr tel." value={formatPhone(workOrder.customer.phone)} />
      </div>

      {workOrder.items.map(item => (
        <ItemBlock key={item.id} item={item} />
      ))}

      <div className={styles.priceSummary}>
        <Field label="Suma" value={formatMoney(total)} />
        <Field label="Zaliczka / zadatek" value={deposit != null ? `- ${formatMoney(deposit)}` : ''} />
        <Field label="Do zapłaty" value={formatMoney(toPay)} strong />
      </div>

      <div className={styles.notesBox}>
        <p className={styles.notesBoxLabel}>Zalecenia i uwagi</p>
        <p className={styles.notesText}>{workOrder.notes || ''}</p>
      </div>

      <div className={styles.consentBlock}>
        <p className={styles.consentTitle}>☐ Zgoda na przetwarzanie danych osobowych</p>
        <p className={styles.smallPrint}>
          Wyrażam zgodę na przetwarzanie moich danych osobowych w celu realizacji niniejszego zlecenia. Zapoznałem/-am
          się z informacją o przetwarzaniu danych osobowych zamieszczoną na drugiej stronie niniejszego dokumentu.
        </p>
        <div className={styles.signatureLine}>Podpis zleceniodawcy</div>
      </div>

      <div className={styles.consentBlock}>
        <p className={styles.consentTitle}>Potwierdzenie odbioru okularów</p>
        <p className={styles.smallPrint}>
          Potwierdzam odbiór zamówienia zgodnego ze złożonym zleceniem. Zapoznałem/-am się z warunkami gwarancji i
          użytkowania okularów zamieszczonymi na drugiej stronie niniejszego dokumentu.
        </p>
        <div className={styles.signatureLine}>Podpis zleceniodawcy</div>
      </div>

      <div className={styles.signatureLine}>Podpis i pieczęć wytwórcy / zleceniobiorcy</div>

      <div className={styles.footerRow}>
        <p className={styles.footerTagline}>Dziękujemy za zaufanie. Zapraszamy ponownie!</p>
        <p className={styles.footerNote}>* niepotrzebne skreślić</p>
      </div>
    </div>
  );
}

function InfoHalf({ workOrder, business }: { workOrder: WorkOrderWithRelations; business: Business }) {
  const total = orderTotal(workOrder);
  const deposit = toNumber(workOrder.deposit);
  const toPay = total != null ? total - (deposit ?? 0) : null;

  return (
    <div className={`${styles.half} ${styles.stubHalf}`}>
      <div className={styles.stub}>
        <p className={styles.stubTitle}>Odcinek dla klienta</p>
        {business.name && <p className={styles.stubBusiness}>{business.name}</p>}

        <div className={styles.row}>
          <Field label="Nr zlecenia" value={workOrder.orderNumber} strong />
          <Field label="Data odbioru" value={formatDate(workOrder.pickupDate)} strong />
        </div>
        <div className={styles.row}>
          <Field
            label="Klient"
            value={`${workOrder.customer.name} ${workOrder.customer.surname}`}
            grow
          />
          <Field label="Telefon" value={formatPhone(workOrder.customer.phone)} />
        </div>
        <div className={styles.row}>
          <Field label="Data przyjęcia" value={formatDate(workOrder.receivedAt)} />
          <Field label="Zaliczka wpłacona" value={deposit != null ? formatMoney(deposit) : '—'} />
        </div>
        <div className={styles.row}>
          <Field label="Do zapłaty przy odbiorze" value={formatMoney(toPay)} strong />
        </div>

        <p className={styles.stubNote}>Prosimy o zachowanie odcinka i okazanie go przy odbiorze zamówienia.</p>
      </div>
    </div>
  );
}

function UsageHalf({ business }: { business: Business }) {
  return (
    <div className={`${styles.half} ${styles.legal}`}>
      <h2>Jak korzystać z okularów</h2>

      <h3>Pielęgnacja i użytkowanie</h3>
      <ul>
        <li>Do czyszczenia soczewek używaj wyłącznie wody i szmatki z mikrofibry — unikaj suchego ścierania.</li>
        <li>Nie zostawiaj okularów w wysokiej temperaturze (np. na desce rozdzielczej samochodu).</li>
        <li>Przechowuj okulary w etui, gdy z nich nie korzystasz.</li>
        <li>W razie niewygody lub złego dopasowania oprawy zgłoś się do salonu — regulacja jest bezpłatna.</li>
      </ul>

      <h3>Gwarancja</h3>
      <ul>
        <li>12 miesięcy gwarancji od daty odbioru okularów (data odbioru — patrz odcinek dla klienta).</li>
        <li>Gwarancja nie obejmuje uszkodzeń mechanicznych powstałych z winy użytkownika.</li>
        <li>Przy reklamacji konieczne jest okazanie niniejszego dokumentu zlecenia.</li>
      </ul>

      <p className={styles.smallPrint}>
        Dane osobowe są przetwarzane przez {business.name || 'salon optyczny'} wyłącznie w celu realizacji
        niniejszego zlecenia, zgodnie z RODO.
      </p>

      <p className={styles.disclaimer}>
        Uwaga: treści dot. gwarancji i RODO to wzór — przed użyciem w kontakcie z klientami zweryfikuj je z radcą
        prawnym lub inspektorem ochrony danych.
      </p>
    </div>
  );
}

export function WorkOrderPrintSheet({
  workOrder,
  business,
}: {
  workOrder: WorkOrderWithRelations;
  business: Business;
}) {
  return (
    <>
      <div className={styles.page}>
        <OrderFormHalf workOrder={workOrder} />
        <div className={styles.spine}>
          <span>UMOWA – ZLECENIE</span>
        </div>
        <InfoHalf workOrder={workOrder} business={business} />
      </div>

      <div className={styles.page}>
        <UsageHalf business={business} />
        <div className={styles.spine}>
          <span>UMOWA – ZLECENIE</span>
        </div>
        <div className={styles.half} />
      </div>
    </>
  );
}
