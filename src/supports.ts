import type { DeploymentType } from '@packkit/core';
import type { DeploymentContractLike, SupportResult } from './types.js';
import { AwsProviderError } from './errors.js';

// Support detection reads only the provider-neutral `@packkit/core` deployment
// contract a generator derives — never raw config, frameworks, or the language.
// Any generator's static contract is supported identically.
//
// 0.1.0 supports a single static site (S3 + CloudFront). `service` (Fargate) and
// `worker` (ECS/Lambda) land in later versions; a `fullstack` contract carries a
// static frontend + a service backend, but deploying it is a deliberate later
// decision, so it is reported unsupported rather than half-deployed.
const SUPPORTED_TYPES: ReadonlySet<string> = new Set<DeploymentType>(['static']);

export function supports(contract: DeploymentContractLike | undefined): SupportResult {
	if (!contract || typeof contract.type !== 'string') {
		return unsupported('MISSING_DEPLOYMENT_CONTRACT', 'No deployment contract was provided.');
	}
	if (!SUPPORTED_TYPES.has(contract.type)) {
		return unsupported(
			'UNSUPPORTED_DEPLOYMENT_TYPE',
			`The AWS provider (0.1.0) supports only 'static' deployments; got '${contract.type}'.`,
		);
	}
	if (!contract.buildCommand || !contract.outputDirectory) {
		return unsupported(
			'INCOMPLETE_STATIC_CONTRACT',
			'The static contract is missing buildCommand or outputDirectory.',
		);
	}
	return { supported: true, reasons: [] };
}

/** Throw a typed error unless the contract is a supported static site. */
export function assertSupported(contract: DeploymentContractLike | undefined): void {
	const check = supports(contract);
	if (!check.supported) {
		const reason = check.reasons[0];
		throw new AwsProviderError(
			reason?.code ?? 'UNSUPPORTED_PROJECT',
			reason?.message ?? 'The project is not supported.',
		);
	}
}

const unsupported = (code: string, message: string): SupportResult => ({
	supported: false,
	reasons: [{ code, message }],
});
