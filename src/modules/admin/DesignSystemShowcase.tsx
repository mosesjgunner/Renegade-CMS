import type { AdminViewServerProps } from 'payload'

import {
  ActionLink,
  DetailContainer,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  SaveStateNote,
  SectionHeader,
  StatusPill,
  ValidationSummary,
  WorkspaceHeader,
} from './primitives'

/**
 * GUI-02D — internal design-system showcase (route: /admin/design-system).
 * Renders every approved primitive and token-driven state in one place so
 * later passes can compare against a concrete reference. Static examples
 * only: no data, no actions, nothing here mutates anything.
 */
export default function DesignSystemShowcase(_props: AdminViewServerProps) {
  return (
    <main className="gutter--left gutter--right" style={{ margin: '0 auto', maxWidth: 1120 }}>
      <WorkspaceHeader
        title="Design system"
        purpose="Internal reference for the approved operator primitives (GUI-02A–02D). Examples are static."
        crumbs={[{ label: 'Dashboard', href: '/admin' }, { label: 'Design system' }]}
        actions={
          <>
            <ActionLink href="/admin" intent="primary">
              Primary action
            </ActionLink>
            <ActionLink href="/admin">Secondary action</ActionLink>
            <ActionLink href="/admin" intent="destructive">
              Destructive action
            </ActionLink>
          </>
        }
      />

      <section style={{ marginTop: 28 }}>
        <SectionHeader>Status pills — tone is a dot plus text, never color alone</SectionHeader>
        <p style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill tone="success">published</StatusPill>
          <StatusPill tone="warning">scheduled</StatusPill>
          <StatusPill tone="danger">failed</StatusPill>
          <StatusPill tone="neutral">draft</StatusPill>
        </p>
      </section>

      <section style={{ marginTop: 28 }}>
        <SectionHeader>Save state</SectionHeader>
        <SaveStateNote state="dirty">Unsaved changes</SaveStateNote>
        <SaveStateNote state="saving">Saving…</SaveStateNote>
        <SaveStateNote state="saved">Saved just now</SaveStateNote>
        <SaveStateNote state="error">
          Save failed — your changes are still here. Retry.
        </SaveStateNote>
      </section>

      <section style={{ marginTop: 28 }}>
        <SectionHeader>Validation summary (static example)</SectionHeader>
        <ValidationSummary
          errors={[
            { label: 'Title', message: 'Title is required before publishing.' },
            { label: 'Slug', message: 'Slug is already used by another record on this site.' },
          ]}
        />
      </section>

      <section style={{ marginTop: 28 }}>
        <SectionHeader>Empty, error, and loading states</SectionHeader>
        <EmptyState>Nothing is scheduled. Choose a publish date to plan ahead.</EmptyState>
        <ErrorState
          message="The media list could not be loaded. Your last loaded list is still shown below."
          retryHref="/admin/design-system"
        />
        <LoadingSkeleton rows={3} />
      </section>

      <section style={{ marginTop: 28 }}>
        <SectionHeader>Selected-item detail</SectionHeader>
        <DetailContainer>
          <p>Detail containers hold the selected record's evidence and actions.</p>
        </DetailContainer>
      </section>
    </main>
  )
}
