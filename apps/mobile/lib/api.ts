import { authClient } from './auth-client';
import { API_URL } from '../constants/config';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function buildHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  // On native, attach the BetterAuth session cookie stored by the expo client.
  // On web the browser sends it automatically (credentials: 'include').
  try {
    const cookie = (authClient as unknown as { getCookie?: () => string }).getCookie?.();
    if (cookie) headers['Cookie'] = cookie;
  } catch {
    // no stored cookie yet
  }
  return headers;
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await buildHeaders(init.headers as Record<string, string> | undefined);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    if (data && typeof data === 'object' && 'error' in data) {
      message = String((data as { error: unknown }).error);
    }
    throw new ApiError(res.status, data, message);
  }
  return data as T;
}

export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path),
  post: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T = unknown>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};
