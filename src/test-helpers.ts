import type { DeploymentContractLike, ProjectLike } from './types.js';

/** A minimal project carrying just a deployment contract, plus arbitrary extra
 *  fields, to prove the provider reads only the contract (never the language). */
export function projectWith(
	contract: DeploymentContractLike,
	extra: Record<string, unknown> = {},
): ProjectLike {
	return { deploymentContract: contract, ...extra };
}

export const staticContract: DeploymentContractLike = {
	type: 'static',
	buildCommand: 'npm run build',
	outputDirectory: 'dist',
};
