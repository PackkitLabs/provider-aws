import { describe, it } from 'vitest';
import { runProviderConformanceSuite } from '@packkit/core/testing';
import type { PackkitProvider } from '@packkit/core';
import { createAwsProvider } from './index.js';
import { staticContract } from './test-helpers.js';

// provider-aws dogfoods @packkit/core's provider conformance suite — the same suite
// provider-netlify passes — proving it's a well-behaved provider (stable id,
// deterministic support/plan, serializable schema-versioned plan, apply capability-gated).
// AWS advertises only `plan` (IaC-emitting; no runtime apply), and the suite honors that.
describe('provider-aws conforms to the @packkit/core provider contract', () => {
	runProviderConformanceSuite(
		{
			// aws's supports/plan take narrower param types than the generic contract; the
			// cast reconciles the variance (runtime behavior is identical).
			provider: createAwsProvider() as unknown as PackkitProvider,
			supportedContract: staticContract,
			unsupportedContract: { type: 'library' },
			planInput: () => ({
				project: { deploymentContract: staticContract },
				options: {
					name: 'demo',
					region: 'us-east-1',
					repository: { owner: 'PackkitLabs', name: 'demo' },
				},
			}),
			// The plan must never embed credentials (AWS auth is OIDC at deploy time).
			secrets: ['AKIAIOSFODNN7EXAMPLE'],
		},
		(name, fn) => it(name, fn),
	);
});
