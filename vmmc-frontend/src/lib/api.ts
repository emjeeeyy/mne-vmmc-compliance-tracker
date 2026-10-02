import { getToken } from './auth'

// .trim() matters here, not just tidiness — pasting into a host's env-var textarea (Vercel,
// Railway, etc.) commonly leaves a trailing newline in the value, which silently breaks every
// request URL built from this constant. See the matching CORS_ORIGIN fix in the backend's main.ts
// for where this exact failure mode actually took the whole API down.
const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim() ?? 'http://localhost:8443/api'

const REQUEST_TIMEOUT_MS = 10_000
const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = [500, 1500]

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** Thrown when a request never completed (timeout / network drop) after all retries. */
export class ApiConnectionError extends Error {
  constructor(message = 'Connection is slow or unavailable. Please try again.') {
    super(message)
    this.name = 'ApiConnectionError'
  }
}

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  /** Idempotency key for unsafe writes (POST/PATCH) so a client retry never duplicates a record. */
  idempotencyKey?: string
  /** Called with 'retrying' before each retry attempt, so the UI can show a "retrying…" state. */
  onRetry?: (attempt: number) => void
  timeoutMs?: number
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, idempotencyKey, onRetry, timeoutMs = REQUEST_TIMEOUT_MS, headers, ...rest } = options

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !isFormData) {
    finalHeaders['Content-Type'] = 'application/json'
  }

  const token = getToken()
  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`
  }
  if (idempotencyKey) {
    finalHeaders['Idempotency-Key'] = idempotencyKey
  }

  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      onRetry?.(attempt)
      await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1])
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(`${API_URL}${path}`, {
        ...rest,
        headers: finalHeaders,
        body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        let parsedBody: unknown
        try {
          parsedBody = await res.json()
        } catch {
          parsedBody = undefined
        }

        if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
          lastError = new ApiError(res.status, res.statusText, parsedBody)
          continue
        }

        const message =
          (parsedBody as { message?: string } | undefined)?.message ?? res.statusText ?? 'Request failed'
        throw new ApiError(res.status, message, parsedBody)
      }

      if (res.status === 204) return undefined as T
      return (await res.json()) as T
    } catch (err) {
      clearTimeout(timeout)

      if (err instanceof ApiError) throw err

      // Network drop or abort (timeout) — retry, since this is exactly the "weak signal" case.
      lastError = err
      if (attempt < MAX_RETRIES) continue
    }
  }

  if (lastError instanceof ApiError) throw lastError
  throw new ApiConnectionError()
}

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: ApiRequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
}
