import type { Business, Customer, WorkOrder, WorkOrderItem } from '@prisma/client';
import styles from './print.module.css';
import { itemsTotal, hasPrices } from '@/lib/work-orders/totals';
import { formatPhone } from '@/lib/phone';
import { formatPln } from '@/lib/money';
import { businessAddress, businessLegalName } from '@/lib/business-details';
import { qtyOf } from '@/lib/work-orders/totals';

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
  return value != null ? formatPln(value) : '';
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

/** Nazwa z ceną: „Hoya 1.6 (2 × 120,00 zł)” albo „Hoya 1.6 (120,00 zł)”. */
function priced(name: string, unit: number | null, qty = 1): string {
  if (unit == null) return name;
  return `${name} (${qty > 1 ? `${qty} × ` : ''}${formatMoney(unit)})`;
}

function ItemBlock({ item }: { item: WorkOrderItem }) {
  const contact = item.type === 'soczewki_kontaktowe';
  const framePrice = toNumber(item.framePrice);
  // Stare pozycje mają jedną nazwę i cenę szkieł (lensType, lensPrice) — pokazujemy je przy OP.
  const hasPerEye = !!(item.opLensName || item.olLensName || item.opLensPrice != null || item.olLensPrice != null);
  const opName = hasPerEye ? item.opLensName : item.lensType;
  const opPrice = toNumber(hasPerEye ? item.opLensPrice : item.lensPrice);
  const olPrice = toNumber(item.olLensPrice);
  const opQty = hasPerEye ? qtyOf(item.opQty) : 1;
  const olQty = qtyOf(item.olQty);
  const servicePrice = toNumber(item.servicePrice);
  const lensName = contact ? 'Soczewka' : 'Szkło';

  return (
    <div className={styles.itemBlock}>
      <p className={styles.itemTitle}>{ITEM_TYPE_LABELS[item.type] ?? item.type}</p>
      {!contact && <RxTable item={item} />}
      <div className={styles.itemDetails}>
        {(opName || opPrice != null) && <span>{lensName} OP: {priced(opName || '—', opPrice, opQty)}</span>}
        {(item.olLensName || olPrice != null) && <span>{lensName} OL: {priced(item.olLensName || '—', olPrice, olQty)}</span>}
        {!contact && (item.ownFrame || item.frameModel || framePrice != null) && (
          <span>Oprawka: {priced(item.ownFrame ? 'własna klienta' : item.frameModel || '—', framePrice)}</span>
        )}
        {!contact && (item.serviceName || servicePrice != null) && (
          <span>Usługa: {priced(item.serviceName || 'Montaż', servicePrice)}</span>
        )}
      </div>
    </div>
  );
}

/** Linia cięcia — na obu stronach na tej samej wysokości (50 mm od dołu kartki). */
function CutLine() {
  return (
    <div className={styles.cutLine}>
      <span>✂ linia cięcia</span>
    </div>
  );
}

