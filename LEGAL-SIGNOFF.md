# Legal Sign-Off Workflow

This file describes the practical workflow for collecting contributor approvals for Favewise.

This is a maintainer-facing operational reference for contribution intake. It is not end-user product documentation.

## 1. Baseline Rule

No non-trivial code, design, documentation, test, script, or asset contribution should be merged until the maintainer has confirmed that the required legal confirmations have been completed.

The default document set for contributors is:

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CLA.md](./CLA.md)

For selected or higher-risk contributions, maintainers may also require:

- [COPYRIGHT-ASSIGNMENT.md](./COPYRIGHT-ASSIGNMENT.md)
- employer or client authorization
- identity confirmation
- a separate signed PDF or e-sign workflow

## 2. Pull Request Confirmation

Every contributor submitting a pull request should complete the legal confirmation section in the pull request template.

That confirmation is intended to:

- capture awareness of the project rules
- document the contributor's representations
- support later follow-up if a separate signature is required

The pull request template does not replace any separate agreement that the maintainer requires.

## 3. When to Require CLA Only

A CLA-only workflow may be sufficient for:

- small or moderate non-core improvements
- documentation contributions
- tests, examples, and low-risk fixes
- contributions that the maintainer is comfortable including under a broad commercial license grant without taking direct ownership

## 4. When to Require Copyright Assignment

The maintainer should strongly consider a signed copyright assignment for:

- core product logic
- monetization-related features
- automated classification workflows
- proprietary integrations
- high-value refactors
- code expected to remain central to future commercial offerings
- contributions from recurring or significant external collaborators

## 5. Minimum Records to Keep

For each accepted outside contribution, the maintainer should retain:

- GitHub username
- legal name, if provided
- email address
- link to the pull request
- date of confirmation
- which legal documents were accepted
- any signed PDF, e-sign receipt, or email confirmation
- any employer or client authorization, if applicable

## 6. Recommended Acceptance Rule

Until a more formal legal operations workflow is adopted, the maintainer should use the following rule:

- no merge without PR legal confirmation
- no merge of important code without CLA confirmation
- no merge of strategic or core code without a signed assignment if the maintainer wants clean future commercialization or transfer rights

## 7. Practical Signature Methods

The maintainer may collect signatures using:

- a signed PDF
- DocuSign or a similar e-sign tool
- an email confirmation that clearly references the specific agreement and contribution
- a pull request comment only if the maintainer determines it is sufficient for the contribution at issue

For higher-value contributions, a signed PDF or formal e-sign workflow is strongly preferred.

## 8. Future Company Transfers

If the Project is later transferred, assigned, financed, or operated through a new company or affiliate, the maintainer should keep an organized record showing which rights were already licensed or assigned and which contributors, if any, still require follow-up documentation.

## 9. No Legal Advice

This workflow is an operational template only and does not replace advice from qualified legal counsel.
