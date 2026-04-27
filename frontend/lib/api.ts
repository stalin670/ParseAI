type FetchOpts = RequestInit & { tokenGetter: () => Promise<string | null> };

export async function apiFetch<T = unknown>(path: string, opts: FetchOpts): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  const token = await opts.tokenGetter();
  const headers = new Headers(opts.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${base}${path}`, { ...opts, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: string };
      if (j.detail) detail = j.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