/** Strona I: zlecenie, a pod linią cięcia odcinek dla klienta. */
function FrontPage({ workOrder, business }: { workOrder: WorkOrderWithRelations; business: Business }) {
  const total = orderTotal(workOrder);
  const deposit = toNumber(workOrder.deposit);
  const toPay = total != null ? total - (deposit ?? 0) : null;
  const address = businessAddress(business);

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <div className={styles.docHeader}>
          <span className={styles.docTitle}>Umowa – zlecenie</span>
          <span className={styles.docBusiness}>{business.name}</span>
        </div>

        <div className={styles.row}>
          <Field label="Nr zlecenia" value={workOrder.orderNumber} strong />
          <Field label="Data przyjęcia" value={formatDate(workOrder.receivedAt)} />
          <Field label="Data odbioru" value={formatDate(workOrder.pickupDate)} />
        </div>

        <div className={styles.row}>
          <Field label="Nazwisko i imię" value={`${workOrder.customer.name} ${workOrder.customer.surname}`} grow />
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
            Wyrażam zgodę na przetwarzanie moich danych osobowych w celu realizacji niniejszego zlecenia.
            Zapoznałem/-am się z informacją o przetwarzaniu danych osobowych zamieszczoną na odwrocie.
          </p>
        </div>

        <div className={styles.signatures}>
          <div className={styles.signatureLine}>Podpis zleceniodawcy</div>
          <div className={styles.signatureLine}>Podpis i pieczęć zleceniobiorcy</div>
        </div>
      </div>

      <CutLine />

      <div className={styles.stub}>
        <div className={styles.stubBusiness}>
          <p className={styles.stubTitle}>Odcinek dla klienta</p>
          <p>
            <strong>{business.name}</strong>
            {address && <><br />{address}</>}
            {business.phone && <><br />tel. {formatPhone(business.phone)}</>}
          </p>
          <p className={styles.stubNote}>Prosimy o zachowanie odcinka i okazanie go przy odbiorze zamówienia.</p>
        </div>
        <div className={styles.stubFields}>
          <div className={styles.row}>
            <Field label="Nr zlecenia" value={workOrder.orderNumber} strong />
            <Field label="Data odbioru" value={formatDate(workOrder.pickupDate)} strong />
          </div>
          <div className={styles.row}>
            <Field label="Klient" value={`${workOrder.customer.name} ${workOrder.customer.surname}`} grow />
            <Field label="Data przyjęcia" value={formatDate(workOrder.receivedAt)} />
          </div>
          <div className={styles.row}>
            <Field label="Zaliczka wpłacona" value={deposit != null ? formatMoney(deposit) : '—'} />
            <Field label="Do zapłaty przy odbiorze" value={formatMoney(toPay)} strong />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Strona II (odwrocie): RODO, instrukcja użytkowania, gwarancja — tylko nad linią cięcia. */
function BackPage({ business }: { business: Business }) {
  const address = businessAddress(business);
  return (
    <div className={styles.page}>
      <div className={`${styles.main} ${styles.legal}`}>
        <h2>Informacje o przetwarzaniu danych osobowych</h2>
        <p>
          I. Administratorem danych osobowych jest {businessLegalName(business)}
          {address && `, ${address}`}
          {business.nip && `, NIP ${business.nip}`}.
        </p>
        <p>II. Dane osobowe są przetwarzane wyłącznie w celu realizacji niniejszego zlecenia, zgodnie z RODO.</p>

        <h2>Instrukcja użytkowania</h2>
        <ol>
          <li>Okulary należy używać zgodnie z zaleceniami specjalisty (do dali, bliży, stałego lub czasowego użytku).</li>
          <li>Należy je chronić przed działaniem wysokich temperatur (np. nie zostawiać na podszybiu w samochodzie).</li>
          <li>
            Do czyszczenia należy używać ściereczek i preparatów do tego przeznaczonych, nie czyścić na sucho lub za
            pomocą silnych środków chemicznych.
          </li>
          <li>
            Zakładać i zdejmować dwiema rękami, nie należy ich pożyczać innym osobom — są dobierane i wykonywane
            z uwzględnieniem indywidualnych parametrów.
          </li>
          <li>Wszelkich napraw, regulacji i konserwacji należy dokonywać w zakładzie optycznym.</li>
          <li>Nienoszone okulary należy przechowywać w futerale.</li>
        </ol>

        <h2>Gwarancja</h2>
        <p className={styles.legalLead}>
          Gwarantujemy najwyższą jakość, trwałość oraz satysfakcję z użytkowania Państwa okularów korekcyjnych.
        </p>
        <ol>
          <li>Na wykonane okulary udzielana jest gwarancja na okres 24 miesiące od daty odbioru.</li>
          <li>
            Gwarancja nie obejmuje uszkodzeń mechanicznych typu złamania, zarysowania, uszkodzeń powłok oraz
            deformacji np. pod wpływem nacisku, wysokich temperatur lub samodzielnie dokonywanych napraw.
          </li>
          <li>Podstawą do złożenia reklamacji jest posiadanie niniejszego dowodu zakupu.</li>
        </ol>
        <p className={styles.medical}>
          Okulary korekcyjne są wyrobem medycznym — używaj ich zgodnie z instrukcją lub etykietą.
        </p>
      </div>

      <CutLine />
      {/* Odwrocie odcinka dla klienta zostaje puste. */}
      <div className={styles.stub} />
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
      <FrontPage workOrder={workOrder} business={business} />
      <BackPage business={business} />
    </>
  );
}
