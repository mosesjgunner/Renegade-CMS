import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const outputDir = path.resolve('fixtures/renegadeparty-demo/assets')
await mkdir(outputDir, { recursive: true })

console.log('Generating Renegade Party demo assets...')

// 1. Logo (200x200 PNG)
const logoSvg = `
<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" rx="32" fill="#0c0a09"/>
  <rect x="20" y="20" width="160" height="160" rx="24" fill="#dc2626"/>
  <text x="100" y="125" font-family="system-ui, -apple-system, sans-serif" font-size="76" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="-2">RP</text>
</svg>
`
const logoBuffer = await sharp(Buffer.from(logoSvg)).png().toBuffer()
await writeFile(path.join(outputDir, 'logo.png'), logoBuffer)
console.log('Saved logo.png, bytes:', logoBuffer.length)

// 2. Social Default Card (1200x630 PNG)
const socialSvg = `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0c0a09"/>
      <stop offset="50%" stop-color="#1c1917"/>
      <stop offset="100%" stop-color="#292524"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#dc2626"/>
      <stop offset="100%" stop-color="#ef4444"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="12" fill="url(#accent)"/>
  <rect x="100" y="120" width="100" height="100" rx="20" fill="#dc2626"/>
  <text x="150" y="190" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="900" fill="#ffffff" text-anchor="middle">RP</text>
  <text x="100" y="290" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="800" fill="#ffffff">RENEGADE PARTY</text>
  <text x="100" y="360" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="400" fill="#a8a29e">The Voice of the Unsilenced &amp; Decentralized Movement</text>
  <line x1="100" y1="420" x2="1100" y2="420" stroke="#44403c" stroke-width="2"/>
  <text x="100" y="480" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600" fill="#ef4444">RenegadeParty.org</text>
  <text x="100" y="520" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="400" fill="#78716c">Self-hosted • Verifiable • Autonomous • Open Source</text>
</svg>
`
const socialBuffer = await sharp(Buffer.from(socialSvg)).png().toBuffer()
await writeFile(path.join(outputDir, 'social-default.png'), socialBuffer)
console.log('Saved social-default.png, bytes:', socialBuffer.length)

// 3. Hero Banner (1200x600 PNG)
const heroSvg = `
<svg width="1200" height="600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="herobg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#18181b"/>
      <stop offset="60%" stop-color="#27272a"/>
      <stop offset="100%" stop-color="#3f3f46"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="600" fill="url(#herobg)"/>
  <circle cx="950" cy="300" r="220" fill="#dc2626" opacity="0.15"/>
  <circle cx="1020" cy="220" r="140" fill="#ef4444" opacity="0.2"/>
  <rect x="80" y="100" width="8" height="120" fill="#dc2626"/>
  <text x="110" y="160" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="900" fill="#fafafa">AUTONOMOUS VOICES</text>
  <text x="110" y="220" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700" fill="#dc2626">DECLARATION OF LIBERTY</text>
  <text x="110" y="310" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="400" fill="#d4d4d8">Building grassroots truth resilient against centralized silencing.</text>
  <rect x="110" y="440" width="220" height="50" rx="8" fill="#dc2626"/>
  <text x="220" y="473" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#ffffff" text-anchor="middle">READ DISPATCH</text>
</svg>
`
const heroBuffer = await sharp(Buffer.from(heroSvg)).png().toBuffer()
await writeFile(path.join(outputDir, 'hero-liberty.png'), heroBuffer)
console.log('Saved hero-liberty.png, bytes:', heroBuffer.length)

// 4. Inline Image (800x500 PNG)
const inlineSvg = `
<svg width="800" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="inlinebg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#09090b"/>
      <stop offset="100%" stop-color="#18181b"/>
    </linearGradient>
  </defs>
  <rect width="800" height="500" fill="url(#inlinebg)"/>
  <rect x="40" y="40" width="720" height="420" rx="16" fill="#1c1917" stroke="#3f3f46" stroke-width="2"/>
  <circle cx="120" cy="120" r="30" fill="#dc2626"/>
  <text x="120" y="130" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">1</text>
  <text x="180" y="115" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="bold" fill="#f4f4f5">Decentralized Governance</text>
  <text x="180" y="145" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="normal" fill="#a1a1aa">No single point of censorship or operational failure.</text>
  <circle cx="120" cy="220" r="30" fill="#dc2626"/>
  <text x="120" y="230" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">2</text>
  <text x="180" y="215" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="bold" fill="#f4f4f5">Radical Transparency</text>
  <text x="180" y="245" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="normal" fill="#a1a1aa">Immutable audit trails and open records for all members.</text>
  <circle cx="120" cy="320" r="30" fill="#dc2626"/>
  <text x="120" y="330" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">3</text>
  <text x="180" y="315" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="bold" fill="#f4f4f5">Grassroots Sovereignty</text>
  <text x="180" y="345" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="normal" fill="#a1a1aa">Local chapter autonomy governed by democratic consensus.</text>
</svg>
`
const inlineBuffer = await sharp(Buffer.from(inlineSvg)).png().toBuffer()
await writeFile(path.join(outputDir, 'inline-assembly.png'), inlineBuffer)
console.log('Saved inline-assembly.png, bytes:', inlineBuffer.length)
console.log('Demo assets generation complete!')
