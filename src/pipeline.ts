import type { ResolvedAwsOptions } from './types.js';

// The deploy pipeline: fmt + validate + tflint + plan on PRs, apply on merge to the
// default branch — authenticating to AWS via GitHub OIDC (assume-role, no stored
// keys). The role ARN and state bucket come from the bootstrap outputs and are set
// as repo variables (AWS_DEPLOY_ROLE_ARN / AWS_STATE_BUCKET), so nothing secret is
// committed. Uses OpenTofu; swap `tofu` for `terraform` if you prefer.

export function deployWorkflow(opts: ResolvedAwsOptions): string {
	return `name: Deploy (AWS)

on:
  push:
    branches: [main]
  pull_request:

# OIDC needs id-token: write; the rest stay least-privilege.
permissions:
  contents: read
  id-token: write

concurrency: deploy-\${{ github.ref }}

env:
  AWS_REGION: ${opts.region}

jobs:
  terraform:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: infra
    steps:
      - uses: actions/checkout@v7

      - uses: opentofu/setup-opentofu@v1
      - uses: terraform-linters/setup-tflint@v4

      - name: Format
        run: tofu fmt -check -recursive

      - name: Lint
        run: |
          tflint --init
          tflint --recursive

      - name: AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: \${{ env.AWS_REGION }}

      - name: Init
        run: tofu init -backend-config="bucket=\${{ vars.AWS_STATE_BUCKET }}" -backend-config="region=\${{ env.AWS_REGION }}"

      - name: Validate
        run: tofu validate

      - name: Plan
        if: github.event_name == 'pull_request'
        run: tofu plan -no-color -input=false

      - name: Apply
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        run: tofu apply -auto-approve -input=false
`;
}

export function tflintConfig(): string {
	return `plugin "aws" {
  enabled = true
  version = "0.30.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}
`;
}
