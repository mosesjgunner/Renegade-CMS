import fs from 'node:fs';import {spawn} from 'node:child_process';
while(!fs.existsSync('scratch/rc08c/release.exit.json'))await new Promise(r=>setTimeout(r,1000));
const result=JSON.parse(fs.readFileSync('scratch/rc08c/release.exit.json','utf8'));if(result.code!==0){console.log('Browser blocked by release checks');process.exit(1)}
const run=(args,logfile)=>new Promise((done)=>{const log=fs.createWriteStream(logfile);const env={...process.env,NODE_EXTRA_CA_CERTS:process.cwd()+'/scratch/rc02-tls/cert.pem'};const p=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe']});for(const s of [p.stdout,p.stderr])s.on('data',b=>log.write(b));p.on('exit',code=>{log.end();done(code)})});
if(await run(['scratch/rc08c/prepare-browser.mjs'],'scratch/rc08c/browser-prepare.txt')!==0)process.exit(1);
const code=await run(['node_modules/@playwright/test/cli.js','test','--config','scratch/rc08c/browser/playwright.config.ts'],'scratch/rc08c/browser-run.txt');fs.writeFileSync('scratch/rc08c/browser.exit.json',JSON.stringify({sourceSha:result.sha,code,ended:new Date().toISOString()}));console.log('browser',code);process.exitCode=code;
