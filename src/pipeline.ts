import type { AwsArchetype, ResolvedAwsOptions } from './types.js';

// The deploy pipeline: fmt + lint + validate + plan on PRs, apply on merge to the
// default branch — authenticating to AWS via GitHub OIDC (assume-role, no stored
// keys). The role ARN and state bucket come from the bootstrap outputs, set as repo
// variables (AWS_DEPLOY_ROLE_ARN / AWS_STATE_BUCKET), so nothing secret is committed.
// Uses OpenTofu.
//
// Static sites apply directly. Container archetypes (service/worker) build and push a
// Docker image to ECR first — ECR is created on its own so the image can be pushed
// before the App Runner / ECS resources that reference it exist (the image chicken-
// and-egg), then the full apply points at the new tag.

const HEADER = (region: string) => `name: Deploy (AWS)

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
  AWS_REGION: ${region}

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
`;

const APPLY_GUARD = "if: github.event_name == 'push' && github.ref == 'refs/heads/main'";

const staticApply = `
      - name: Apply
        ${APPLY_GUARD}
        run: tofu apply -auto-approve -input=false

      - name: Publish site
        ${APPLY_GUARD}
        run: |
          # TODO: build your site, then sync it to the bucket and invalidate the CDN:
          #   aws s3 sync ../<build-output>/ "s3://$(tofu output -raw bucket_name)/" --delete
          #   aws cloudfront create-invalidation --distribution-id "$(tofu output -raw distribution_id)" --paths '/*'
          echo "Wire your build output into this step (see infra/README.md)."
`;

const containerApply = `
      - name: Ensure ECR exists
        ${APPLY_GUARD}
        run: tofu apply -auto-approve -input=false -target=aws_ecr_repository.app

      - name: Build & push image
        ${APPLY_GUARD}
        run: |
          ECR="$(tofu output -raw ecr_repository_url)"
          aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "\${ECR%/*}"
          docker build -t "$ECR:$GITHUB_SHA" ..
          docker push "$ECR:$GITHUB_SHA"

      - name: Apply
        ${APPLY_GUARD}
        run: tofu apply -auto-approve -input=false -var="image_tag=$GITHUB_SHA"
`;

export function deployWorkflow(opts: ResolvedAwsOptions, archetype: AwsArchetype): string {
	const apply = archetype === 'static-site' ? staticApply : containerApply;
	return HEADER(opts.region) + apply;
}

export function tflintConfig(): string {
	return `plugin "aws" {
  enabled = true
  version = "0.30.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}
`;
}
