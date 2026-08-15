import type { DeploymentType } from '@packkit/core';
import type { DeploymentContractLike, SupportResult } from './types.js';
import { AwsProviderError } from './errors.js';

// Support detection reads only the provider-neutral `@packkit/core` deployment
// contract a generator derives — never raw config, frameworks, or the language.
// Any generator's static contract is supported identically.
//
// Supported archetypes: `static` (S3 + CloudFront), `service` (App Runner), and
// `worker` (ECS Fargate). A `fullstack` contract carries a static frontend + a
// service backend; deploying it is a deliberate later decision, so it is reported
// unsupported rather than half-deployed. `cli`/`library` are non-deployable.
const SUPPORTED_TYPES: ReadonlySet<string> = new Set<DeploymentType>([
	'static',
	'service',
	'worker',
]);

export function supports(contract: DeploymentContractLike | undefined): SupportResult {
	if (!contract || typeof contract.type !== 'string') {
		return unsupported('MISSING_DEPLOYMENT_CONTRACT', 'No deployment contract was provided.');
	}
	if (!SUPPORTED_TYPES.has(contract.type)) {
		return unsupported(
			'UNSUPPORTED_DEPLOYMENT_TYPE',
			`The AWS provider supports 'static', 'service', and 'worker' deployments; got '${contract.type}'.`,
		);
	}
	if (contract.type === 'static' && (!contract.buildCommand || !contract.outputDirectory)) {
		return unsupported(
			'INCOMPLETE_STATIC_CONTRACT',
			'The static contract is missing buildCommand or outputDirectory.',
		);
	}
	if (contract.type === 'service' && typeof contract.defaultPort !== 'number') {
		return unsupported(
			'INCOMPLETE_SERVICE_CONTRACT',
			'The service contract is missing a numeric defaultPort.',
		);
	}
	return { supported: true, reasons: [] };
}

/** Throw a typed error unless the contract is a supported deployment. */
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
