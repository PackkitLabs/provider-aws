import { describe, it, expect } from 'vitest';
import { supports, assertSupported } from './supports.js';
import { AwsProviderError } from './errors.js';
import { staticContract } from './test-helpers.js';

describe('supports', () => {
	it('accepts a complete static contract', () => {
		expect(supports(staticContract)).toEqual({ supported: true, reasons: [] });
	});

	it('reports a missing contract', () => {
		expect(supports(undefined).reasons[0]?.code).toBe('MISSING_DEPLOYMENT_CONTRACT');
	});

	it('accepts service and worker contracts', () => {
		expect(
			supports({ type: 'service', runtime: 'node', defaultPort: 8080, healthCheckPath: '/healthz' })
				.supported,
		).toBe(true);
		expect(supports({ type: 'worker', runtime: 'python-3.12' }).supported).toBe(true);
	});

	it('reports non-deployable / deferred types as unsupported', () => {
		for (const type of ['fullstack', 'cli', 'library', 'nope']) {
			const result = supports({ type });
			expect(result.supported).toBe(false);
			expect(result.reasons[0]?.code).toBe('UNSUPPORTED_DEPLOYMENT_TYPE');
		}
	});

	it('reports an incomplete static contract', () => {
		expect(supports({ type: 'static' }).reasons[0]?.code).toBe('INCOMPLETE_STATIC_CONTRACT');
		expect(supports({ type: 'static', buildCommand: 'x' }).reasons[0]?.code).toBe(
			'INCOMPLETE_STATIC_CONTRACT',
		);
	});

	it('reports a service contract missing its port', () => {
		expect(supports({ type: 'service', runtime: 'node' }).reasons[0]?.code).toBe(
			'INCOMPLETE_SERVICE_CONTRACT',
		);
	});

	it('assertSupported throws a typed error for unsupported input', () => {
		expect(() => assertSupported({ type: 'library' })).toThrow(AwsProviderError);
		try {
			assertSupported({ type: 'library' });
		} catch (err) {
			expect((err as AwsProviderError).code).toBe('UNSUPPORTED_DEPLOYMENT_TYPE');
		}
	});
});
