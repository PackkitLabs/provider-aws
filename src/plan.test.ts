import { describe, it, expect } from 'vitest';
import { plan } from './plan.js';
import { AwsProviderError } from './errors.js';
import { projectWith, staticContract } from './test-helpers.js';

const opts = {
	name: 'My Site',
	region: 'eu-west-1',
	repository: { owner: 'PackkitLabs', name: 'demo' },
};

describe('plan', () => {
	it('produces a deterministic, auditable plan', () => {
		const p = plan({ project: projectWith(staticContract), options: opts });
		expect(p.provider).toBe('aws');
		expect(p.archetype).toBe('static-site');
		expect(p.region).toBe('eu-west-1');
		expect(p.name).toBe('my-site'); // normalized for AWS
		expect(p.repository).toEqual({ owner: 'PackkitLabs', name: 'demo', branch: 'main' });
		expect(p.resources.length).toBeGreaterThan(0);
		expect(p.files['infra/main.tf']).toBeTruthy();
	});

	it('is deterministic', () => {
		expect(plan({ project: projectWith(staticContract), options: opts })).toEqual(
			plan({ project: projectWith(staticContract), options: opts }),
		);
	});

	it('rejects an invalid region', () => {
		expect(() =>
			plan({ project: projectWith(staticContract), options: { name: 'x', region: 'nope' } }),
		).toThrow(AwsProviderError);
	});

	it('reports the archetype per contract type', () => {
		const svc = plan({
			project: projectWith({
				type: 'service',
				runtime: 'node',
				defaultPort: 8080,
				healthCheckPath: '/h',
			}),
			options: opts,
		});
		expect(svc.archetype).toBe('service');
		const wrk = plan({
			project: projectWith({ type: 'worker', runtime: 'go-1.23' }),
			options: opts,
		});
		expect(wrk.archetype).toBe('worker');
	});

	it('rejects an unsupported (non-deployable) contract', () => {
		expect(() => plan({ project: projectWith({ type: 'library' }), options: opts })).toThrow(
			AwsProviderError,
		);
	});
});
