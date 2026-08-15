import { describe, it, expect } from 'vitest';
import { prepare } from './prepare.js';
import { AwsProviderError } from './errors.js';
import { projectWith, staticContract } from './test-helpers.js';

const opts = {
	name: 'my-site',
	region: 'us-east-1',
	repository: { owner: 'PackkitLabs', name: 'demo' },
};

describe('prepare', () => {
	it('emits the infra + pipeline file set', () => {
		const { files } = prepare({ project: projectWith(staticContract), options: opts });
		expect(Object.keys(files).sort()).toEqual(
			[
				'.github/workflows/deploy.yml',
				'infra/.gitignore',
				'infra/.tflint.hcl',
				'infra/README.md',
				'infra/backend.tf',
				'infra/bootstrap/main.tf',
				'infra/bootstrap/outputs.tf',
				'infra/bootstrap/provider.tf',
				'infra/bootstrap/variables.tf',
				'infra/bootstrap/versions.tf',
				'infra/main.tf',
				'infra/outputs.tf',
				'infra/provider.tf',
				'infra/variables.tf',
				'infra/versions.tf',
			].sort(),
		);
	});

	it('throws a typed error for a non-deployable contract', () => {
		expect(() => prepare({ project: projectWith({ type: 'library' }), options: opts })).toThrow(
			AwsProviderError,
		);
	});

	it('emits App Runner infra for a service contract', () => {
		const service = {
			type: 'service',
			runtime: 'node',
			defaultPort: 8080,
			portEnvironmentVariable: 'PORT',
			healthCheckPath: '/healthz',
		};
		const { files } = prepare({ project: projectWith(service), options: opts });
		expect(files['infra/ecr.tf']).toContain('aws_ecr_repository');
		expect(files['infra/main.tf']).toContain('aws_apprunner_service');
		expect(files['infra/main.tf']).toContain('path                = "/healthz"');
		expect(files['infra/main.tf']).not.toContain('aws_nat_gateway'); // no NAT cost trap
		expect(files['.github/workflows/deploy.yml']).toContain('docker push');
	});

	it('emits ECS Fargate infra (no NAT) for a worker contract', () => {
		const worker = {
			type: 'worker',
			runtime: 'python-3.12',
			requiredEnvironmentVariables: ['QUEUE_URL'],
		};
		const { files } = prepare({ project: projectWith(worker), options: opts });
		expect(files['infra/main.tf']).toContain('aws_ecs_service');
		expect(files['infra/network.tf']).toContain('aws_internet_gateway');
		expect(files['infra/network.tf']).not.toContain('aws_nat_gateway'); // public subnets, no NAT
		expect(files['infra/main.tf']).toContain('retention_in_days = 30'); // explicit log retention
		expect(files['infra/bootstrap/main.tf']).toContain('ecs:*'); // deploy role scoped to archetype
	});

	it('reads only the contract — extra project fields never change the output', () => {
		const a = prepare({
			project: projectWith(staticContract, { language: 'go', name: 'x' }),
			options: opts,
		});
		const b = prepare({
			project: projectWith(staticContract, { language: 'python', framework: 'flask' }),
			options: opts,
		});
		expect(a.files).toEqual(b.files);
	});

	it('is deterministic', () => {
		expect(prepare({ project: projectWith(staticContract), options: opts }).files).toEqual(
			prepare({ project: projectWith(staticContract), options: opts }).files,
		);
	});

	it('uses modern, cost-conscious, secure defaults', () => {
		const { files } = prepare({ project: projectWith(staticContract), options: opts });
		const main = files['infra/main.tf'];
		const backend = files['infra/backend.tf'];
		const bootstrap = files['infra/bootstrap/main.tf'];

		expect(main).toContain('aws_cloudfront_origin_access_control'); // OAC, not legacy OAI
		expect(main).toContain('restrict_public_buckets = true'); // bucket stays private
		expect(main).toContain('PriceClass_100'); // cheapest edge tier
		expect(backend).toContain('use_lockfile = true'); // native locking…
		expect(bootstrap).not.toContain('dynamodb'); // …no DynamoDB table
		expect(bootstrap).toContain('aws_iam_openid_connect_provider'); // OIDC, no static keys
		expect(bootstrap).toContain('repo:${var.github_repository}:*'); // trust scoped to the repo
	});

	it('OIDC trust matches immutable subject claims and does not pin a thumbprint', () => {
		const bootstrap = prepare({ project: projectWith(staticContract), options: opts }).files[
			'infra/bootstrap/main.tf'
		];
		// Immutable subject format (repos created/renamed after 2026-07-15): owner@<id>/repo@<id>.
		// The '@' can't appear in a GitHub name, so its presence in the sub condition is the tell.
		expect(bootstrap).toContain('@*/');
		expect(bootstrap).toContain('repo:${local.github_owner}@*/${local.github_repo}@*:*');
		expect(bootstrap).toContain('repo:${var.github_repository}:*'); // legacy format still accepted
		// AWS manages GitHub's cert chain — no pinned thumbprint, and drift is suppressed.
		expect(bootstrap).not.toMatch(/thumbprint_list\s*=\s*\[/);
		expect(bootstrap).toContain('ignore_changes = [thumbprint_list]');
	});

	it('bakes the repository into the bootstrap variable default when provided', () => {
		const { files } = prepare({ project: projectWith(staticContract), options: opts });
		expect(files['infra/bootstrap/variables.tf']).toContain('default     = "PackkitLabs/demo"');
	});

	it('requires an options.name', () => {
		const badOptions = { region: 'us-east-1' } as unknown as Parameters<
			typeof prepare
		>[0]['options'];
		expect(() => prepare({ project: projectWith(staticContract), options: badOptions })).toThrow(
			AwsProviderError,
		);
	});
});
