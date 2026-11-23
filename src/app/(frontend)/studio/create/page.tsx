import Link from 'next/link'
import { creatorTemplates } from '@/modules/creator-studio/studio-templates'

const actions = [
  ['Record', 'Use your microphone, camera, or screen.', '/studio/record'],
  ['Upload', 'Add files to your private library.', '/studio/create/upload'],
  ['Go Live', 'Open a live room and preview your broadcast.', '/studio/create/live'],
  ['Import Link', 'Bring in a video from a supported source.', '/studio/external-video'],
  ['New Project', 'Start with a template or a blank project.', '#templates'],
]

export default function CreatePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <h1 className="text-3xl font-bold">Create</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map(([title, copy, href]) => (
          <li key={title}>
            <Link
              className="surface-card block h-full space-y-2 rounded-lg p-4 focus-visible:outline focus-visible:outline-2"
              href={href}
            >
              <h2 className="text-lg font-semibold">{title}</h2>
              <p>{copy}</p>
            </Link>
          </li>
        ))}
      </ul>
      <section id="templates" className="scroll-mt-4 space-y-3" aria-labelledby="project-title">
        <h2 id="project-title" className="text-xl font-semibold">
          New project
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {creatorTemplates.map(({ key, name }) => (
            <li key={key}>
              <Link
                className="block rounded-md border px-4 py-3 underline focus-visible:outline focus-visible:outline-2"
                href={'/studio/portfolio?template=' + key}
              >
                {name}
              </Link>
            </li>
          ))}
        </ul>
        <Link className="inline-block underline" href="/studio/media-edit">
          Start a video edit
        </Link>
      </section>
    </main>
  )
}
