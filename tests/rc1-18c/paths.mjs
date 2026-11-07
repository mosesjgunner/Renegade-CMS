const lane =
  process.env.RC118C_GOLDEN_REPLAY === 'true'
    ? 'golden'
    : process.env.RC118C_BATCH_REPAIRED === 'true'
      ? 'batch'
      : process.env.RC118C_WORKER_REPAIRED === 'true'
        ? 'worker'
        : process.env.RC118C_FINAL === 'true'
          ? 'final'
          : 'initial'
const options = {
  golden: {
    suffix: 'g',
    scratch: 'scratch/rc118c-final-golden',
    directory: '/final-golden',
    project: 'rc118cgolden20261107',
    restoreProject: 'rc118cgoldenrestore20261107',
    imageTag: 'rc118c-batch-shipping-20261107',
    subnet: '10.204.133.0/24',
    restoreSubnet: '10.204.134.0/24',
  },
  initial: {
    suffix: '',
    scratch: 'scratch/rc118c',
    directory: '',
    imageTag: 'rc118c-20261105',
    subnet: '10.204.123.0/24',
    restoreSubnet: '10.204.124.0/24',
  },
  final: {
    suffix: '',
    scratch: 'scratch/rc118c-final',
    directory: '/final',
    imageTag: 'rc118c-final-20261105',
    subnet: '10.204.125.0/24',
    restoreSubnet: '10.204.126.0/24',
  },
  worker: {
    suffix: 'w',
    scratch: 'scratch/rc118c-final-worker',
    directory: '/final-worker',
    imageTag: 'rc118c-worker-repaired-20261105',
    subnet: '10.204.129.0/24',
    restoreSubnet: '10.204.130.0/24',
  },
  batch: {
    suffix: 'b',
    scratch: 'scratch/rc118c-final-batch',
    directory: '/final-batch',
    imageTag: 'rc118c-batch-shipping-20261107',
    subnet: '10.204.131.0/24',
    restoreSubnet: '10.204.132.0/24',
  },
}[lane]
export const acceptance = {
  ...options,
  lane,
  final: lane !== 'initial',
  project:
    options.project ??
    (lane === 'initial' ? 'rc118cjourney20261105' : `rc118cfinal${options.suffix}20261105`),
  restoreProject:
    options.restoreProject ??
    (lane === 'initial' ? 'rc118crestore20261105' : `rc118cfinalrestore${options.suffix}20261105`),
  root: `docs/rc/evidence/rc1/18-pass/18C${options.directory}`,
}
