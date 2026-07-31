import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ScryptPasswordHasher } from '../auth/password'

test('production password hashes use salted scrypt and verify without storing plaintext', async () => {
  const hasher = new ScryptPasswordHasher()
  const password = 'a long production password'
  const first = await hasher.hash(password)
  const second = await hasher.hash(password)
  assert.match(first, /^scrypt\$N=131072\$r=8\$p=1\$/)
  assert.notEqual(first, second)
  assert.equal(first.includes(password), false)
  assert.equal(await hasher.verify(password, first), true)
  assert.equal(await hasher.verify('not the password', first), false)
})
