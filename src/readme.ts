import type { ResolvedAwsOptions } from './types.js';

// The infra/README that ships alongside the emitted Terraform: the two-step
// bootstrap (the chicken-and-eggs), what CI does, and the cost footprint — the
// traps the original scope issue flagged (state bootstrap, OIDC, surprise bills).
export function infraReadme(opts: ResolvedAwsOptions): string {
	const repo = opts.repository
		? `${opts.repository.owner}/${opts.repository.name}`
		: '<owner>/<repo>';
	return `# Infrastructure — static site on AWS (S3 + CloudFront)

Emitted by [\`@packkit/provider-aws\`](https://github.com/PackkitLabs/provider-aws) from this
project's \`static\` deployment contract. OpenTofu (or Terraform), fronted by a GitHub
Actions pipeline that authenticates with **OIDC — no long-lived AWS keys**.

## One-time bootstrap (run by a human with admin credentials)

The state bucket and the CI deploy role can't deploy themselves, so create them first:

\`\`\`sh
cd infra/bootstrap
tofu init
tofu apply -var 'github_repository=${repo}'
\`\`\`

This creates the Terraform **state bucket**, the **GitHub OIDC provider**, and a
repo-scoped **IAM deploy role**. Note the two outputs, then set them as **repository
variables** (Settings → Secrets and variables → Actions → Variables):

- \`AWS_STATE_BUCKET\` = \`state_bucket\` output
- \`AWS_DEPLOY_ROLE_ARN\` = \`deploy_role_arn\` output

The bootstrap keeps **local state** (gitignored) — it changes rarely and is safe to
re-apply. Everything after this runs in CI with no admin keys.

## Deploying

Push to \`main\`. The pipeline (\`.github/workflows/deploy.yml\`) runs
\`fmt → lint → validate → plan\` on pull requests and \`apply\` on merge. After apply,
sync your build output to the \`bucket_name\` output and invalidate the
\`distribution_id\` — wire that into the same job once your build step is in place.

To run the main config locally:

\`\`\`sh
cd infra
tofu init -backend-config="bucket=<AWS_STATE_BUCKET>" -backend-config="region=${opts.region}"
tofu plan
\`\`\`

## Cost footprint

Deliberately lean — a static site should cost cents at low traffic:

- **S3** — pennies for storage/requests.
- **CloudFront** — pay-per-use, no fixed monthly fee; \`PriceClass_100\` limits edges to
  North America + Europe (cheapest tier).
- **State locking** uses S3's native lockfile — **no DynamoDB table** (no extra cost).
- **No NAT Gateway, no load balancer, no always-on compute** — none is needed for static
  hosting, and each would be a standing monthly charge.
`;
}
