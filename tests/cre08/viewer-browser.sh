#!/bin/sh
set -eu

browser=$(find /ms-playwright -type f -name chrome-headless-shell | head -n 1)
test -n "$browser"

# Chromium's headless debugging socket binds to loopback. Forward it inside
# the fixture container and publish the forwarded port on host loopback only.
node -e 'const n=require("node:net"); n.createServer(client=>{const c=n.connect(3000,"127.0.0.1");client.on("error",()=>c.destroy());c.on("error",()=>client.destroy());client.pipe(c).pipe(client)}).listen(3001,"0.0.0.0")' &
exec "$browser" --remote-debugging-port=3000 --no-sandbox \
  --host-resolver-rules="MAP *.localhost ${CRE08_VIEWER_GATEWAY:?}" --no-proxy-server \
  --user-data-dir=/tmp/cre08-browser
