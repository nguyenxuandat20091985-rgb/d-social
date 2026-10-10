import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/rate-limit.js'

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(name, value) { this.headers[name] = value },
    status(code) { this.statusCode = code; return this },
    json(value) { this.body = value; return this },
    end() { this.ended = true; return this },
  }
}

function request({ method = 'POST', action = 'post', ip = '192.0.2.1', forwarded = '' } = {}) {
  return {
    method,
    body: { action },
    headers: { 'x-real-ip': ip, 'x-forwarded-for': forwarded },
    socket: { remoteAddress: ip },
  }
}

test('OPTIONS responds with 204 and CORS headers', async () => {
  const res = response()
  await handler(request({ method: 'OPTIONS' }), res)
  assert.equal(res.statusCode, 204)
  assert.equal(res.ended, true)
  assert.equal(res.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS')
})

test('rejects unsupported methods', async () => {
  const res = response()
  await handler(request({ method: 'GET' }), res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.body.error, 'Method not allowed')
})

test('limits post requests per client and returns 429 after the configured threshold', async () => {
  const ip = '198.51.100.10'
  for (let i = 0; i < 8; i += 1) {
    const res = response()
    await handler(request({ action: 'post', ip }), res)
    assert.equal(res.statusCode, 200)
  }
  const blocked = response()
  await handler(request({ action: 'post', ip }), blocked)
  assert.equal(blocked.statusCode, 429)
  assert.equal(blocked.body.allowed, false)
  assert.equal(blocked.body.retry_after_ms, 60_000)
})

test('normalizes unknown action names so changing action cannot bypass the default bucket', async () => {
  const ip = '203.0.113.42'
  for (let i = 0; i < 40; i += 1) {
    const res = response()
    await handler(request({ action: `custom-${i}`, ip }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.action, 'default')
  }
  const blocked = response()
  await handler(request({ action: 'custom-new', ip }), blocked)
  assert.equal(blocked.statusCode, 429)
  assert.equal(blocked.body.action, 'default')
})
