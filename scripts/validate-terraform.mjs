// Real-toolchain proof: emit a sample project's infra with the built provider, then
// run the same checks the generated pipeline runs — `tofu fmt`, `tofu validate` — on
// both the main config and the bootstrap module. Requires `tofu` on PATH (CI installs
// it via opentofu/setup-opentofu). Uses -backend=false so no AWS account is touched.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { prepare } from '../dist/index.js';

// One contract per archetype — the same checks the generated pipeline runs, across
// every shape the provider emits.
const CONTRACTS = {
	static: { type: 'static', buildCommand: 'npm run build', outputDirectory: 'dist' },
	service: {
		type: 'service',
		runtime: 'node',
		startCommand: 'node dist/index.js',
		defaultPort: 8080,
		portEnvironmentVariable: 'PORT',
		healthCheckPath: '/healthz',
		requiredEnvironmentVariables: ['DATABASE_URL'],
		optionalEnvironmentVariables: ['LOG_LEVEL'],
	},
	worker: {
		type: 'worker',
		runtime: 'python-3.12',
		startCommand: 'python -m worker',
		requiredEnvironmentVariables: ['QUEUE_URL'],
		optionalEnvironmentVariables: ['WORKER_MAX_ATTEMPTS'],
	},
};

const sh = (cmd, args, cwd, root) => {
	process.stdout.write(`\n$ ${cmd} ${args.join(' ')}   (${cwd.replace(root, '.')})\n`);
	execFileSync(cmd, args, { cwd, stdio: 'inherit' });
};

function validate(archetype, contract) {
	const { files } = prepare({
		project: { deploymentContract: contract },
		options: {
			name: `sample-${archetype}`,
			region: 'us-east-1',
			repository: { owner: 'PackkitLabs', name: 'sample' },
		},
	});
	const root = mkdtempSync(join(tmpdir(), `provider-aws-${archetype}-`));
	try {
		for (const [rel, contents] of Object.entries(files)) {
			const abs = join(root, rel);
			mkdirSync(dirname(abs), { recursive: true });
			writeFileSync(abs, contents);
		}
		console.log(`\n=== ${archetype}: emitted ${Object.keys(files).length} files ===`);
		sh('tofu', ['fmt', '-check', '-recursive'], join(root, 'infra'), root);
		for (const dir of ['infra', 'infra/bootstrap']) {
			const cwd = join(root, dir);
			sh('tofu', ['init', '-backend=false', '-no-color'], cwd, root);
			sh('tofu', ['validate', '-no-color'], cwd, root);
		}
		console.log(`=== ${archetype}: PASS ===`);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

for (const [archetype, contract] of Object.entries(CONTRACTS)) {
	validate(archetype, contract);
}
console.log('\n✓ terraform: all archetypes fmt-clean + valid');
