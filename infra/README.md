# TaskFlow infrastructure (Terraform + GitHub Actions)

TaskFlow runs on AWS as:

- **CloudFront**: one distribution. `/` goes to a private S3 bucket (the Vite build); `/api/*` goes to the API host, never cached.
- **EC2 t4g (Graviton)**: runs the API container from ECR under systemd. The SQLite file is on a **separate encrypted EBS volume** at `/srv/taskflow/data`.
- **Backups**: daily EBS snapshots (DLM). Alarms auto-recover or reboot the instance.
- **No SSH**: use SSM Session Manager. **No AWS keys in GitHub**: GitHub OIDC roles only.

```
infra/
├── bootstrap/          run once, locally: state bucket, OIDC, ECR, IAM roles
├── modules/
│   ├── network/        VPC + one public subnet (AZ chosen where t4g exists)
│   ├── app_host/       EC2, EBS data volume, SG, IAM, user_data, DLM, alarms
│   ├── static_site/    S3 + CloudFront (two origins)
│   └── stack/          wires the above + SSM hand-off parameters
└── envs/
    ├── dev/            t4g.micro, 7-day retention
    └── prod/           t4g.small, 30-day retention, approval required
```

## Pipelines

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | PR, push | 47 backend tests, frontend build |
| `infra.yml` | PR / push touching `infra/**`, weekday cron | fmt + Checkov, then plan dev → plan prod. On `main`: apply dev, then apply prod **after approval**, using the saved plan. The cron run opens an issue on drift. |
| `deploy-app.yml` | push touching `backend/**` or `frontend/**`, manual | tests → arm64 image to ECR (tag = commit SHA) → dev → prod (**approval**). Restarts the container through SSM, uploads the frontend to S3, invalidates CloudFront, smoke tests, and rolls the API back automatically on failure. |

Terraform hands values to the deploy workflow through SSM Parameter Store (`/taskflow/<env>/deploy_config` and `/taskflow/<env>/image_tag`), so releases never touch Terraform state.

## One-time setup

You need: AWS admin credentials locally, Terraform ≥ 1.11, the `gh` CLI (repo admin), and `jq`.

```bash
# 0. Format check (CI runs `terraform fmt -check`)
terraform fmt -recursive infra

# 1. Bootstrap (state bucket, OIDC provider, ECR, roles)
cd infra/bootstrap
terraform init
terraform apply            # if the account already has a GitHub OIDC provider:
                           #   terraform apply -var create_oidc_provider=false
cd ../..

# 2. GitHub environments + variables from the bootstrap outputs
./scripts/configure-github.sh towsonTigers/mockSQLLite_demo

# 3. Lock provider versions for every platform and commit the lock files
for e in dev prod; do
  (cd infra/envs/$e && terraform init -backend=false \
     && terraform providers lock -platform=linux_amd64 -platform=linux_arm64 -platform=darwin_arm64 -platform=darwin_amd64)
done

# 4. Protect main (Settings > Branches): require PR + status checks.
#    Environments are set to deploy only from protected branches.

# 5. Commit and push via a PR. The PR shows the dev/prod plans; merging applies dev,
#    then prod after you approve. Then push any backend/ change (or run
#    "Deploy app" manually) to ship the first image.
```

The bootstrap state file stays local (`infra/bootstrap/terraform.tfstate`, git-ignored). Keep it safe, or move it into the state bucket. The steps are in the comment in `bootstrap/main.tf`.

### GitHub variables (set by the script)

| Scope | Name | Used by |
|---|---|---|
| repo | `AWS_REGION`, `TF_STATE_BUCKET`, `TF_PLAN_ROLE_ARN`, `ECR_PUSH_ROLE_ARN` | plan, image build |
| env `dev` / `prod` | `TF_APPLY_ROLE_ARN`, `DEPLOY_ROLE_ARN` | apply, deploy |

## Day-2 operations

| Task | How |
|---|---|
| Roll back | Actions → **Deploy app** → Run workflow → enter an older commit SHA |
| Shell on host | `aws ssm start-session --target <instance_id>` |
| App logs | CloudWatch Logs `/taskflow/<env>/app`, or on host `journalctl -u taskflow` |
| Patch OS / new AMI | `terraform apply -replace=module.stack.module.app_host.aws_instance.app` (data volume is kept), or `dnf upgrade` via SSM Patch Manager |
| Restore data | Create a volume from the latest `taskflow-<env>` snapshot in the same AZ, then swap it into state with `terraform import` |
| Alarm email | set `alarm_email` in `envs/<env>/terraform.tfvars` and confirm the subscription email |
| Custom domain | ACM cert in us-east-1, then set `domain_aliases` + `acm_certificate_arn` in tfvars, then add a Route 53 alias |
| Tear down an env | remove `prevent_destroy` from `aws_ebs_volume.data` (protects the DB), then `terraform destroy` locally |

## Cost (per environment, us-east-1, approximate)

t4g.small ≈ $12.30 · public IPv4 ≈ $3.65 · EBS + snapshots ≈ $2 · S3/CloudFront/ECR/logs ≈ $1–3 → **≈ $20/month** (dev on t4g.micro ≈ $14). No NAT gateway or load balancer.

## Known limits / next hardening steps

- One instance: a deploy restarts the container (a few seconds of 502s). For zero downtime, move data to RDS/Aurora and the API to ECS behind an ALB.
- CloudFront → origin is HTTP inside AWS (limited by security group to CloudFront IPs). Move to a CloudFront VPC origin or an ALB with ACM for end-to-end TLS.
- Checkov skips are listed with reasons in `/.checkov.yaml` (KMS CMKs, access logs, WAF, flow logs).
- The plan role has AWS `ReadOnlyAccess`, so any PR workflow can read resources in the account. Use a separate AWS account per environment for stronger isolation.
