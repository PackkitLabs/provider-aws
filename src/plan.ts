import type { AwsPlan, AwsPrepareOptions, ProjectLike } from './types.js';
import { assertSupported } from './supports.js';
import { resolveOptions } from './options.js';
import { prepare } from './prepare.js';

// Pure: a deterministic, human-auditable description of what applying the emitted
// infra creates — the files plus a plain-language resource list — without touching
// AWS. Same inputs → identical plan. Actual provisioning is `tofu apply`, run by the
// emitted pipeline (or a human); this provider never holds AWS credentials.
export function plan({
	project,
	options,
}: {
	project: ProjectLike;
	options: AwsPrepareOptions;
}): AwsPlan {
	assertSupported(project.deploymentContract);
	const opts = resolveOptions(options);
	const { files } = prepare({ project, options });

	return {
		provider: 'aws',
		archetype: 'static-site',
		region: opts.region,
		name: opts.name,
		repository: opts.repository,
		files,
		resources: [
			'S3 bucket (private, versioned, AES256) for the site assets',
			'CloudFront distribution with Origin Access Control (HTTPS, SPA fallbacks)',
			'S3 bucket policy scoped to this distribution',
			'[bootstrap] S3 state bucket with native lockfile (no DynamoDB)',
			'[bootstrap] GitHub OIDC provider + repo-scoped IAM deploy role',
		],
	};
}
