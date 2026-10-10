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

function request(method, body) {
  return { method, body, headers: {}, socket: { remoteAddress: '127.0.0.1' } }
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

test('moderation returns a deterministic decision for blocked terms', async () => {
  const res = response()
  await handler(request('POST', { text: 'fuck' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.action, 'hide')
  assert.ok(res.body.reasons.includes('blocked_term:fuck'))
})
