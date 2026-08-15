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

	it('throws a typed error for a non-static contract', () => {
		expect(() => prepare({ project: projectWith({ type: 'service' }), options: opts })).toThrow(
			AwsProviderError,
		);
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
