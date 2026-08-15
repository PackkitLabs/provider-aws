import type { ResolvedAwsOptions, ServiceView } from './types.js';
import { baseVariables } from './terraform.js';

// The `service` archetype → AWS App Runner. Chosen over ECS Fargate + ALB because it
// maps cleanly onto the language-neutral service contract (a container that listens on
// a port and answers a health-check path), includes managed HTTPS + autoscaling, and
// has **no VPC, no NAT gateway, no load balancer** — none of the standing-cost traps
// the scope issue flagged. The image lives in ECR; CI builds and pushes it, then
// `tofu apply` points App Runner at the new tag.

export function serviceVariablesTf(opts: ResolvedAwsOptions): string {
	return `${baseVariables(opts)}
variable "image_tag" {
  description = "The ECR image tag App Runner deploys (CI sets this to the commit SHA)."
  type        = string
  default     = "latest"
}
`;
}

export function serviceMainTf(view: ServiceView): string {
	const env = { [view.portEnv]: String(view.port) };
	const envHcl = Object.entries(env)
		.map(([k, v]) => `          ${k} = "${v}"`)
		.join('\n');

	return `# App Runner needs permission to pull the image from ECR.
resource "aws_iam_role" "apprunner_access" {
  name = "\${var.name}-apprunner-access"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "build.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_access" {
  role       = aws_iam_role.apprunner_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

resource "aws_apprunner_auto_scaling_configuration_version" "app" {
  auto_scaling_configuration_name = var.name
  min_size                        = 1
  max_size                        = 3
}

resource "aws_apprunner_service" "app" {
  service_name                   = var.name
  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.app.arn

  source_configuration {
    auto_deployments_enabled = false

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }

    image_repository {
      image_identifier      = "\${aws_ecr_repository.app.repository_url}:\${var.image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        port = "${view.port}"
        # The service reads its port from ${view.portEnv}. Add app secrets as
        # runtime_environment_secrets (SSM/Secrets Manager) — never plaintext here.
        runtime_environment_variables = {
${envHcl}
        }
      }
    }
  }

  instance_configuration {
    cpu    = "1024"
    memory = "2048"
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "${view.healthCheckPath}"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }
}
`;
}

export function serviceOutputsTf(): string {
	return `output "service_url" {
  description = "The App Runner service's HTTPS URL."
  value       = "https://\${aws_apprunner_service.app.service_url}"
}

output "ecr_repository_url" {
  description = "Push the service image here (CI does this before apply)."
  value       = aws_ecr_repository.app.repository_url
}
`;
}
