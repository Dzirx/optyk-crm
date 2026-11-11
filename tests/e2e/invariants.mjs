// Niezmienniki dziennika ruchów w całej bazie testowej (uruchamiane po wszystkich suitach).
import { check, section, run, sql } from './lib.mjs';

await run(async () => {
  section('niezmienniki dziennika ruchów');
  const total = sql('select count(*) from stock_movements');
  check(Number(total) > 0, `w bazie są ruchy (${total})`);
  const q1 = sql(`select count(*) from inventory_items i where i.quantity <> coalesce((select sum(delta) from stock_movements m where m.inventory_item_id = i.id), 0)`);
  check(q1 === '0', `quantity == Σ delta dla każdego towaru (rozbieżnych: ${q1})`);
  const q2 = sql(`select count(*) from (select qty_after, sum(delta) over (partition by inventory_item_id order by seq) as running from stock_movements) x where x.qty_after <> x.running`);
  check(q2 === '0', `qtyAfter == suma narastająca wg kolejności zapisu (rozbieżnych: ${q2})`);
  const q3 = sql(`select count(*) from stock_movements where delta = 0`);
  check(q3 === '0', 'brak ruchów o delta 0');
  const q4 = sql(`select count(*) from inventory_items where deleted_at is not null and quantity <> 0`);
  check(q4 === '0', 'usunięte towary mają stan 0');
  const q5 = sql(`select count(*) from stock_movements m join inventory_items i on i.id = m.inventory_item_id where i.business_id <> m.business_id`);
  check(q5 === '0', 'ruch zawsze w salonie swojego towaru');
});
