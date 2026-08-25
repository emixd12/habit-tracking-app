# Security Policy

## Supported versions

Cadence provides security fixes for the current production deployment and the
latest published source release. Older deployments, source releases, and
unsupported forks do not receive security fixes from this project.

## Report a vulnerability privately

Email `security@identityscaffolding.com` with a private report.
The repository owner monitors this address, including filtered mail folders.

Do not report a suspected vulnerability in a public GitHub issue, discussion,
pull request, or social post. Do not include credentials, authentication
tokens, real user data, behavioral content, or other personal records.

After GitHub private vulnerability reporting is enabled for the public
repository, the **Report a vulnerability** form in the repository's Security
tab is an additional private route. Until that control is visible, use the
security email.

Include only the details needed to understand and reproduce the issue:

- A concise summary and potential impact.
- The affected Cadence version, route, component, or deployment surface.
- Reproduction steps using local, synthetic, or reporter-owned data.
- A minimal proof, relevant logs with secrets removed, and environment details.
- A suggested fix or mitigation, if available.

Cadence does not promise a response deadline. The project asks reporters to
keep the report private while maintainers investigate, prepare a fix, verify
deployment, and coordinate disclosure. Public disclosure should follow an
agreed plan and should not precede a production fix for a known exploitable
weakness.

## Safe research boundaries

Use a local environment or accounts and data you own. Make the smallest request
needed to demonstrate a finding. Stop immediately if you encounter another
person's data or an active credential, and report the exposure without copying
or retaining it.

Do not:

- Access, alter, delete, or export another user's account or records.
- Perform denial-of-service, load, spam, social-engineering, or destructive
  testing against production or its providers.
- Send notifications or email to recipients who did not authorize the test.
- Persist access, bypass cleanup, or retain credentials or personal data.
- Upload real behavioral content, notes, exports, or production records as
  evidence.

This policy does not authorize activity prohibited by law or applicable
provider terms. It does not create a bug bounty, payment promise, support
contract, or guaranteed response time.
