// Real-toolchain proof: emit a sample project's infra with the built provider, then
// run the same checks the generated pipeline runs — `tofu fmt`, `tofu validate` — on
// both the main config and the bootstrap module. Requires `tofu` on PATH (CI installs
// it via opentofu/setup-opentofu). Uses -backend=false so no AWS account is touched.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { prepare } from '../dist/index.js';

const project = {
	deploymentContract: { type: 'static', buildCommand: 'npm run build', outputDirectory: 'dist' },
};
const { files } = prepare({
	project,
	options: {
		name: 'sample',
		region: 'us-east-1',
		repository: { owner: 'PackkitLabs', name: 'sample' },
	},
});

const root = mkdtempSync(join(tmpdir(), 'provider-aws-'));
try {
	for (const [rel, contents] of Object.entries(files)) {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, contents);
	}
	console.log(`emitted ${Object.keys(files).length} files → ${root}`);

	const sh = (cmd, args, cwd) => {
		process.stdout.write(`\n$ ${cmd} ${args.join(' ')}   (${cwd.replace(root, '.')})\n`);
		execFileSync(cmd, args, { cwd, stdio: 'inherit' });
	};

	// Formatting across the whole tree.
	sh('tofu', ['fmt', '-check', '-recursive'], join(root, 'infra'));

	// Validate each module (no backend, no provider credentials needed).
	for (const dir of ['infra', 'infra/bootstrap']) {
		const cwd = join(root, dir);
		sh('tofu', ['init', '-backend=false', '-no-color'], cwd);
		sh('tofu', ['validate', '-no-color'], cwd);
	}
	console.log('\n✓ terraform: fmt clean + both modules valid');
} finally {
	rmSync(root, { recursive: true, force: true });
}
