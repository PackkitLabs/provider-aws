import type { AwsArchetype, DeploymentContractLike, ServiceView, WorkerView } from './types.js';
import { AwsProviderError } from './errors.js';

// A deployment contract type maps to exactly one AWS archetype — the shape of infra
// we emit. The mapping is the whole provider abstraction: a `service` contract is a
// `service` archetype whether the app is Node, Python, or Go.
const TYPE_TO_ARCHETYPE: Record<string, AwsArchetype> = {
	static: 'static-site',
	service: 'service',
	worker: 'worker',
};

export function resolveArchetype(type: string): AwsArchetype {
	const archetype = TYPE_TO_ARCHETYPE[type];
	if (!archetype) {
		throw new AwsProviderError(
			'UNSUPPORTED_DEPLOYMENT_TYPE',
			`No AWS archetype for deployment type '${type}'.`,
		);
	}
	return archetype;
}

/** Normalize a service contract's provider-neutral fields (with safe fallbacks). */
export function serviceView(contract: DeploymentContractLike): ServiceView {
	return {
		port: typeof contract.defaultPort === 'number' ? contract.defaultPort : 8080,
		portEnv: contract.portEnvironmentVariable ?? 'PORT',
		healthCheckPath: contract.healthCheckPath ?? '/',
		requiredEnv: contract.requiredEnvironmentVariables ?? [],
		optionalEnv: contract.optionalEnvironmentVariables ?? [],
		runtime: contract.runtime ?? 'container',
	};
}

/** Normalize a worker contract's provider-neutral fields. */
export function workerView(contract: DeploymentContractLike): WorkerView {
	return {
		requiredEnv: contract.requiredEnvironmentVariables ?? [],
		optionalEnv: contract.optionalEnvironmentVariables ?? [],
		runtime: contract.runtime ?? 'container',
	};
}
