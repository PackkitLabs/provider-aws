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

	it('reports every non-static deployment type as unsupported (0.1.0)', () => {
		for (const type of ['service', 'worker', 'fullstack', 'cli', 'library']) {
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

	it('assertSupported throws a typed error for unsupported input', () => {
		expect(() => assertSupported({ type: 'service' })).toThrow(AwsProviderError);
		try {
			assertSupported({ type: 'service' });
		} catch (err) {
			expect((err as AwsProviderError).code).toBe('UNSUPPORTED_DEPLOYMENT_TYPE');
		}
	});
});
