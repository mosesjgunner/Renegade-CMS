// Windows-host transport adaptation only: remove the unavailable Harbor VM proxy.
const cp = require('node:child_process');
const original = cp.spawnSync;
cp.spawnSync = function(command, args, options) {
  if (command === 'docker' && options?.env) {
    options = { ...options, env: { ...options.env } };
    for (const key of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy']) {
      if (options.env[key] === 'http://hatch-egress-proxy:3128') delete options.env[key];
    }
  }
  return original.call(this, command, args, options);
};
require('node:module').syncBuiltinESMExports();
