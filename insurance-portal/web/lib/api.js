/** Thin fetch wrapper for the Express API (proxied at /api). Errors carry the API's stable code. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, quoteToken, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (quoteToken) headers['x-quote-token'] = quoteToken;
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'include', signal });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(res.status, err.code || 'INTERNAL_ERROR', err.message, err.details);
  }
  return data;
}
