<#
.SYNOPSIS
  Windows version of configure-github.sh: sets GitHub environments + variables
  from the infra/bootstrap Terraform outputs. No bash or jq needed.

.EXAMPLE
  # after `terraform apply` in infra\bootstrap; works from any folder
  powershell -ExecutionPolicy Bypass -File .\scripts\configure-github.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\configure-github.ps1 -Repo towsonTigers/mockSQLLite_demo
#>
param(
  [string]$Repo = "towsonTigers/mockSQLLite_demo"
)
$ErrorActionPreference = "Stop"

foreach ($tool in "gh", "terraform") {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "'$tool' is not on PATH. Install it, then open a NEW terminal."
  }
}

# Runs gh and, on failure, shows gh's own error text instead of hiding it.
function Invoke-Gh {
  # Plain function on purpose: every argument (including -X, --repo) goes to gh untouched.
  $ghArgs = @($args)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & gh @ghArgs 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) {
    throw "gh $($ghArgs[0..2] -join ' ') ... failed (exit $code):`n$($output -join "`n")"
  }
  return $output
}

# ---- pre-flight: logged in, repo reachable, enough permission
$prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
gh auth status 2>&1 | Out-Null
$authCode = $LASTEXITCODE
$ErrorActionPreference = $prev
if ($authCode -ne 0) { throw "gh is not logged in. Run: gh auth login   (GitHub.com > HTTPS > browser)" }

try {
  $perm = Invoke-Gh repo view $Repo --json viewerPermission --jq .viewerPermission
} catch {
  throw "Cannot see repo '$Repo' with your gh login. Check the name (owner/repo) and that you're logged in as its owner.`n$_"
}
Write-Host "gh login can access $Repo (permission: $perm)"
if ("$perm".Trim() -ne "ADMIN") {
  throw "You need ADMIN on $Repo to create environments and variables (you have: $perm)."
}

# Resolve infra\bootstrap from this script's location, so it runs from any folder.
$bootstrapDir = (Resolve-Path (Join-Path $PSScriptRoot "..\infra\bootstrap")).Path
$out = terraform "-chdir=$bootstrapDir" output -json | Out-String | ConvertFrom-Json
if (-not $out.plan_role_arn) {
  throw "No bootstrap outputs found. Run 'terraform apply' in infra\bootstrap first."
}

function Set-Var([string]$Name, [string]$Value, [string]$EnvName = "") {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "Empty value for $Name" }
  if ($EnvName) {
    Invoke-Gh variable set $Name --repo $Repo --env $EnvName --body $Value | Out-Null
  } else {
    Invoke-Gh variable set $Name --repo $Repo --body $Value | Out-Null
  }
  Write-Host "  set $Name$(if ($EnvName) { " ($EnvName)" })"
}

Write-Host "Configuring $Repo"

# ---- repository-level variables (role ARNs are identifiers, not credentials)
Set-Var "AWS_REGION"        $out.region.value
Set-Var "TF_STATE_BUCKET"   $out.state_bucket.value
Set-Var "TF_PLAN_ROLE_ARN"  $out.plan_role_arn.value
Set-Var "ECR_PUSH_ROLE_ARN" $out.ecr_push_role_arn.value

$meId = "$(Invoke-Gh api user --jq .id)".Trim()

foreach ($envName in "dev", "prod") {
  Write-Host "Environment: $envName"
  $body = @{
    deployment_branch_policy = @{ protected_branches = $false; custom_branch_policies = $true }
  }
  if ($envName -eq "prod") {
    # Required reviewer (you) before anything deploys to prod
    $body.wait_timer          = 0
    $body.prevent_self_review = $false
    $body.reviewers           = @(@{ type = "User"; id = [int64]$meId })
  }
  $tmp = New-TemporaryFile
  try {
    $body | ConvertTo-Json -Depth 5 | Set-Content -Path $tmp -Encoding ascii
    Invoke-Gh api -X PUT "repos/$Repo/environments/$envName" --input $tmp | Out-Null
    # Allow deployments from main only (works with rulesets and classic protection alike)
    $existing = Invoke-Gh api "repos/$Repo/environments/$envName/deployment-branch-policies" --jq '.branch_policies[].name'
    if (-not ($existing -contains "main")) {
      Invoke-Gh api -X POST "repos/$Repo/environments/$envName/deployment-branch-policies" -f name=main -f type=branch | Out-Null
    }
  } finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
  }

  Set-Var "TF_APPLY_ROLE_ARN" $out.apply_role_arns.value.$envName  $envName
  Set-Var "DEPLOY_ROLE_ARN"   $out.deploy_role_arns.value.$envName $envName
}

Write-Host ""
Write-Host "Done. One manual step remains (repo admin, one time):"
Write-Host "  Settings > Rules > Rulesets: target the default branch (main), set Active,"
Write-Host "  require a PR and status checks. dev/prod already deploy only from main."
