import { useEffect, useState } from 'react';

/** Wartość opóźniona o `delay` ms (np. fraza wyszukiwania, żeby nie pytać serwera przy każdym znaku). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
