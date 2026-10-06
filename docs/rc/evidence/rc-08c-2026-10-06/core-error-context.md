# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: site-build.spec.ts >> RC-02: ordinary operator builds Renegade Party Dispatch from an empty install
- Location: scratch\rc08c\browser\site-build.spec.ts:9:1

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: getByLabel('Footer Text', { exact: true })
Expected: "Renegade Party Dispatch — independent reporting for an accountable republic."
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toHaveValue" with timeout 5000ms
  - waiting for getByLabel('Footer Text', { exact: true })

```

```yaml
- button "Open Menu":
  - img
- complementary:
  - navigation:
    - link "Dashboard":
      - /url: /admin
    - link "Posts":
      - /url: /admin/posts
    - link "Pages":
      - /url: /admin/pages
    - link "Layouts":
      - /url: /admin/collections/page-layouts
    - link "Media":
      - /url: /admin/media-library
    - link "Podcasts":
      - /url: /admin/collections/podcast-shows
    - link "Menus":
      - /url: /admin/navigation
    - link "Indexing":
      - /url: /admin/indexing
    - link "Redirects":
      - /url: /admin/redirects
    - link "Rendered Quality":
      - /url: /admin/rendered-quality
    - link "Editorial Workflow":
      - /url: /admin/workflow
    - link "Releases":
      - /url: /admin/releases
    - link "AI Studio":
      - /url: /admin/ai
    - link "Social Distribution":
      - /url: /admin/social
    - link "Email Composer":
      - /url: /admin/email-composer
    - link "Audience":
      - /url: /admin/audience
    - link "Community Moderation":
      - /url: /admin/moderation
    - link "Telemetry & Experiments":
      - /url: /admin/telemetry
    - link "Catalog":
      - /url: /admin/catalog
    - link "Commerce Operations":
      - /url: /admin/commerce
    - link "POD & Fulfillment":
      - /url: /admin/fulfillment
    - link "View Site":
      - /url: /
    - link "Capability Center":
      - /url: /admin/capabilities
    - link "Security":
      - /url: /admin/security
    - button "Collections":
      - text: Collections
      - img
    - link "Sites":
      - /url: /admin/collections/sites
    - button "Settings":
      - text: Settings
      - img
    - link "Users":
      - /url: /admin/collections/users
    - text: Site Settings
    - link "Network":
      - /url: /admin/globals/network-settings
    - button "Publishing":
      - text: Publishing
      - img
    - link "Page Layouts":
      - /url: /admin/collections/page-layouts
    - link "Brands":
      - /url: /admin/collections/brands
    - link "Authors":
      - /url: /admin/collections/authors
    - link "Publications":
      - /url: /admin/collections/publications
    - link "All content":
      - /url: /admin/collections/content
    - button "Community":
      - text: Community
      - img
    - link "Members":
      - /url: /admin/collections/members
    - link "Profiles":
      - /url: /admin/collections/profiles
    - link "Forum Sections":
      - /url: /admin/collections/forum-sections
    - link "Forums":
      - /url: /admin/collections/forums
    - link "Discussions":
      - /url: /admin/collections/discussions
    - link "Discussion Posts":
      - /url: /admin/collections/discussion-posts
    - button "Media":
      - text: Media
      - img
    - link "Media Assets":
      - /url: /admin/collections/media-assets
    - button "Taxonomy":
      - text: Taxonomy
      - img
    - link "Sections":
      - /url: /admin/collections/sections
    - link "Categories":
      - /url: /admin/collections/categories
    - link "Topics":
      - /url: /admin/collections/topics
    - link "Tags":
      - /url: /admin/collections/tags
    - button "Social Studio":
      - text: Social Studio
      - img
    - link "Social Accounts":
      - /url: /admin/collections/social-accounts
    - link "Social Drafts":
      - /url: /admin/collections/social-drafts
    - link "Social Network Variants":
      - /url: /admin/collections/social-network-variants
    - link "Social Queue Items":
      - /url: /admin/collections/social-queue-items
    - link "Social Publish Attempts":
      - /url: /admin/collections/social-publish-attempts
    - link "External Posts":
      - /url: /admin/collections/external-posts
    - button "Calendar":
      - text: Calendar
      - img
    - link "Events":
      - /url: /admin/collections/events
    - button "Audience":
      - text: Audience
      - img
    - link "Form Definitions":
      - /url: /admin/collections/form-definitions
    - link "Form Submissions":
      - /url: /admin/collections/form-submissions
    - link "Audience Lists":
      - /url: /admin/collections/audience-lists
    - link "Audience Memberships":
      - /url: /admin/collections/audience-memberships
    - link "Subscribers":
      - /url: /admin/collections/subscribers
    - link "Consent Events":
      - /url: /admin/collections/consent-events
    - link "Preferences":
      - /url: /admin/collections/preferences
    - link "Suppressions":
      - /url: /admin/collections/suppressions
    - link "Email Messages":
      - /url: /admin/collections/email-messages
    - link "Email Templates":
      - /url: /admin/collections/email-templates
    - link "Delivery Identities":
      - /url: /admin/collections/delivery-identities
    - link "Email Deliveries":
      - /url: /admin/collections/email-deliveries
    - button "CRM":
      - text: CRM
      - img
    - link "Contacts":
      - /url: /admin/collections/contacts
    - button "Quality Center":
      - text: Quality Center
      - img
    - link "Quality Policies":
      - /url: /admin/collections/quality-policies
    - link "Quality Rules":
      - /url: /admin/collections/quality-rules
    - link "Quality Scans":
      - /url: /admin/collections/quality-scans
    - link "Quality Issues":
      - /url: /admin/collections/quality-issues
    - link "Quality Exceptions":
      - /url: /admin/collections/quality-exceptions
    - link "Quality Waivers":
      - /url: /admin/collections/quality-waivers
    - link "Quality Reports":
      - /url: /admin/collections/quality-reports
    - link "Log out":
      - /url: /admin/logout
      - img
