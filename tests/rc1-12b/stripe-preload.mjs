// Test-process transport injection; production adapter, encoding, signatures and routes stay real.
const origin = process.env.RC112B_PAYMENT_HARNESS
if (origin) {
  if (
    origin !== 'http://127.0.0.1:3145' ||
    !process.env.DATABASE_URL?.endsWith('/rc112b_release_acceptance')
  )
    throw new Error('Unsafe payment harness target')
  const realFetch = globalThis.fetch
  globalThis.fetch = (input, init) => {
    const url = String(input)
    return realFetch(
      url.startsWith('https://api.stripe.com/v1/')
        ? origin + url.slice('https://api.stripe.com'.length)
        : input,
      init,
    )
  }
}
