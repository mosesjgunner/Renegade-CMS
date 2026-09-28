import type { TemplateResolution } from './contracts'

export function TemplateInspector({
  resolution,
  className,
}: {
  resolution: TemplateResolution
  className?: string
}) {
  return (
    <aside
      data-testid="template-inspector"
      data-template-id={resolution.selectedTemplateId}
      data-template-surface={resolution.surface}
      data-template-level={resolution.selectedLevel}
      data-template-theme={resolution.theme.id}
      data-fallback-count={resolution.componentFallbacks?.length ?? 0}
      aria-label="Presentation Template Inspector"
      className={`renegade-template-inspector border-t border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/80 text-stone-700 dark:text-stone-300 py-4 px-6 text-xs font-sans print:hidden ${
        className ?? ''
      }`}
    >
      <div className="max-w-5xl mx-auto flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"
              aria-hidden="true"
            />
            <span className="font-semibold text-stone-900 dark:text-stone-100">
              Template Inspector:
            </span>
            <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold">
              {resolution.selectedTemplateId}
            </code>
            <span className="text-stone-400">·</span>
            <span className="text-stone-600 dark:text-stone-400">
              Surface: <strong className="font-mono">{resolution.surface}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {resolution.componentFallbacks && resolution.componentFallbacks.length > 0 ? (
              <span
                data-testid="component-fallbacks-active-badge"
                className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
              >
                Component Fallbacks Active ({resolution.componentFallbacks.length})
              </span>
            ) : null}
            <span className="text-stone-400 font-mono text-[11px]">Selected Precedence:</span>
            <span
              data-testid="selected-precedence-badge"
              className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
            >
              {resolution.selectedLevel.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Precedence Chain Visualization */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] pt-2 border-t border-stone-200/60 dark:border-stone-800/60">
          <span className="text-stone-400 font-mono text-[10px] uppercase mr-1">Chain:</span>
          {(
            [
              { level: 'site_default', label: 'Site Default' },
              { level: 'type_template', label: 'Type Template' },
              { level: 'conditional_variant', label: 'Conditional Variant' },
              { level: 'entry_override', label: 'Entry Override' },
            ] as const
          ).map((item, idx, arr) => {
            const isSelected = resolution.selectedLevel === item.level
            const step = resolution.resolutionPath.find((s) => s.level === item.level)
            return (
              <span key={item.level} className="flex items-center gap-1.5">
                <span
                  data-precedence-step={item.level}
                  data-step-status={step?.status ?? 'skipped'}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                    isSelected
                      ? 'bg-emerald-600 text-white font-bold shadow-sm'
                      : step?.status === 'selected'
                        ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : step?.status === 'incompatible' || step?.status === 'miss'
                          ? 'bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 line-through opacity-75'
                          : 'bg-stone-200 dark:bg-stone-800 text-stone-500 opacity-60'
                  }`}
                  title={step?.reason ?? item.label}
                >
                  {item.label}
                  {step?.candidateId ? ` (${step.candidateId})` : ''}
                </span>
                {idx < arr.length - 1 ? (
                  <span className="text-stone-400 font-mono" aria-hidden="true">
                    &rarr;
                  </span>
                ) : null}
              </span>
            )
          })}
        </div>

        {/* Diagnostic Metadata Accordion */}
        <details className="text-[11px]">
          <summary className="cursor-pointer text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 font-mono text-[10px] select-none">
            Inspection details & resolution log
          </summary>
          <div className="mt-2 p-3 bg-stone-100 dark:bg-stone-800/50 rounded-md font-mono text-[10px] space-y-1">
            <div>
              <span className="text-stone-400">Theme: </span>
              {resolution.theme.id}@{resolution.theme.version} ({resolution.theme.label})
            </div>
            <div>
              <span className="text-stone-400">Type Template: </span>
              {resolution.typeTemplateId}
            </div>
            <div>
              <span className="text-stone-400">Site Default: </span>
              {resolution.siteDefaultId}
            </div>
            {resolution.entryOverride ? (
              <div>
                <span className="text-stone-400">Entry Override: </span>
                {resolution.entryOverride}
              </div>
            ) : null}
            {resolution.conditionalVariant ? (
              <div>
                <span className="text-stone-400">Conditional Variant: </span>
                {resolution.conditionalVariant}
              </div>
            ) : null}
            <div className="pt-1 text-stone-400">Resolution Path:</div>
            <ol className="list-decimal list-inside space-y-0.5 text-stone-600 dark:text-stone-300">
              {resolution.resolutionPath.map((step, idx) => (
                <li key={idx}>
                  <strong>{step.level}</strong>: candidate={step.candidateId ?? 'none'} [
                  {step.status}] {step.reason ? `- ${step.reason}` : ''}
                </li>
              ))}
            </ol>
            {resolution.componentFallbacks && resolution.componentFallbacks.length > 0 ? (
              <div className="pt-2 text-amber-700 dark:text-amber-300">
                <span className="font-bold">Component Fallbacks: </span>
                {resolution.componentFallbacks.map((fb, idx) => (
                  <span key={idx}>
                    [{fb.slot}: {fb.component} ({fb.reason})]
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      </div>
    </aside>
  )
}
