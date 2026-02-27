import { useState, useCallback } from 'react';

interface DebugResponse {
  loading: boolean;
  error: string | null;
  data: string | null;
}

export function useDebugFetch() {
  const [state, setState] = useState<DebugResponse>({ loading: false, error: null, data: null });

  const fetchDebug = useCallback(async (endpoint: string, params?: Record<string, string>): Promise<string> => {
    setState({ loading: true, error: null, data: null });
    try {
      const url = new URL(`/debug/${endpoint}`, window.location.origin);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, v);
        }
      }
      const res = await fetch(url.toString());
      const text = await res.text();
      if (!res.ok) {
        setState({ loading: false, error: text, data: null });
        return text;
      }
      setState({ loading: false, error: null, data: text });
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState({ loading: false, error: msg, data: null });
      return msg;
    }
  }, []);

  return { ...state, fetchDebug };
}
