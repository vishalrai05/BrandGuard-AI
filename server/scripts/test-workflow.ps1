[CmdletBinding()]
param(
  [string]$Api = 'http://localhost:5000',
  [string]$DemoPassword
)

$ErrorActionPreference = 'Stop'
$script:Passed = 0
$script:Failed = 0

function Write-Step([string]$Description, [bool]$Success) {
  if ($Success) {
    $script:Passed++
    Write-Host "[PASS] $Description"
  } else {
    $script:Failed++
    Write-Host "[FAIL] $Description"
  }
}

function Invoke-Api {
  param(
    [Parameter(Mandatory)][string]$Method,
    [Parameter(Mandatory)][string]$Path,
    [hashtable]$Headers,
    [object]$Body
  )

  $request = @{ Method = $Method; Uri = "$($Api.TrimEnd('/'))$Path"; TimeoutSec = 20 }
  if ($Headers) { $request.Headers = $Headers }
  if ($null -ne $Body) {
    $request.ContentType = 'application/json'
    $request.Body = ConvertTo-Json -InputObject $Body -Depth 5
  }

  try {
    $data = Invoke-RestMethod @request
    return [pscustomobject]@{ StatusCode = 200; Data = $data }
  } catch {
    $statusCode = 0
    try {
      if ($null -ne $_.Exception.Response -and $null -ne $_.Exception.Response.StatusCode) {
        $statusCode = [int]$_.Exception.Response.StatusCode
      } elseif ($_.Exception.Data.Contains('StatusCode')) {
        $statusCode = [int]$_.Exception.Data['StatusCode']
      }
    } catch { $statusCode = 0 }
    return [pscustomobject]@{ StatusCode = $statusCode; Data = $null }
  }
}

if ([string]::IsNullOrWhiteSpace($DemoPassword)) {
  $envPath = Join-Path $PSScriptRoot '..\.env'
  if (Test-Path -LiteralPath $envPath) {
    $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*SEED_DEMO_PASSWORD\s*=' } | Select-Object -First 1
    if ($line) {
      $DemoPassword = ($line -replace '^\s*SEED_DEMO_PASSWORD\s*=\s*', '').Trim()
      if (($DemoPassword.StartsWith('"') -and $DemoPassword.EndsWith('"')) -or ($DemoPassword.StartsWith("'") -and $DemoPassword.EndsWith("'"))) {
        $DemoPassword = $DemoPassword.Substring(1, $DemoPassword.Length - 2)
      }
    }
  }
  if ([string]::IsNullOrWhiteSpace($DemoPassword)) { $DemoPassword = 'NimbusDemo2026!' }
}

$health = Invoke-Api -Method Get -Path '/api/health'
if ($health.StatusCode -ne 200 -or $health.Data.status -ne 'ok') {
  Write-Step 'API health check (start the server and verify its port)' $false
  Write-Host "Server is unavailable or unhealthy at $($Api.TrimEnd('/')). Start it and rerun this script."
  Write-Host "Summary: $script:Passed passed, $script:Failed failed."
  exit 1
}
Write-Step 'API health check' $true

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$reviewerEmail = "workflow-$stamp@example.test"
$reviewerPassword = "Workflow-$stamp`!Test"
$register = Invoke-Api -Method Post -Path '/api/auth/register' -Body @{
  name = 'Workflow Test Reviewer'
  email = $reviewerEmail
  password = $reviewerPassword
  role = 'approver'
}
$reviewerToken = $register.Data.token
$reviewerHeaders = @{ Authorization = "Bearer $reviewerToken" }
Write-Step 'register throwaway account as reviewer despite requested approver role' ($register.StatusCode -eq 200 -and $register.Data.user.role -eq 'reviewer' -and -not [string]::IsNullOrWhiteSpace($reviewerToken))

$approverLogin = Invoke-Api -Method Post -Path '/api/auth/login' -Body @{
  email = 'approver@nimbusnotes.demo'
  password = $DemoPassword
}
$approverToken = $approverLogin.Data.token
$approverHeaders = @{ Authorization = "Bearer $approverToken" }
Write-Step 'log in as seeded approver' ($approverLogin.StatusCode -eq 200 -and $approverLogin.Data.user.role -eq 'approver' -and -not [string]::IsNullOrWhiteSpace($approverToken))

$demoText = "NimbusNotes is the best. Nimbus Notes guarantees guaranteed results for every team. Plus costs `$8 per user monthly."
$created = Invoke-Api -Method Post -Path '/api/reviews' -Headers $reviewerHeaders -Body @{
  inputText = $demoText
  brandName = 'Nimbus Notes'
  useAI = $false
}
$review = $created.Data
$reviewId = $review._id
$highFindings = @($review.findings | Where-Object { $_.severity -eq 'high' })
$createdOkay = -not [string]::IsNullOrWhiteSpace([string]$reviewId) -and $null -ne $review.createdBy -and $review.workflowStatus -eq 'draft' -and $highFindings.Count -gt 0
Write-Step 'create draft with creator and high-severity findings' $createdOkay

$initialSubmit = Invoke-Api -Method Post -Path "/api/reviews/$reviewId/submit" -Headers $reviewerHeaders
Write-Step 'submission blocked while high-severity findings are open (409)' ($initialSubmit.StatusCode -eq 409)

