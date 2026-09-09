# Network layout is shaped by two cost decisions:
#
#   * No NAT gateway (~US$ 32/month, as much as the rest of the stack). The
#     application host sits in a public subnet with an Elastic IP and reaches
#     the internet through the internet gateway. RDS sits in private subnets
#     and needs no outbound access at all.
#   * No interface VPC endpoints (~US$ 7/month each). SSM, ECR, and Secrets
#     Manager are reached over the internet gateway using the instance role,
#     which is equivalent for our threat model: the traffic is TLS and
#     SigV4-signed either way.
#
# Two private subnets exist only because an RDS subnet group requires at least
# two availability zones, not because the database is Multi-AZ.

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name = "tyche-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "main" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = local.name }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = local.name }
}

resource "aws_subnet" "public" {
  count = 2

  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  map_public_ip_on_launch = false
  vpc_id                  = aws_vpc.main.id

  tags = { Name = "${local.name}-public-${local.azs[count.index]}" }
}

resource "aws_subnet" "private" {
  count = 2

  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 10)
  vpc_id            = aws_vpc.main.id

  tags = { Name = "${local.name}-private-${local.azs[count.index]}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  count = 2

  route_table_id = aws_route_table.public.id
  subnet_id      = aws_subnet.public[count.index].id
}

# The private subnets keep the VPC default route table, which has no route to
# the internet gateway. That is what makes the database unreachable from
# outside the VPC even if its security group were widened by mistake.

# ---------------------------------------------------------------------------
# Security groups
# ---------------------------------------------------------------------------
resource "aws_security_group" "app" {
  description = "Tyche application host. Public HTTP/HTTPS only; shell access is through SSM Session Manager, so there is no SSH rule."
  name        = "${local.name}-app"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-app" }
}

resource "aws_vpc_security_group_ingress_rule" "app_http" {
  # Port 80 exists for the ACME HTTP-01 challenge and for the automatic
  # HTTP-to-HTTPS redirect Caddy installs. No application traffic is served
  # over it.
  cidr_ipv4         = "0.0.0.0/0"
  description       = "ACME challenge and HTTPS redirect"
  from_port         = 80
  ip_protocol       = "tcp"
  security_group_id = aws_security_group.app.id
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "app_https" {
  cidr_ipv4         = "0.0.0.0/0"
  description       = "Public API and worker traffic"
  from_port         = 443
  ip_protocol       = "tcp"
  security_group_id = aws_security_group.app.id
  to_port           = 443
}

resource "aws_vpc_security_group_ingress_rule" "app_https_quic" {
  cidr_ipv4         = "0.0.0.0/0"
  description       = "HTTP/3 (QUIC) for the same public traffic"
  from_port         = 443
  ip_protocol       = "udp"
  security_group_id = aws_security_group.app.id
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  # Outbound is unrestricted by necessity: Solana RPC, the LLM providers, ECR,
  # SSM, Secrets Manager, and ACME are all external endpoints whose address
  # ranges are not stable enough to allowlist without breaking a live turn.
  cidr_ipv4         = "0.0.0.0/0"
  description       = "Solana RPC, LLM providers, AWS APIs, ACME"
  ip_protocol       = "-1"
  security_group_id = aws_security_group.app.id
}

resource "aws_security_group" "db" {
  description = "Postgres, reachable only from the application host."
  name        = "${local.name}-db"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-db" }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  description                  = "Postgres from the application host only"
  from_port                    = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.app.id
  security_group_id            = aws_security_group.db.id
  to_port                      = 5432
}

# ---------------------------------------------------------------------------
# DNS
# ---------------------------------------------------------------------------
resource "aws_route53_record" "api" {
  count = var.route53_zone_id == null ? 0 : 1

  name    = var.api_domain
  records = [aws_eip.app.public_ip]
  ttl     = 300
  type    = "A"
  zone_id = var.route53_zone_id
}

resource "aws_route53_record" "worker" {
  count = var.route53_zone_id == null ? 0 : 1

  name    = var.worker_domain
  records = [aws_eip.app.public_ip]
  ttl     = 300
  type    = "A"
  zone_id = var.route53_zone_id
}
