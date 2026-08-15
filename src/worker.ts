import type { ResolvedAwsOptions, WorkerView } from './types.js';
import { baseVariables } from './terraform.js';

// The `worker` archetype → ECS Fargate. A worker is a long-running non-HTTP process
// (App Runner is request-driven, so it doesn't fit), so it runs as a Fargate service
// with desired_count = 1 and no load balancer. To avoid a NAT gateway (~$33/mo — a
// trap the scope issue called out), tasks run in **public subnets with a public IP**
// but an **egress-only security group**: they can pull the image and make outbound
// connections, but nothing can reach them. Logs go to a group with explicit retention.

export function workerVariablesTf(opts: ResolvedAwsOptions): string {
	return `${baseVariables(opts)}
variable "image_tag" {
  description = "The ECR image tag the worker runs (CI sets this to the commit SHA)."
  type        = string
  default     = "latest"
}
`;
}

export function workerNetworkTf(): string {
	return `# Minimal VPC with public subnets only — no NAT gateway, no private subnets.
data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = var.name }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "\${var.name}-public-\${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Egress-only: the worker reaches out (queues, APIs); nothing reaches in.
resource "aws_security_group" "worker" {
  name   = "\${var.name}-worker"
  vpc_id = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
`;
}

export function workerMainTf(view: WorkerView): string {
	const envList = [...view.requiredEnv, ...view.optionalEnv];
	const envHcl = envList.length
		? `\n    environment = [\n${envList.map((n) => `      { name = "${n}", value = "" }`).join(',\n')}\n    ]`
		: '';

	return `resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/\${var.name}"
  retention_in_days = 30
}

resource "aws_ecs_cluster" "main" {
  name = var.name
}

# Pulls the image and writes logs.
resource "aws_iam_role" "task_execution" {
  name = "\${var.name}-task-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# The worker's own runtime permissions — empty by default; add what your app needs.
resource "aws_iam_role" "task" {
  name = "\${var.name}-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_ecs_task_definition" "worker" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = var.name
    image     = "\${aws_ecr_repository.app.repository_url}:\${var.image_tag}"
    essential = true${envHcl}
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])
}

resource "aws_ecs_service" "worker" {
  name            = var.name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.worker.id]
    assign_public_ip = true
  }
}
`;
}

export function workerOutputsTf(): string {
	return `output "cluster_name" {
  description = "The ECS cluster running the worker service."
  value       = aws_ecs_cluster.main.name
}

output "ecr_repository_url" {
  description = "Push the worker image here (CI does this before apply)."
  value       = aws_ecr_repository.app.repository_url
}
`;
}