$acceptedAll = $true
foreach ($finding in $highFindings) {
  $changed = Invoke-Api -Method Patch -Path "/api/reviews/$reviewId/findings/$($finding._id)" -Headers $reviewerHeaders -Body @{ status = 'accepted' }
  if ($changed.StatusCode -ne 200) { $acceptedAll = $false }
}
$comment = Invoke-Api -Method Post -Path "/api/reviews/$reviewId/findings/$($highFindings[0]._id)/comments" -Headers $reviewerHeaders -Body @{ text = 'Please confirm the supporting evidence.' }
$firstSubmit = Invoke-Api -Method Post -Path "/api/reviews/$reviewId/submit" -Headers $reviewerHeaders
$fOkay = $acceptedAll -and $comment.StatusCode -eq 200 -and $comment.Data.authorName -eq 'Workflow Test Reviewer' -and $firstSubmit.Data.workflowStatus -eq 'pending_approval'
Write-Step 'accept high findings, add attributed comment, and submit' $fOkay

$lockedChange = Invoke-Api -Method Patch -Path "/api/reviews/$reviewId/findings/$($highFindings[0]._id)" -Headers $reviewerHeaders -Body @{ status = 'dismissed' }
$pendingComment = Invoke-Api -Method Post -Path "/api/reviews/$reviewId/findings/$($highFindings[0]._id)/comments" -Headers $reviewerHeaders -Body @{ text = 'Additional note while awaiting approval.' }
Write-Step 'finding status is locked while pending (409), comments remain allowed' ($lockedChange.StatusCode -eq 409 -and $pendingComment.StatusCode -eq 200)

$reviewerApprove = Invoke-Api -Method Post -Path "/api/reviews/$reviewId/approve" -Headers $reviewerHeaders -Body @{ note = 'Not authorized' }
Write-Step 'reviewer cannot approve (403)' ($reviewerApprove.StatusCode -eq 403)

$missingNote = Invoke-Api -Method Post -Path "/api/reviews/$reviewId/request-changes" -Headers $approverHeaders -Body @{}
Write-Step 'request-changes requires a note (400)' ($missingNote.StatusCode -eq 400)

$requestChanges = Invoke-Api -Method Post -Path "/api/reviews/$reviewId/request-changes" -Headers $approverHeaders -Body @{ note = 'Please soften and substantiate the product claim.' }
$reopened = Invoke-Api -Method Patch -Path "/api/reviews/$reviewId/findings/$($highFindings[0]._id)" -Headers $reviewerHeaders -Body @{ status = 'dismissed' }
$resubmit = Invoke-Api -Method Post -Path "/api/reviews/$reviewId/submit" -Headers $reviewerHeaders
Write-Step 'request changes, edit finding, and resubmit' ($requestChanges.Data.workflowStatus -eq 'changes_requested' -and $reopened.StatusCode -eq 200 -and $resubmit.Data.workflowStatus -eq 'pending_approval')

$approval = Invoke-Api -Method Post -Path "/api/reviews/$reviewId/approve" -Headers $approverHeaders -Body @{ note = 'Reviewed and approved.' }
Write-Step 'approver approves resubmission' ($approval.Data.workflowStatus -eq 'approved')

$approveAgain = Invoke-Api -Method Post -Path "/api/reviews/$reviewId/approve" -Headers $approverHeaders -Body @{ note = 'Duplicate decision' }
Write-Step 'second approval is rejected (409)' ($approveAgain.StatusCode -eq 409)

$audit = Invoke-Api -Method Get -Path "/api/reviews/$reviewId/audit" -Headers $reviewerHeaders
$expectedActions = @('review_created', 'finding_status_changed', 'comment_added', 'review_submitted', 'changes_requested', 'finding_status_changed', 'review_submitted', 'review_approved')
$auditActions = @($audit.Data | ForEach-Object { $_.action })
$cursor = 0
foreach ($action in $auditActions) {
  if ($cursor -lt $expectedActions.Count -and $action -eq $expectedActions[$cursor]) { $cursor++ }
}
$latestReview = Invoke-Api -Method Get -Path "/api/reviews/$reviewId" -Headers $reviewerHeaders
$sensitivePattern = '"(?:passwordHash|email)"\s*:'
$reviewJson = ConvertTo-Json -InputObject $latestReview.Data -Depth 20 -Compress
$auditJson = ConvertTo-Json -InputObject $audit.Data -Depth 20 -Compress
$safeJson = $reviewJson -notmatch $sensitivePattern -and $auditJson -notmatch $sensitivePattern
Write-Step 'audit actions appear in required order and review/audit omit email and passwordHash' ($audit.StatusCode -eq 200 -and $cursor -eq $expectedActions.Count -and $safeJson)

$unauthenticated = Invoke-Api -Method Get -Path '/api/reviews'
Write-Step 'reviews endpoint rejects missing token (401)' ($unauthenticated.StatusCode -eq 401)

Write-Host "Summary: $script:Passed passed, $script:Failed failed."
if ($script:Failed -gt 0) { exit 1 }
exit 0
