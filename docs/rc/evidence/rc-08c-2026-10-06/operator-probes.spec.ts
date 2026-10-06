import {test,expect} from '@playwright/test'
import {writeFileSync,readFileSync} from 'node:fs'
test('RC-08C: a newly created staff operator can begin genuine passkey sign-in', async ({ browser, page }) => {
  const owner = await browser.newContext({ storageState: 'scratch/rc02-owner.json', ignoreHTTPSErrors: true })
  const email = 'staff-rc08c-'+Date.now()+'@renegadeparty.test'
  try {
    const created = await owner.request.post(`${process.env.APP_URL}/api/users`, { data: { email, role: 'staff' } })
    expect(created.status()).toBe(201)
    const account = await created.json()
    const enrollment = await page.request.post('/api/auth/passkeys', { data: { action: 'options' } })
    writeFileSync('scratch/rc08c/browser/staff-enrollment.json', JSON.stringify({ sourceSha: '01908f39a3ce40b5eae5d4dec64b981e103d5fb1', userCreated: created.status(), userId: account.doc.id, firstEnrollmentStatus: enrollment.status(), firstEnrollmentError: await enrollment.json() }, null, 2))
    await page.goto('/login')
    await page.getByLabel('Owner / Staff Email').fill(email)
    const options = page.waitForResponse(r => r.url().endsWith('/api/auth/passkey/options') && r.request().method() === 'POST')
    await page.getByRole('button', { name: /Authenticate with Passkey/ }).click()
    const response = await options
    writeFileSync('scratch/rc08c/browser/staff-login.json', JSON.stringify({ status: response.status(), body: await response.json() }, null, 2))
    expect(response.status(), 'A normal created staff account must be able to obtain its first credential and sign in').toBe(200)
  } finally { await owner.close() }
})

test('RC-08C: owner enrolls a second passkey through Security', async ({ browser }) => {
 const owner = await browser.newContext({storageState:'scratch/rc02-owner.json',ignoreHTTPSErrors:true})
 try {
  const page=await owner.newPage(); const cdp=await owner.newCDPSession(page); await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})
  await page.goto(process.env.APP_URL+'/admin/security'); await page.getByLabel('Name (optional)').fill('RC08C restore hardware')
  const complete=page.waitForResponse(r=>r.url().endsWith('/api/auth/passkeys')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='complete')
  await page.getByRole('button',{name:'Add passkey',exact:true}).click();expect((await complete).status()).toBe(200)
  await expect(page.getByText('RC08C restore hardware',{exact:true})).toBeVisible()
  const hardware=await cdp.send('WebAuthn.getCredentials',{authenticatorId});writeFileSync('scratch/rc08c/restore-hardware-private.json',JSON.stringify(hardware));expect(hardware.credentials).toHaveLength(1)
  await page.screenshot({path:'scratch/rc08c/security-passkey.png',fullPage:true})
 }finally{await owner.close()}
})

test('RC-08C: operator uploads governed artwork for bounded restore proof', async ({browser})=>{
 const owner=await browser.newContext({storageState:'scratch/rc02-owner.json',ignoreHTTPSErrors:true})
 try {
  const sites=await (await owner.request.get(process.env.APP_URL+'/api/sites?depth=0')).json();const siteId=sites.docs[0].id
  const bytes=readFileSync('fixtures/renegadeparty-demo/assets/logo.png')
  const r=await owner.request.post(process.env.APP_URL+'/api/media/upload',{multipart:{siteId,title:'RC08C restore artwork',altText:'Isolated acceptance artwork',file:{name:'rc08c-restore.png',mimeType:'image/png',buffer:bytes}}})
  expect(r.status(),await r.text()).toBe(201);const {asset}=await r.json()
  const stored=readFileSync(process.env.MEDIA_DIR+'/'+asset.storageLocation)
  expect(stored.equals(bytes)).toBe(true)
  const approved=await owner.request.patch(process.env.APP_URL+'/api/media/'+asset.id,{data:{siteId,creatorCredit:'RC08C acceptance',copyrightOwner:'Renegade Party Dispatch',license:'Publication-owned artwork',rightsStatus:'approved',governanceEnabled:true}});expect(approved.status()).toBe(200)
  const visitor=await browser.newContext({ignoreHTTPSErrors:true});const denied=await visitor.request.get(process.env.APP_URL+'/media/'+asset.id);expect([403,404]).toContain(denied.status());await visitor.close()
  const page=await owner.newPage();await page.goto(process.env.APP_URL+'/admin/media-library');await page.getByRole('tab',{name:'Assets & DAM',exact:true}).click();await expect(page.getByText('RC08C restore artwork',{exact:true}).first()).toBeVisible();await page.screenshot({path:'scratch/rc08c/restore-media.png',fullPage:true})
  writeFileSync('scratch/rc08c/restore-media.json',JSON.stringify({assetId:asset.id,storageLocation:asset.storageLocation,checksum:asset.checksum,sourceBytes:bytes.length,uploadStatus:r.status(),governanceStatus:approved.status(),unreferencedPublicBytesStatus:denied.status()},null,2))
 }finally{await owner.close()}
})

test('RC-08C: preserved owner hardware signs in to the running production image',async({browser})=>{
 const ctx=await browser.newContext({ignoreHTTPSErrors:true})
 try{
  const page=await ctx.newPage();const cdp=await ctx.newCDPSession(page);await cdp.send('WebAuthn.enable');const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})
  const hardware=JSON.parse(readFileSync('scratch/rc08c/restore-hardware-private.json','utf8'));for(const credential of hardware.credentials)await cdp.send('WebAuthn.addCredential',{authenticatorId,credential})
  await page.goto(process.env.APP_URL+'/login');await page.getByLabel('Owner / Staff Email').fill('editor@renegadeparty.test');await page.getByRole('button',{name:/Authenticate with Passkey/}).click();await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible()
  const moderation=await ctx.request.get(process.env.APP_URL+'/api/community/moderation-sites');expect(moderation.status()).toBe(200)
  const freshHardware=await cdp.send('WebAuthn.getCredentials',{authenticatorId});writeFileSync('scratch/rc08c/restore-hardware-private.json',JSON.stringify(freshHardware))
  const name=process.env.RC08C_OPERATOR_STAGE||'production';await page.screenshot({path:'scratch/rc08c/'+name+'-owner.png',fullPage:true});writeFileSync('scratch/rc08c/'+name+'-owner.json',JSON.stringify({sourceSha:'01908f39a3ce40b5eae5d4dec64b981e103d5fb1',genuineWebAuthn:true,scopedModerationStatus:moderation.status(),sessionCookiePresent:(await ctx.cookies()).some(c=>c.name==='renegade-passkey')},null,2))
 }finally{await ctx.close()}
})
