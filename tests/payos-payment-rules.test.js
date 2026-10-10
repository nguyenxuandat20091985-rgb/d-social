import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePaymentRequest, VIP_PLANS } from '../api/payos/payment-rules.js'

test('allows only the advertised VIP plan prices', () => {
  assert.deepEqual(validatePaymentRequest(99000, 'vip_purchase'), {
    ok: true, amount: 99000, type: 'vip_purchase',
  })
  assert.deepEqual(validatePaymentRequest(199000, 'vip_purchase'), {
    ok: true, amount: 199000, type: 'vip_purchase',
  })
  assert.equal(validatePaymentRequest(10000, 'vip_purchase').ok, false)
  assert.equal(validatePaymentRequest(99001, 'vip_purchase').ok, false)
  assert.equal(validatePaymentRequest(50000000, 'vip_purchase').ok, false)
})

test('keeps bounded deposit amounts available', () => {
  assert.equal(validatePaymentRequest(10000, 'deposit').ok, true)
  assert.equal(validatePaymentRequest(50000000, 'deposit').ok, true)
  assert.equal(validatePaymentRequest(9999, 'deposit').ok, false)
  assert.equal(validatePaymentRequest(50000001, 'deposit').ok, false)
})

test('rejects invalid types and non-integer amounts', () => {
  assert.equal(validatePaymentRequest(99000, 'other').ok, false)
  assert.equal(validatePaymentRequest(99000.5, 'vip_purchase').ok, false)
  assert.equal(validatePaymentRequest('99000', 'vip_purchase').ok, false)
})

test('VIP plan durations match the published prices', () => {
  assert.equal(VIP_PLANS[99000], 30)
  assert.equal(VIP_PLANS[199000], 90)
})
