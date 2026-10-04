// Network fixture only: a reserved .test hostname maps to this local deployment.
// No application writes, HTTP responses, or authorization are intercepted.
import dns from 'node:dns'
import { syncBuiltinESMExports } from 'node:module'
const original = dns.lookup.bind(dns)
const originalPromise = dns.promises.lookup.bind(dns.promises)
dns.lookup = (hostname, options, callback) => {
  if (hostname !== 'dispatch.rc02.test') return original(hostname, options, callback)
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  process.nextTick(() =>
    options?.all
      ? callback(null, [{ address: '127.0.0.1', family: 4 }])
      : callback(null, '127.0.0.1', 4),
  )
}
dns.promises.lookup = async (hostname, options) =>
  hostname === 'dispatch.rc02.test'
    ? options?.all
      ? [{ address: '127.0.0.1', family: 4 }]
      : { address: '127.0.0.1', family: 4 }
    : originalPromise(hostname, options)
syncBuiltinESMExports()
