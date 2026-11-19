/**
 * POD-07 — Device-role models (PURE CORE): ONE MIC vs MIXER modes
 * (tool map rows 28, 33, 34).
 *
 * A role map binds abstract routing roles to concrete device ids. Switching
 * modes produces a routing DIFF computed here in the core; the browser
 * adapter applies the diff click-free (gain ramps). The voice-follow
 * discovery wizard is a pure decision function: given enumerated devices and
 * a spoken-test level reading per device, it PROPOSES role assignments —
 * every proposal is manually overridable, and nothing is applied silently.
 */

export type DeviceRole =
  | 'mic-in'
  | 'clips-in'
  | 'guests-in'
  | 'guests-out'
  | 'pfl-out'
  | 'mix-minus-in'

export type DeskMode = 'one-mic' | 'mixer'

export type RoleMap = Partial<Record<DeviceRole, string>>

export type MixerFolds = {
  /** Clips play INTO the mixer device (its USB/loopback return carries them). */
  clipsInFold: boolean
  /** Guest returns arrive through the mixer device. */
  guestsInFold: boolean
  /** Mix-minus leaves through the mixer device. */
  guestsOutFold: boolean
  /** Keep guests in PROGRAM even when their fold changes (mirrors MixerState). */
  keepGuestsInProgram: boolean
}

export const DEFAULT_MIXER_FOLDS: MixerFolds = {
  clipsInFold: false,
  guestsInFold: false,
  guestsOutFold: false,
  keepGuestsInProgram: true,
}

export type DeviceRoleAssignment = {
  mode: DeskMode
  roles: RoleMap
  folds: MixerFolds
}

/**
 * The role map each mode expects. In ONE MIC mode the computer's own devices
 * carry everything (mic USB in, headphones out for PFL, guest mix-minus goes
 * to the guests over the call — 'guests-out' is the call's virtual device).
 * In MIXER mode an external mixer/audio interface owns the folds: clips and
 * guests can be folded into/out of the mixer device, and PFL leaves through
 * the mixer.
 */
export const rolesForMode = (mode: DeskMode): DeviceRole[] =>
  mode === 'one-mic'
    ? ['mic-in', 'pfl-out', 'guests-out', 'mix-minus-in']
    : ['mic-in', 'clips-in', 'guests-in', 'guests-out', 'pfl-out', 'mix-minus-in']

export type RoutingChange = {
  role: DeviceRole
  fromDeviceId: string | null
  toDeviceId: string | null
  kind: 'assign' | 'unassign' | 'move'
}

/** Diff between two assignments — the adapter ramps exactly these changes. */
export const computeRoutingDiff = (
  previous: DeviceRoleAssignment,
  next: DeviceRoleAssignment,
): RoutingChange[] => {
  const changes: RoutingChange[] = []
  const roles = new Set<DeviceRole>([
    ...(Object.keys(previous.roles) as DeviceRole[]),
    ...(Object.keys(next.roles) as DeviceRole[]),
  ])
  for (const role of roles) {
    const from = previous.roles[role] ?? null
    const to = next.roles[role] ?? null
    if (from === to) continue
    changes.push({
      role,
      fromDeviceId: from,
      toDeviceId: to,
      kind: from === null ? 'assign' : to === null ? 'unassign' : 'move',
    })
  }
  return changes
}

/** Mode switch = same device bindings where the role survives, diff computed. */
export const switchDeskMode = (
  current: DeviceRoleAssignment,
  nextMode: DeskMode,
): { assignment: DeviceRoleAssignment; diff: RoutingChange[] } => {
  const kept: RoleMap = {}
  for (const role of rolesForMode(nextMode)) {
    if (current.roles[role]) kept[role] = current.roles[role]
  }
  const assignment: DeviceRoleAssignment = {
    mode: nextMode,
    roles: kept,
    folds: nextMode === 'mixer' ? current.folds : { ...DEFAULT_MIXER_FOLDS },
  }
  return { assignment, diff: computeRoutingDiff(current, assignment) }
}

// ---------------------------------------------------------------------------
// Voice-follow discovery wizard (tool map row 33) — pure decision function.
// The user speaks a test phrase; the device whose input level moves is the
// mic. Outputs are proposed from device kinds. Every proposal carries its
// reason and is manually overridable before anything is applied.
// ---------------------------------------------------------------------------

export type EnumeratedDevice = {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput'
}

export type RoleProposal = {
  role: DeviceRole
  deviceId: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
  /** Set when the user overrides the proposal — proposals never self-apply. */
  overridden: boolean
}

export const SPOKEN_TEST_MIN_RMS = 0.02

export const proposeRoleAssignments = (
  devices: EnumeratedDevice[],
  spokenTestLevels: Record<string, number>,
): RoleProposal[] => {
  const proposals: RoleProposal[] = []
  const inputs = devices.filter((d) => d.kind === 'audioinput')
  const outputs = devices.filter((d) => d.kind === 'audiooutput')

  let loudest: { deviceId: string; level: number } | null = null
  for (const device of inputs) {
    const level = spokenTestLevels[device.deviceId] ?? 0
    if (level >= SPOKEN_TEST_MIN_RMS && (loudest === null || level > loudest.level)) {
      loudest = { deviceId: device.deviceId, level }
    }
  }
  if (loudest) {
    proposals.push({
      role: 'mic-in',
      deviceId: loudest.deviceId,
      confidence: 'high',
      reason: `Spoken test moved this input (RMS ${loudest.level.toFixed(3)}), louder than every other input.`,
      overridden: false,
    })
  } else if (inputs.length === 1) {
    proposals.push({
      role: 'mic-in',
      deviceId: inputs[0].deviceId,
      confidence: 'low',
      reason:
        'Only one input device exists, but the spoken test did not move it — verify before use.',
      overridden: false,
    })
  }

  const headphoneLike = outputs.find((d) => /head|ear|airpod/i.test(d.label)) ?? outputs[0]
  if (headphoneLike) {
    proposals.push({
      role: 'pfl-out',
      deviceId: headphoneLike.deviceId,
      confidence: /head|ear|airpod/i.test(headphoneLike.label) ? 'medium' : 'low',
      reason: 'Proposed as the host cue/PFL output; pick your headphones if this is wrong.',
      overridden: false,
    })
  }
  return proposals
}

/** Applies proposals + manual overrides into a role map (explicit user act). */
export const applyRoleProposals = (
  base: RoleMap,
  proposals: RoleProposal[],
  overrides: Partial<Record<DeviceRole, string>> = {},
): RoleMap => {
  const roles: RoleMap = { ...base }
  for (const proposal of proposals) roles[proposal.role] = proposal.deviceId
  for (const [role, deviceId] of Object.entries(overrides)) {
    if (deviceId) roles[role as DeviceRole] = deviceId
  }
  return roles
}
