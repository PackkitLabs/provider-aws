import type { AwsPrepareOptions, PrepareResult, ProjectLike } from './types.js';
import { assertSupported } from './supports.js';
import { resolveOptions } from './options.js';
import {
	versionsTf,
	backendTf,
	providerTf,
	variablesTf,
	staticSiteTf,
	outputsTf,
	infraGitignore,
} from './terraform.js';
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
// Actions deploy pipeline) from the project's deployment contract. No filesystem,
// no network — the host writes these into the repo, ideally via `@packkit/core/node`'s
// writer for path-safety. Throws if the project isn't a supported static site.
export function prepare({
	project,
	options,
}: {
	project: ProjectLike;
	options: AwsPrepareOptions;
}): PrepareResult {
	assertSupported(project.deploymentContract);
	const opts = resolveOptions(options);

	return {
		files: {
			'infra/versions.tf': versionsTf(),
			'infra/backend.tf': backendTf(),
			'infra/provider.tf': providerTf(),
			'infra/variables.tf': variablesTf(opts),
			'infra/main.tf': staticSiteTf(),
			'infra/outputs.tf': outputsTf(),
			'infra/.gitignore': infraGitignore(),
			'infra/.tflint.hcl': tflintConfig(),
			'infra/README.md': infraReadme(opts),
			'infra/bootstrap/versions.tf': bootstrapVersionsTf(),
			'infra/bootstrap/provider.tf': bootstrapProviderTf(),
			'infra/bootstrap/variables.tf': bootstrapVariablesTf(opts),
			'infra/bootstrap/main.tf': bootstrapMainTf(),
			'infra/bootstrap/outputs.tf': bootstrapOutputsTf(),
			'.github/workflows/deploy.yml': deployWorkflow(opts),
		},
	};
}
