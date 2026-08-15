import type { ProviderCapability } from '@packkit/core';
import { supports } from './supports.js';
import { prepare } from './prepare.js';
import { plan } from './plan.js';
import { AwsProviderError } from './errors.js';

export { supports, prepare, plan, AwsProviderError };
export { awsName, resolveOptions } from './options.js';
export { PLAN_SCHEMA_VERSION } from './plan.js';
export type * from './types.js';

// A provider is `provider × DeploymentContract`, never `provider × language`: the
// same static contract from create-packkit (JS), create-packkit-py, or
// create-packkit-go produces the same AWS infrastructure.
//
// This provider is IaC-emitting: `prepare` returns OpenTofu/Terraform + a GitHub
// Actions pipeline that deploys via OIDC. Unlike an API-driven provider there is no
// runtime `apply` here — the emitted pipeline (or a human running `tofu apply`) does
// the provisioning, so this package never holds AWS credentials. A future `apply()`
// bound to an injected `tofu` runner can be added the same way provider-netlify
// injects its client.
export interface AwsProvider {
	id: 'aws';
	/** No runtime `apply` — the emitted pipeline deploys. Only `plan` is advertised. */
	capabilities: ProviderCapability[];
	supports: typeof supports;
	prepare: typeof prepare;
	plan: typeof plan;
}

export function createAwsProvider(): AwsProvider {
	return { id: 'aws', capabilities: ['plan'], supports, prepare, plan };
}
