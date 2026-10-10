import type { ApiErrorBody, ApiErrorCode } from '@birthday/types';

/**
 * Typed fetch client for the API.
 *
 * - Same-origin by default (`/api/...`); set VITE_API_URL when the API lives elsewhere.
 * - Sends cookies, and the CSRF header on state-changing requests.
 * - On a 401 it refreshes the session once and retries (concurrent callers share one refresh).
 */

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, string[]>;
  readonly requestId?: string;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'INTERNAL_ERROR';
    this.details = body.details;
    this.requestId = body.requestId;
  }
}

export function isApiError(error: unknown, code?: ApiErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/** A friendly message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return 'We could not reach the server. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
}

/**
 * True when the API could not be reached at all: a network failure (fetch and the XHR upload
 * reject with a TypeError) or a gateway answering 502, 503 or 504 for it. A 4xx is an answer.
 */
export function isServerUnreachable(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 502 || error.status === 503 || error.status === 504;
  return error instanceof TypeError;
}

/** What public forms say when the server is unreachable; the form keeps what was typed. */
export const UNREACHABLE_FORM_MESSAGE = 'We couldn’t reach the server. Your answers are still here — please try again in a moment.';

export function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function csrfHeaders(): Record<string, string> {
  const token = readCookie('bp_csrf');
  return token ? { 'X-CSRF-Token': token } : {};
}

/** Absolute URL for an API path such as "/api/media/<id>/thumb". */
export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path}`;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Skip the refresh-and-retry step (used by the auth endpoints themselves). */
  skipRefresh?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = apiUrl(`/api${path}`);
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseError(response: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};
  try {
    body = (await response.json()) as Partial<ApiErrorBody>;
  } catch {
    body = { message: response.statusText };
  }
  if (response.status === 429 && !body.code) body.code = 'RATE_LIMITED';
  return new ApiError(response.status, body);
}

let refreshInFlight: Promise<boolean> | null = null;
/** Counts successful refreshes, so a request can tell whether one finished while it was out. */
let refreshes = 0;
const sessionListeners = new Set<() => void>();

/** Called when the session is gone (refresh failed). The auth provider subscribes. */
export function onSessionExpired(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(buildUrl('/auth/refresh'), {
    method: 'POST',
    credentials: 'include',
    headers: csrfHeaders(),
  })
    .then((r) => {
      if (r.ok) refreshes += 1;
      return r.ok;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function send(method: string, path: string, options: RequestOptions): Promise<Response> {
  const isForm = options.body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET' && method !== 'HEAD') Object.assign(headers, csrfHeaders());
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  return fetch(buildUrl(path, options.query), {
    method,
    credentials: 'include',
    headers,
    signal: options.signal,
    body:
      options.body === undefined
        ? undefined
        : isForm
          ? (options.body as FormData)
          : JSON.stringify(options.body),
  });
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const refreshesBefore = refreshes;
  let response = await send(method, path, options);

  if (response.status === 401 && !options.skipRefresh) {
    // Several requests can fail together (a page load after the access token expired). They share
    // one refresh; one that answers after that refresh already finished just retries.
    const refreshed = refreshes !== refreshesBefore || (await refreshSession());
    if (refreshed) {
      response = await send(method, path, options);
    } else {
      sessionListeners.forEach((listener) => listener());
    }
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return (await response.text()) as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
};

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

/**
 * Multipart upload with progress (fetch has no upload progress, so this uses XHR).
 * `path` is relative to /api, e.g. "/uploads/<token>".
 */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildUrl(path));
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    for (const [key, value] of Object.entries(csrfHeaders())) xhr.setRequestHeader(key, value);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress({ loaded: event.loaded, total: event.total, percent: Math.round((event.loaded / event.total) * 100) });
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = { message: xhr.statusText };
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, (body ?? {}) as Partial<ApiErrorBody>));
    };
    xhr.onerror = () => reject(new TypeError('Network error'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
