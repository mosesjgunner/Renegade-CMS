# AUD-02 forms operations

Create a form definition with a stable public path, then add a draft schema. A schema is published by selecting it as the definition's active schema; pages resolve that exact schema relationship, so a previously rendered page never reads a mutable field list. Retire a form by changing visibility or selecting a retired schema.

Only the documented field registry is accepted. Labels and help text are server-rendered; conditional rules are a simple field/equality comparison. Do not paste HTML, scripts, webhook URLs, or secrets into a form.

For marketing, configure the newsletter action with the email and explicit unchecked consent field. The disclosure and revision come from the published schema. Unchecked or missing consent stores the submission but does not request a subscription. Public answers are private, excluded from discovery, and exported/deleted only by staff according to retention policy.

Actions are declared in the definition: create contact, create task, notify an approved recipient, or an approved webhook reference. Each submission records completed/failed action state; staff retry failed actions from the submission record without asking the visitor to submit again. Notification/webhook payloads contain submission references, never raw answer values.

Public requests are bounded to 64KB, origin-checked (with an explicit allowlist for embeds), rate-limited, idempotent, and protected with a honeypot. File data is rejected until the governed scanning/direct-upload workflow is configured.
