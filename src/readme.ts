import type { AwsArchetype, ResolvedAwsOptions } from './types.js';

// The infra/README that ships alongside the emitted Terraform: the two-step bootstrap
// (the chicken-and-eggs), what CI does, and the cost footprint — the traps the scope
// issue flagged (state bootstrap, OIDC, surprise bills). Adapts to the archetype.
export function infraReadme(opts: ResolvedAwsOptions, archetype: AwsArchetype): string {
	const repo = opts.repository
		? `${opts.repository.owner}/${opts.repository.name}`
		: '<owner>/<repo>';
	const title = {
		'static-site': 'static site on AWS (S3 + CloudFront)',
		service: 'HTTP service on AWS (App Runner)',
		worker: 'background worker on AWS (ECS Fargate)',
	}[archetype];

	return `# Infrastructure — ${title}

Emitted by [\`@packkit/provider-aws\`](https://github.com/PackkitLabs/provider-aws) from this
project's deployment contract. OpenTofu (or Terraform), fronted by a GitHub Actions
pipeline that authenticates with **OIDC — no long-lived AWS keys**.

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
\`fmt → lint → validate → plan\` on pull requests and \`apply\` on merge.
${deployNotes(archetype)}

## Cost footprint

${costNotes(archetype)}`;
}

function deployNotes(archetype: AwsArchetype): string {
	if (archetype === 'static-site') {
		return `
After apply, sync your build output to the \`bucket_name\` output and invalidate the
\`distribution_id\` — a placeholder step is wired in \`deploy.yml\` for your build command.`;
	}
	return `
On merge it creates the ECR repository, **builds and pushes your \`Dockerfile\`** image
(tagged with the commit SHA), then applies — pointing the ${
		archetype === 'service' ? 'App Runner service' : 'ECS service'
	} at the new image.`;
}

function costNotes(archetype: AwsArchetype): string {
	if (archetype === 'static-site') {
		return `Deliberately lean — a static site should cost cents at low traffic:

- **S3** — pennies for storage/requests.
- **CloudFront** — pay-per-use, no fixed monthly fee; \`PriceClass_100\` (NA + Europe edges).
- **State locking** uses S3's native lockfile — **no DynamoDB table**.
- **No NAT Gateway, no load balancer, no always-on compute** — none is needed for static.
`;
	}
	if (archetype === 'service') {
		return `App Runner keeps the moving parts (and cost traps) minimal:

- **App Runner** — managed HTTPS + autoscaling (min 1 instance); you pay for provisioned
  vCPU/memory + requests. No load balancer and **no NAT gateway or VPC** to run standing.
- **ECR** — pennies; untagged images expire after 14 days.
- **State locking** uses S3's native lockfile — **no DynamoDB table**.
`;
	}
	return `A single Fargate task, deliberately without the usual cost traps:

- **Fargate** — one \`256\`/\`512\` task (~a few dollars/month); scale via \`desired_count\`.
- **No NAT Gateway** — the task runs in a **public subnet with a public IP** (egress-only
  security group), so it pulls its image and reaches the internet without a ~$33/mo NAT.
- **Logs** go to a group with **explicit 30-day retention** (no never-expire surprise).
- **State locking** uses S3's native lockfile — **no DynamoDB table**.
`;
}