- banner:
  - img
  - link "Account":
    - /url: /admin/account
    - img "yas"
- status
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  22  |     if (response.status() >= 400) observations.push(`${response.status()} ${response.url()}`)
  23  |   })
  24  |   // Installer bootstrap is the sole internal write allowed in this journey.
  25  |   const payload = await getPayload({ config })
  26  |   const warnings: string[] = []
  27  |   const warn = console.warn
  28  |   let token = ''
  29  |   let siteId = ''
  30  |   let publicationId = ''
  31  |   let mediaId = ''
  32  |   let articleId = ''
  33  |   let privateMediaId = ''
  34  |   const records: Array<{ collection: string; id: string; title?: string }> = []
  35  |   const api = async (method: string, url: string, data?: unknown, status = 200) => {
  36  |     const response = await page.request.fetch(url, { method, data })
  37  |     const body = await response.text()
  38  |     expect(response.status(), `${method} ${url}: ${body.slice(0, 1500)}`).toBe(status)
  39  |     return JSON.parse(body)
  40  |   }
  41  |   try {
  42  |     console.warn = (...args: unknown[]) => warnings.push(String(args[0] ?? ''))
  43  |     expect((await ensureBootstrap(payload, loadConfig())).state).toBe('incomplete')
  44  |     token = warnings.map((line) => line.match(/: ([A-Za-z0-9_-]+)$/)?.[1]).find(Boolean) ?? ''
  45  |   } finally {
  46  |     console.warn = warn
  47  |   }
  48  |   expect(token).toHaveLength(43)
  49  |   await payload.db.destroy?.()
  50  |   const cdp = await context.newCDPSession(page)
  51  |   await cdp.send('WebAuthn.enable')
  52  |   await cdp.send('WebAuthn.addVirtualAuthenticator', {
  53  |     options: {
  54  |       protocol: 'ctap2',
  55  |       transport: 'internal',
  56  |       hasResidentKey: true,
  57  |       hasUserVerification: true,
  58  |       isUserVerified: true,
  59  |       automaticPresenceSimulation: true,
  60  |     },
  61  |   })
  62  |   try {
  63  |     await test.step('Owner enrollment and blank Standard onboarding', async () => {
  64  |       await page.goto('/setup')
  65  |       await expect(page.getByRole('heading', { name: 'Make this site yours.' })).toBeVisible()
  66  |       await page.getByLabel('Bootstrap token').fill(token)
  67  |       await page.getByLabel('Owner email').fill('editor@renegadeparty.test')
  68  |       await page.getByRole('button', { name: 'Continue', exact: true }).click()
  69  |       await page.getByLabel('Site or publication name').fill('Renegade Party Dispatch')
  70  |       await page
  71  |         .getByLabel('Description')
  72  |         .fill('Independent civic reporting, local organizing and public accountability.')
  73  |       await page.getByLabel('Site slug').fill('renegadeparty')
  74  |       await page.getByLabel('Primary URL').fill(process.env.APP_URL!)
  75  |       await page.getByLabel('Locale').fill('en-US')
  76  |       await page.getByLabel('Timezone').fill('America/Chicago')
  77  |       await page.getByRole('button', { name: 'Continue', exact: true }).click()
  78  |       await page.getByLabel('Starter site type').selectOption('blank-minimal')
  79  |       await page.getByLabel('Create starter pages and sample content').uncheck()
  80  |       await page.getByRole('button', { name: 'Continue', exact: true }).click()
  81  |       await page.getByText('Standard', { exact: true }).click()
  82  |       await page.getByLabel('Search indexing').selectOption('noindex')
  83  |       await page.getByRole('button', { name: 'Continue', exact: true }).click()
  84  |       await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()
  85  |       await expect(page.getByRole('heading', { name: 'Your site is ready to shape.' })).toBeVisible(
  86  |         { timeout: 30_000 },
  87  |       )
  88  |       await expect(page.getByText('Save emergency recovery codes')).toBeVisible()
  89  |       expect((await context.cookies()).some((cookie) => cookie.name === 'renegade-passkey')).toBe(
  90  |         true,
  91  |       )
  92  |       await context.storageState({ path: 'scratch/rc02-owner.json' })
  93  |       await page.goto('/admin')
  94  |       await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  95  |       const sites = await api('GET', '/api/sites?depth=0')
  96  |       expect(sites.docs).toHaveLength(1)
  97  |       siteId = sites.docs[0].id
  98  |       const publications = await api('GET', '/api/publications?depth=0')
  99  |       expect(publications.docs).toHaveLength(1)
  100 |       publicationId = publications.docs[0].id
  101 |       expect((await api('GET', '/api/content?depth=0')).totalDocs).toBe(0)
  102 |       await page.screenshot({
  103 |         path: 'scratch/rc08c/browser/admin.png',
  104 |         fullPage: true,
  105 |         caret: 'initial',
  106 |       })
  107 |     })
  108 |     await test.step('Site settings through the normal admin form', async () => {
  109 |       await page.goto('/admin/globals/site-settings')
  110 |       await expect(page.getByLabel('Site Name', { exact: true })).toHaveValue(
  111 |         'Renegade Party Dispatch',
  112 |       )
  113 |       await page
  114 |         .getByLabel('Footer Text', { exact: true })
  115 |         .fill('Renegade Party Dispatch — independent reporting for an accountable republic.')
  116 |       const settingsSaved = page.waitForResponse(
  117 |         (r) => r.url().includes('/api/globals/site-settings') && r.request().method() === 'POST',
  118 |       )
  119 |       await page.getByRole('button', { name: 'Save', exact: true }).click()
  120 |       expect((await settingsSaved).status()).toBe(200)
  121 |       await page.reload()
> 122 |       await expect(page.getByLabel('Footer Text', { exact: true })).toHaveValue(
      |                                                                     ^ Error: expect(locator).toHaveValue(expected) failed
  123 |         'Renegade Party Dispatch — independent reporting for an accountable republic.',
  124 |       )
  125 |       const settings = await api('GET', '/api/globals/site-settings?depth=0')
  126 |       expect(settings.canonicalOrigin).toBe(process.env.APP_URL)
  127 |       expect(settings.locale).toBe('en-US')
  128 |       expect(settings.timezone).toBe('America/Chicago')
  129 |       expect(settings.indexingMode).toBe('noindex')
  130 |       await page.screenshot({
  131 |         path: 'scratch/rc08c/browser/settings.png',
  132 |         fullPage: true,
  133 |         caret: 'initial',
  134 |       })
  135 |     })
  136 |     await test.step('Activate a theme and configure supported tokens in Theme Studio', async () => {
  137 |       await page.goto('/admin/capabilities')
  138 |       await page.getByRole('tab', { name: /Themes/ }).click()
  139 |       await page.getByLabel('Draft package', { exact: true }).selectOption('renegade-party@1.0.0')
  140 |       await page
  141 |         .getByLabel('Design token overrides', { exact: true })
  142 |         .fill(JSON.stringify({ 'color.canvas': '#f8f6f0', 'color.accent': '#b91c1c' }))
  143 |       const draft = page.waitForResponse(
  144 |         (r) => r.url().endsWith('/api/admin/themes') && r.request().method() === 'POST',
  145 |       )
  146 |       await page.getByRole('button', { name: 'Save theme draft', exact: true }).click()
  147 |       expect((await draft).status()).toBe(200)
  148 |       await expect(page.getByRole('button', { name: 'Activate theme', exact: true })).toBeEnabled()
  149 |       const activation = page.waitForResponse(
  150 |         (r) => r.url().endsWith('/api/admin/themes') && r.request().method() === 'POST',
  151 |       )
  152 |       await page.getByRole('button', { name: 'Activate theme', exact: true }).click()
  153 |       expect((await activation).status()).toBe(200)
  154 |       await page.screenshot({
  155 |         path: 'scratch/rc08c/browser/theme.png',
  156 |         fullPage: true,
  157 |         caret: 'initial',
  158 |       })
  159 |     })
  160 |     await test.step('Upload original image and metadata through the normal media API', async () => {
  161 |       const bytes = readFileSync('fixtures/renegadeparty-demo/assets/hero-liberty.png')
  162 |       const response = await page.request.post('/api/media/upload', {
  163 |         multipart: {
  164 |           siteId,
  165 |           publicationId,
  166 |           title: 'Liberty and civic assembly',
  167 |           altText: 'Liberty Bell banner for civic reporting',
  168 |           caption: 'A publication banner for the Renegade Party Dispatch.',
  169 |           file: { name: 'liberty-banner.png', mimeType: 'image/png', buffer: bytes },
  170 |         },
  171 |       })
  172 |       expect(response.status(), await response.text()).toBe(201)
  173 |       const { asset } = await response.json()
  174 |       mediaId = asset.id
  175 |       records.push({ collection: 'media-assets', id: asset.id, title: asset.title })
  176 |       const checksum = createHash('sha256').update(bytes).digest('hex')
  177 |       writeFileSync(
  178 |         'scratch/rc08c/browser/media.json',
  179 |         JSON.stringify({ sourceSha256: checksum, asset }, null, 2),
  180 |       )
  181 |       const stored = readFileSync(`${process.env.MEDIA_DIR}/${asset.storageLocation}`)
  182 |       expect(createHash('sha256').update(stored).digest('hex')).toBe(checksum)
  183 |       expect(asset.checksum).toBe(`sha256:${checksum}`)
  184 |       await api('PATCH', `/api/media/${asset.id}`, {
  185 |         siteId,
  186 |         creatorCredit: 'Dispatch Visual Desk',
  187 |         copyrightOwner: 'Renegade Party Dispatch',
  188 |         license: 'Publication-owned artwork',
  189 |         rightsStatus: 'approved',
  190 |         governanceEnabled: true,
  191 |       })
  192 |       await page.goto('/admin/media-library')
  193 |       await page.getByRole('tab', { name: 'Assets & DAM', exact: true }).click()
  194 |       await expect(
  195 |         page.getByText('Liberty and civic assembly', { exact: true }).first(),
  196 |       ).toBeVisible()
  197 |       const privateUpload = await page.request.post('/api/media/upload', {
  198 |         multipart: {
  199 |           siteId,
  200 |           title: 'PRIVATE RC02 unused artwork',
  201 |           altText: 'Private unused artwork',
  202 |           file: {
  203 |             name: 'private-logo.png',
  204 |             mimeType: 'image/png',
  205 |             buffer: readFileSync('fixtures/renegadeparty-demo/assets/logo.png'),
  206 |           },
  207 |         },
  208 |       })
  209 |       expect(privateUpload.status()).toBe(201)
  210 |       privateMediaId = (await privateUpload.json()).asset.id
  211 |       records.push({
  212 |         collection: 'media-assets',
  213 |         id: privateMediaId,
  214 |         title: 'PRIVATE RC02 unused artwork',
  215 |       })
  216 |     })
  217 |     await test.step('Create coherent editorial records through authenticated product REST', async () => {
  218 |       const category = (
  219 |         await api(
  220 |           'POST',
  221 |           '/api/categories',
  222 |           {
```