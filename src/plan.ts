import type { AwsArchetype, AwsPlan, AwsPrepareOptions, ProjectLike } from './types.js';
import { assertSupported } from './supports.js';
import { resolveOptions } from './options.js';
import { resolveArchetype } from './archetype.js';
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
	const archetype = resolveArchetype(project.deploymentContract.type);
	const opts = resolveOptions(options);
	const { files } = prepare({ project, options });

	return {
		provider: 'aws',
		archetype,
		region: opts.region,
		name: opts.name,
		repository: opts.repository,
		files,
		resources: [...RESOURCES[archetype], ...BOOTSTRAP_RESOURCES],
	};
}

const RESOURCES: Record<AwsArchetype, string[]> = {
	'static-site': [
		'S3 bucket (private, versioned, AES256) for the site assets',
		'CloudFront distribution with Origin Access Control (HTTPS, SPA fallbacks)',
		'S3 bucket policy scoped to this distribution',
	],
	service: [
		'ECR repository (untagged images expire) for the service image',
		'App Runner service (managed HTTPS, autoscaling, health check) + ECR access role',
	],
	worker: [
		'ECR repository for the worker image',
		'Minimal VPC: public subnets + internet gateway, no NAT gateway',
		'ECS Fargate cluster + task definition + service (desired_count 1, egress-only)',
		'CloudWatch log group with 30-day retention',
	],
};

const BOOTSTRAP_RESOURCES = [
	'[bootstrap] S3 state bucket with native lockfile (no DynamoDB)',
	'[bootstrap] GitHub OIDC provider + repo-scoped IAM deploy role',
];
