import config from './browser/playwright.config'
import {resolve} from 'node:path'
const stage=process.env.RC08C_OPERATOR_STAGE||'operator'
const probeConfig = { ...config, testDir: '.', testMatch: 'operator-probes.spec.ts', webServer: undefined, outputDir: resolve('scratch/rc08c/'+stage+'-results'), reporter: [['list'], ['json', {outputFile: resolve('scratch/rc08c/'+stage+'-results.json')}]] }
export default probeConfig
