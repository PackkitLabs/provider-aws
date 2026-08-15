import type { AwsPrepareOptions, PrepareResult, ProjectLike, ResolvedAwsOptions } from './types.js';
import { assertSupported } from './supports.js';
import { resolveOptions } from './options.js';
import { resolveArchetype, serviceView, workerView } from './archetype.js';
import {
	versionsTf,
	backendTf,
	providerTf,
	ecrTf,
	variablesTf,
	staticSiteTf,
	outputsTf,
	infraGitignore,
} from './terraform.js';
import { serviceVariablesTf, serviceMainTf, serviceOutputsTf } from './service.js';
import { workerVariablesTf, workerNetworkTf, workerMainTf, workerOutputsTf } from './worker.js';
import {
	bootstrapVersionsTf,
	bootstrapProviderTf,
	bootstrapVariablesTf,
	bootstrapMainTf,
	bootstrapOutputsTf,
} from './bootstrap.js';
import { deployWorkflow, tflintConfig } from './pipeline.js';
import { infraReadme } from './readme.js';

// Pure: derive the provider-owned files (OpenTofu config under `infra/` + a GitHub
// Actions deploy pipeline) from the project's deployment contract. No filesystem, no
// network — the host writes these into the repo, ideally via `@packkit/core/node`'s
// writer. Dispatches on the archetype the contract maps to; throws if unsupported.
export function prepare({
	project,
	options,
}: {
	project: ProjectLike;
	options: AwsPrepareOptions;
}): PrepareResult {
	const contract = project.deploymentContract;
	assertSupported(contract);
	const archetype = resolveArchetype(contract.type);
	const opts = resolveOptions(options);

	// Files common to every archetype: shared providers/backend, the bootstrap module
	// (deploy-role permissions vary by archetype), the pipeline, gitignore, and README.
	const files: Record<string, string> = {
		'infra/versions.tf': versionsTf(),
		'infra/backend.tf': backendTf(),
		'infra/provider.tf': providerTf(),
		'infra/.gitignore': infraGitignore(),
		'infra/.tflint.hcl': tflintConfig(),
		'infra/README.md': infraReadme(opts, archetype),
		'infra/bootstrap/versions.tf': bootstrapVersionsTf(),
		'infra/bootstrap/provider.tf': bootstrapProviderTf(),
		'infra/bootstrap/variables.tf': bootstrapVariablesTf(opts),
		'infra/bootstrap/main.tf': bootstrapMainTf(archetype),
		'infra/bootstrap/outputs.tf': bootstrapOutputsTf(),
		'.github/workflows/deploy.yml': deployWorkflow(opts, archetype),
	};

	Object.assign(files, archetypeFiles(archetype, opts, contract));
	return { files };
}

function archetypeFiles(
	archetype: ReturnType<typeof resolveArchetype>,
	opts: ResolvedAwsOptions,
	contract: ProjectLike['deploymentContract'],
): Record<string, string> {
	if (archetype === 'static-site') {
		return {
			'infra/variables.tf': variablesTf(opts),
			'infra/main.tf': staticSiteTf(),
			'infra/outputs.tf': outputsTf(),
		};
	}
	if (archetype === 'service') {
		return {
			'infra/variables.tf': serviceVariablesTf(opts),
			'infra/ecr.tf': ecrTf(),
			'infra/main.tf': serviceMainTf(serviceView(contract)),
			'infra/outputs.tf': serviceOutputsTf(),
		};
	}
	// worker
	return {
		'infra/variables.tf': workerVariablesTf(opts),
		'infra/ecr.tf': ecrTf(),
		'infra/network.tf': workerNetworkTf(),
		'infra/main.tf': workerMainTf(workerView(contract)),
		'infra/outputs.tf': workerOutputsTf(),
	};
}
