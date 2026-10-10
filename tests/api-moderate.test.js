import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/ai/moderate.js'

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

function request(method, body, ip = '127.0.0.1') {
  return { method, body, headers: { 'x-real-ip': ip }, socket: { remoteAddress: ip } }
}

test('moderation OPTIONS responds with 204', async () => {
  const res = response()
  await handler(request('OPTIONS'), res)
  assert.equal(res.statusCode, 204)
  assert.equal(res.ended, true)
})

test('moderation rejects unsupported methods', async () => {
  const res = response()
  await handler(request('GET'), res)
  assert.equal(res.statusCode, 405)
})

test('moderation requires non-empty text', async () => {
  const res = response()
  await handler(request('POST', { text: '' }), res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error, 'text required')
})

test('moderation rejects text over the input limit', async () => {
  const res = response()
  await handler(request('POST', { text: 'x'.repeat(4001) }, '198.51.100.101'), res)
  assert.equal(res.statusCode, 413)
  assert.equal(res.body.max_length, 4000)
})

test('moderation deterministically hides blocked content with a spam pattern', async () => {
  const res = response()
  await handler(request('POST', { text: 'fuck aaaaaaaaa' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.action, 'hide')
  assert.ok(res.body.reasons.includes('blocked_term:fuck'))
  assert.ok(res.body.reasons.includes('spam_pattern'))
})

test('moderation endpoint rate-limits repeated requests from one client', async () => {
  const ip = '198.51.100.202'
  for (let i = 0; i < 20; i += 1) {
    const res = response()
    await handler(request('POST', { text: 'hello community' }, ip), res)
    assert.equal(res.statusCode, 200)
  }
  const blocked = response()
  await handler(request('POST', { text: 'hello community' }, ip), blocked)
  assert.equal(blocked.statusCode, 429)
  assert.equal(blocked.headers['Retry-After'], '60')
})
