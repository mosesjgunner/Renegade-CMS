import fs from 'node:fs';
import {spawn} from 'node:child_process';
const dir='scratch/rc08c/browser';fs.mkdirSync(dir,{recursive:true});
const env={...JSON.parse(fs.readFileSync('scratch/rc08c/runtime-env.json','utf8')),NODE_ENV:'production',APP_URL:'https://dispatch.rc02.test:3129',NODE_EXTRA_CA_CERTS:process.cwd().replaceAll('\\','/')+'/scratch/rc02-tls/cert.pem',PORT:'3128',HOSTNAME:'127.0.0.1',MEDIA_DIR:process.cwd().replaceAll('\\','/')+'/scratch/rc08c/browser-media',PROXY_MODE:'direct',EMAIL_MODE:'disabled',LOCAL_E2E_TEST_MODE:'false',ENABLE_TEST_ROUTES:'false',ALLOW_FIXTURE_SEED:'false',RENEGADE_MODULES:'all'};
const url=new URL(env.DATABASE_URL);url.pathname='/rc08c_browser3_release_acceptance';env.DATABASE_URL=url.href;
fs.writeFileSync('.env.rc02',Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n'));
fs.writeFileSync(dir+'/site-build.spec.ts',fs.readFileSync('tests/rc02/site-build.spec.ts','utf8').replaceAll('docs/rc/evidence/rc-02',dir)+fs.readFileSync('scratch/rc08c/staff-journey.txt','utf8'));
fs.writeFileSync(dir+'/runtime.mjs',fs.readFileSync('src/scripts/rc02-runtime.mjs','utf8').replaceAll('docs/rc/evidence/rc-02',dir));
let config=fs.readFileSync('playwright.rc02.config.ts','utf8').replace("import './src/scripts/rc02-network.mjs'","import '../../../src/scripts/rc02-network.mjs'").replace("testDir: './tests/rc02'","testDir: '.'").replaceAll('docs/rc/evidence/rc-02',dir).replace('node src/scripts/rc02-runtime.mjs','node '+dir+'/runtime.mjs').replace("trace: 'on'","trace: {mode: 'on', screenshots: false}");fs.writeFileSync(dir+'/playwright.config.ts',config.replace('webServer: {','webServer: { cwd: process.cwd(),'));
const npm='C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js';
const child=spawn(process.execPath,[npm,'run','db:migrate'],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
const log=fs.createWriteStream('scratch/rc08c/browser-migrate.txt');for(const s of [child.stdout,child.stderr])s.on('data',b=>log.write(b.toString().replaceAll(env.DATABASE_URL,'[REDACTED]').replaceAll(new URL(env.DATABASE_URL).password,'[REDACTED]').replaceAll(env.PAYLOAD_SECRET,'[REDACTED]')));child.on('exit',code=>{log.end();console.log('browser migrate',code);process.exitCode=code;});


