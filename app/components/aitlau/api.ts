export class RequestError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = 'request_failed', status = 0) {
    super(message);
    this.name = 'RequestError';
    this.code = code;
    this.status = status;
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
    });
  } catch {
    throw new RequestError('Could not reach your workspace. Check your connection and try again.', 'network_error');
  }
  const payload = await response.json().catch(() => null) as { data?: T; error?: { message?: string; code?: string } } | null;
  if (!response.ok) {
    throw new RequestError(payload?.error?.message || `The request could not be completed (${response.status}).`, payload?.error?.code, response.status);
  }
  return payload?.data as T;
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function displayDate(value: string | null | undefined, detailed = false): string {
  if (!value) return 'Date not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', detailed ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' }).format(date);
}

export function parseValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value ?? fallback) as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
