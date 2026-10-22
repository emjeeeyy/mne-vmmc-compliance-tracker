import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'

afterEach(() => vi.unstubAllGlobals())

const stubFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('api client responses', () => {
  it('parses a JSON body', async () => {
    stubFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await expect(api.get('/x')).resolves.toEqual({ ok: true })
  })

  // Real bug: a handler that returns null (no signature yet, no pre-employment record) sends a 200 with an
  // empty body. res.json() threw, the catch treated that as a dropped connection, and the request was
  // retried twice and then surfaced as "connection is slow" even though the server had answered correctly.
  it('treats an empty 200 body as "nothing there" (null) and does not retry it', async () => {
    const fetchMock = stubFetch(new Response('', { status: 200 }))
    await expect(api.get('/me/signature')).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a 4xx is surfaced with the server message and not retried', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ message: 'Nope' }), { status: 409, statusText: 'Conflict' }))
    await expect(api.post('/x', {})).rejects.toMatchObject({ name: 'ApiError', status: 409, message: 'Nope' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('put sends a PUT with a JSON body', async () => {
    const fetchMock = stubFetch(new Response('{}', { status: 200 }))
    await api.put('/pre-employment/e1', { fitForDuty: true })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(JSON.stringify({ fitForDuty: true }))
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('ApiError is exported for callers to branch on', () => {
    expect(new ApiError(500, 'x')).toBeInstanceOf(Error)
  })
})
