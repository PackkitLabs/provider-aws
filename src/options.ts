import type { AwsPrepareOptions, ResolvedAwsOptions } from './types.js';
import { AwsProviderError } from './errors.js';

// An AWS resource name fragment: lowercase alphanumerics and single hyphens, no
// leading/trailing hyphen. Used as the prefix for buckets, roles, and the OAC.
export function awsName(input: string): string {
	const cleaned = input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (!cleaned)
		throw new AwsProviderError('INVALID_NAME', `"${input}" has no usable AWS name characters.`);
	return cleaned;
}

/** Fill defaults and validate. `name` is required (the resource prefix); `region`
 *  defaults to us-east-1; `repository` is optional (emitted as a required Terraform
 *  variable when absent). */
export function resolveOptions(options: AwsPrepareOptions): ResolvedAwsOptions {
	if (!options || !options.name) {
		throw new AwsProviderError('MISSING_NAME', 'An options.name (resource prefix) is required.');
	}
	const region = options.region ?? 'us-east-1';
	if (!/^[a-z]{2}-[a-z]+-\d$/.test(region)) {
		throw new AwsProviderError(
			'INVALID_REGION',
			`"${region}" is not a valid AWS region (e.g. us-east-1).`,
		);
	}

	let repository;
	if (options.repository) {
		const { owner, name } = options.repository;
		if (!owner || !name) {
			throw new AwsProviderError('INVALID_REPOSITORY', 'repository requires both { owner, name }.');
		}
		repository = { owner, name, branch: options.repository.branch ?? 'main' };
	}

	return { name: awsName(options.name), region, repository };
}
