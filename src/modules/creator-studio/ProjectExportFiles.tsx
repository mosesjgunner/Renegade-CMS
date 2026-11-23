import { useState } from 'react'
import { captureRequest } from './capture-sync'

type Files = {
  media: { id: string; checksum: string }[]
  derivatives: { id: string; checksum: string }[]
  withheldDerivatives: number
}
export function ProjectExportFiles({ endpoint, project }: { endpoint: string; project: string }) {
  const [files, setFiles] = useState<Files>()
  const [status, setStatus] = useState('')
  const bundle = endpoint + '?id=' + project + '&bundle=1'
  return (
    <details className="space-y-2 rounded border p-3">
      <summary>Export project and files</summary>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          setStatus('Checking export permissions…')
          try {
            setFiles(await captureRequest<Files>(bundle))
            setStatus('')
          } catch (error) {
            setFiles(undefined)
            setStatus(error instanceof Error ? error.message : 'Export is unavailable.')
          }
        }}
      >
        Check files for export
      </button>
      {status && <p role="status">{status}</p>}
      {files && (
        <>
          <a className="block underline" href={bundle}>
            Download project file
          </a>
          {[
            { name: 'Project files', items: files.media },
            { name: 'Rendered files', items: files.derivatives },
          ].map(
            ({ name, items }) =>
              items.length > 0 && (
                <section key={name}>
                  <h3 className="font-semibold">{name}</h3>
                  <ul className="space-y-2">
                    {items.map(({ id, checksum }, index) => (
                      <li key={id}>
                        <a
                          className="underline"
                          href={endpoint + '?asset=' + id + '&portable=1&download=1'}
                        >
                          Download file {index + 1}
                        </a>
                        <p className="break-all text-sm">{checksum}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ),
          )}
          {files.withheldDerivatives > 0 && (
            <p>{files.withheldDerivatives} rendered files are awaiting export clearance.</p>
          )}
        </>
      )}
    </details>
  )
}
