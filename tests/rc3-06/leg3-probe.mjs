import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
const res = {}
// Origin the operator reaches when DNS/HTTPS is not set up: the raw IP.
await page.goto('http://127.0.0.1:3113/login')
await page.waitForTimeout(1500)
res.loginViaIp = {
  url: page.url(),
  hasPublicKeyCredential: await page.evaluate(
    () => typeof window.PublicKeyCredential !== 'undefined',
  ),
  isSecureContext: await page.evaluate(() => window.isSecureContext),
  text: (await page.evaluate(() => document.body.innerText)).slice(0, 700),
}
await page.screenshot({
  path: '/home/hatch/workspace/gui01b-logs/rc306/shots/leg3-login-via-ip.png',
})
const home = await page.goto('http://127.0.0.1:3113/')
res.homeViaIp = {
  status: home?.status(),
  text: (await page.evaluate(() => document.body.innerText)).slice(0, 300),
}
console.log(JSON.stringify(res, null, 2))
await browser.close()
