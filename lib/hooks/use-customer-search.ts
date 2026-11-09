import { useEffect, useState } from 'react';
import { useDebouncedValue } from './use-debounced-value';

export interface CustomerHit {
  id: string;
  name: string;
  surname: string;
  phone: string;
}

const RESULT_LIMIT = 20;

/**
 * Wyszukiwanie klientów na serwerze dla list wyboru (zlecenia, wizyty).
 * Pusta fraza albo `enabled = false` = brak zapytania i brak wyników.
 */
export function useCustomerSearch(query: string, enabled = true) {
  const debounced = useDebouncedValue(query.trim(), 300);
  const active = enabled && debounced !== '';
  const [state, setState] = useState<{ key: string; results: CustomerHit[] }>({ key: '', results: [] });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch(`/api/customers?${new URLSearchParams({ page: '1', pageSize: String(RESULT_LIMIT), q: debounced })}`)
      .then((res) => (res.ok ? res.json() : { customers: [] }))
      .then((data) => {
        if (!cancelled) setState({ key: debounced, results: data.customers ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ key: debounced, results: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [active, debounced]);

  const loading = enabled && query.trim() !== '' && state.key !== query.trim();
  return { results: active && state.key === debounced ? state.results : [], loading };
}
