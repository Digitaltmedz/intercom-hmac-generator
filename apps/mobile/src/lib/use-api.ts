import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

/** Enkel datahämtning med laddning, fel och omladdning. */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetcher());
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "unknown", "Något gick fel."));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}
