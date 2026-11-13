param(
  [string]$ApiBase = "http://localhost:8081/api"
)

$ErrorActionPreference = "Stop"

function Invoke-Json {
  param(
    [Parameter(Mandatory)][string]$Method,
    [Parameter(Mandatory)][string]$Path,
    [hashtable]$Headers = @{},
    $Body = $null
  )
  $request = @{
    Method = $Method
    Uri = "$ApiBase$Path"
    Headers = $Headers
    ContentType = "application/json; charset=utf-8"
  }
  if ($null -ne $Body) {
    $request.Body = $Body | ConvertTo-Json -Depth 12 -Compress
  }
  Invoke-RestMethod @request
}

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

function Get-HttpStatus {
  param([string]$Uri, [hashtable]$Headers = @{})
  try {
    return (Invoke-WebRequest -UseBasicParsing -Uri $Uri -Headers $Headers -ErrorAction Stop).StatusCode
  } catch {
    return [int]$_.Exception.Response.StatusCode
  }
}

function Set-RequestStatus {
  param([long]$RequestId, [string]$Status, $Extra = @{})
  $payload = @{ status = $Status; servicePointId = $null; cartId = $null }
  foreach ($key in $Extra.Keys) { $payload[$key] = $Extra[$key] }
  Invoke-Json PATCH "/admin/requests/$RequestId/status" $script:adminHeaders $payload
}

Write-Host "[1/13] Health and development identities"
$healthUrl = "$($ApiBase -replace '/api$','')/actuator/health/readiness"
$health = $null
for ($attempt = 1; $attempt -le 60; $attempt++) {
  try {
    $health = Invoke-RestMethod $healthUrl
    if ($health.status -eq "UP") { break }
  } catch {
    if ($attempt -eq 60) { throw }
  }
  Start-Sleep -Seconds 2
}
Assert-True ($health.status -eq "UP") "backend health must be UP"
$residentLogin = Invoke-Json POST "/auth/dev-login" @{} @{ phone = "13800000003" }
$operatorLogin = Invoke-Json POST "/auth/dev-login" @{} @{ phone = "13800000001" }
$adminLogin = Invoke-Json POST "/auth/dev-login" @{} @{ phone = "13800000000" }
$residentHeaders = @{ Authorization = "Bearer $($residentLogin.accessToken)" }
$operatorHeaders = @{ Authorization = "Bearer $($operatorLogin.accessToken)" }
$script:adminHeaders = @{ Authorization = "Bearer $($adminLogin.accessToken)" }
Assert-True ($residentLogin.role -eq "RESIDENT") "resident role"
Assert-True ($operatorLogin.role -eq "OPERATOR") "operator role"
Assert-True ($adminLogin.role -eq "ADMIN") "admin role"
Assert-True ((Get-HttpStatus "$ApiBase/resident/inventory") -eq 401) "anonymous access to resident data must be denied"
Assert-True ((Get-HttpStatus "$ApiBase/admin/impact" $residentHeaders) -eq 403) "resident access to admin data must be denied"
Assert-True ((Get-HttpStatus "$ApiBase/admin/requests" $operatorHeaders) -eq 200) "operator must access operational requests"
Assert-True ((Get-HttpStatus "$ApiBase/admin/audit" $operatorHeaders) -eq 403) "operator must not access administrator audit records"
Assert-True ((Get-HttpStatus "$ApiBase/admin/payments" $operatorHeaders) -eq 403) "operator must not access payment records"
Assert-True ((Get-HttpStatus "$ApiBase/admin/not-a-real-resource" $script:adminHeaders) -eq 404) "unknown authenticated resource must return 404"

Write-Host "[2/13] Resident profile and discoverability"
$profile = Invoke-Json PATCH "/resident/profile" $residentHeaders @{ displayName = "E2E Resident"; householdSize = 4 }
Assert-True ($profile.householdSize -eq 4) "household size must persist"
$points = Invoke-Json GET "/resident/service-points?latitude=31.2304&longitude=121.4737&radiusMeters=50000" $residentHeaders
$carts = Invoke-Json GET "/resident/carts" $residentHeaders
$inventory = Invoke-Json GET "/resident/inventory" $residentHeaders
Assert-True ($points.Count -gt 0) "at least one service point"
Assert-True ($carts.Count -gt 0) "at least one cart"
Assert-True ($inventory.Count -gt 0) "at least one inventory item"
Assert-True (@($inventory | Where-Object { $_.unitPriceFen -gt 0 }).Count -gt 0) "development catalog must include a paid item"

Write-Host "[3/13] Idempotent request submission"
$requestBody = @{
  category = "FOOD"
  itemDescription = "E2E test rice and drinking water"
  quantity = 2
  urgency = "HIGH"
  latitude = 31.2310
  longitude = 121.4741
  approximateAddress = "Pudong test location, Shanghai"
  accessibilityNotes = "Accessible handoff required"
  preferredStart = $null
  preferredEnd = $null
}
$idempotencyKey = "e2e-request-$([guid]::NewGuid())"
$requestHeaders = $residentHeaders.Clone()
$requestHeaders["Idempotency-Key"] = $idempotencyKey
$created = Invoke-Json POST "/resident/requests" $requestHeaders $requestBody
$replayed = Invoke-Json POST "/resident/requests" $requestHeaders $requestBody
Assert-True ($created.id -eq $replayed.id) "same idempotency key and payload must return the same request"
try {
  $different = $requestBody.Clone(); $different.quantity = 3
  Invoke-Json POST "/resident/requests" $requestHeaders $different | Out-Null
  throw "ASSERTION FAILED: reused idempotency key with a different payload was accepted"
} catch {
  $statusCode = [int]$_.Exception.Response.StatusCode
  Assert-True ($statusCode -eq 409) "different payload must produce HTTP 409, received $statusCode"
}

Write-Host "[4/13] Admin review and assignment state machine"
$reviewed = Set-RequestStatus $created.id "UNDER_REVIEW"
$approved = Set-RequestStatus $created.id "APPROVED"
$scheduled = Set-RequestStatus $created.id "SCHEDULED" @{ cartId = [long]($carts[0].id) }
Assert-True ($scheduled.status -eq "SCHEDULED") "request must be assigned to a cart"

Write-Host "[5/13] Free inventory hold, idempotency, pickup-code collection"
$reservationKey = "e2e-reservation-$([guid]::NewGuid())"
$reservationHeaders = $residentHeaders.Clone()
$reservationHeaders["Idempotency-Key"] = $reservationKey
$reserveBody = @{ requestId = [long]($created.id); inventoryItemId = [long]($inventory[0].id); quantity = 1 }
$reservation = Invoke-Json POST "/resident/reservations" $reservationHeaders $reserveBody
$reservationReplay = Invoke-Json POST "/resident/reservations" $reservationHeaders $reserveBody
Assert-True ($reservation.reservationId -eq $reservationReplay.reservationId) "reservation idempotency"
Assert-True ($reservation.pickupCode -match '^\d{6}$') "pickup code must be six digits"
Invoke-Json POST "/admin/reservations/$($reservation.reservationId)/collect" $script:adminHeaders @{ pickupCode = $reservation.pickupCode } | Out-Null
$reservations = Invoke-Json GET "/resident/reservations" $residentHeaders
Assert-True (($reservations | Where-Object reservationId -eq $reservation.reservationId).status -eq "COLLECTED") "reservation collection"

Write-Host "[6/13] Paid inventory safety before a verified WeChat callback"
$paidItem = $inventory | Where-Object unitPriceFen -gt 0 | Select-Object -First 1
$paidRequestBody = $requestBody.Clone()
$paidRequestBody.category = $paidItem.category
$paidRequestBody.itemDescription = "E2E paid $($paidItem.name)"
$paidRequestHeaders = $residentHeaders.Clone()
$paidRequestHeaders["Idempotency-Key"] = "e2e-paid-$([guid]::NewGuid())"
$paidRequest = Invoke-Json POST "/resident/requests" $paidRequestHeaders $paidRequestBody
Set-RequestStatus $paidRequest.id "UNDER_REVIEW" | Out-Null
Set-RequestStatus $paidRequest.id "APPROVED" | Out-Null
$paidReservationHeaders = $residentHeaders.Clone()
$paidReservationHeaders["Idempotency-Key"] = "e2e-paid-reservation-$([guid]::NewGuid())"
$paidReservation = Invoke-Json POST "/resident/reservations" $paidReservationHeaders @{
  requestId = [long]$paidRequest.id; inventoryItemId = [long]$paidItem.id; quantity = 1
}
Assert-True ($paidReservation.paymentRequired) "priced inventory must require payment"
Assert-True ($paidReservation.amountFen -eq $paidItem.unitPriceFen) "amount must be calculated from the server-side price"
Assert-True ($null -eq $paidReservation.pickupCode) "pickup code must remain hidden before payment"
try {
  Invoke-Json POST "/resident/payments" $residentHeaders @{ reservationId = [long]$paidReservation.reservationId } | Out-Null
  throw "ASSERTION FAILED: payment started without merchant credentials"
} catch {
  $statusCode = [int]$_.Exception.Response.StatusCode
  Assert-True ($statusCode -eq 503) "unconfigured payment gateway must fail closed with HTTP 503, received $statusCode"
}
try {
  Invoke-Json POST "/admin/reservations/$($paidReservation.reservationId)/collect" $script:adminHeaders @{ pickupCode = "000000" } | Out-Null
  throw "ASSERTION FAILED: paid reservation was collected without payment"
} catch {
  $statusCode = [int]$_.Exception.Response.StatusCode
  Assert-True ($statusCode -eq 402) "unpaid collection must return HTTP 402, received $statusCode"
}

Write-Host "[7/13] Fulfilment and auditable impact"
$fulfilled = Set-RequestStatus $created.id "FULFILLED"
Invoke-Json POST "/resident/feedback" $residentHeaders @{
  requestId = [long]($created.id)
  rating = 5
  comments = "End-to-end service verification"
  previousTravelMinutes = 45
  currentTravelMinutes = 12
} | Out-Null
$impact = Invoke-Json GET "/admin/impact" $script:adminHeaders
Assert-True ($impact.fulfilledRequests -ge 1) "fulfilled request metric"
Assert-True ($impact.peopleServed -ge 4) "people served must use the stored household size"

Write-Host "[8/13] AI assistant with authoritative tool data"
$assistant = Invoke-Json POST "/resident/assistant/chat" $residentHeaders @{
  conversationId = $null
  message = "Please check the current inventory"
  confirmationToken = $null
}
Assert-True ($assistant.toolExecutions.Count -gt 0) "assistant must execute the inventory tool"
Assert-True ($assistant.toolExecutions[0].tool -eq "check_inventory") "assistant tool name"
Assert-True ($assistant.aiProviderUsed -is [bool]) "assistant must explicitly report whether an AI provider was used"
if ($assistant.aiProviderUsed) {
  Write-Host "  AI provider configured; verified provider-assisted tool execution"
} else {
  Write-Host "  No AI provider configured; verified deterministic fallback tool execution"
}

Write-Host "[9/13] Create approved demand for asynchronous route planning"
$routeBody = $requestBody.Clone()
$routeBody.itemDescription = "E2E mobile supply route demand"
$routeBody.quantity = 3
$routeHeaders = $residentHeaders.Clone()
$routeHeaders["Idempotency-Key"] = "e2e-route-$([guid]::NewGuid())"
$routeRequest = Invoke-Json POST "/resident/requests" $routeHeaders $routeBody
Set-RequestStatus $routeRequest.id "UNDER_REVIEW" | Out-Null
Set-RequestStatus $routeRequest.id "APPROVED" | Out-Null
$serviceDate = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$routePlan = Invoke-Json POST "/admin/routes" $script:adminHeaders @{ serviceDate = $serviceDate }
$routePlanId = $routePlan.summary.id
$deadline = (Get-Date).AddSeconds(30)
do {
  Start-Sleep -Milliseconds 500
  $routeDetail = Invoke-Json GET "/admin/routes/$routePlanId" $script:adminHeaders
} while ($routeDetail.summary.status -in @("PENDING", "QUEUED", "PROCESSING", "COMPUTING") -and (Get-Date) -lt $deadline)
Assert-True ($routeDetail.summary.status -eq "READY") "RabbitMQ route task must become READY; status=$($routeDetail.summary.status)"
Assert-True ($routeDetail.stops.Count -gt 0) "route must contain at least one stop"

Write-Host "[10/13] Asynchronous notification delivery"
$deadline = (Get-Date).AddSeconds(20)
do {
  Start-Sleep -Milliseconds 500
  $notifications = Invoke-Json GET "/resident/notifications" $residentHeaders
} while ($notifications.Count -lt 1 -and (Get-Date) -lt $deadline)
Assert-True ($notifications.Count -gt 0) "RabbitMQ notification consumer must persist at least one delivery"

Write-Host "[11/13] Audit records and CSV export"
$audit = Invoke-Json GET "/admin/audit?limit=100" $script:adminHeaders
Assert-True ($audit.Count -gt 0) "audit trail"
$csv = Invoke-WebRequest -UseBasicParsing -Headers $script:adminHeaders -Uri "$ApiBase/admin/impact/export"
Assert-True ($csv.StatusCode -eq 200 -and $csv.Content.Contains("request_id,category,quantity,status")) "impact CSV export"

Write-Host "[12/13] Infrastructure endpoints"
$adminPage = Invoke-WebRequest -UseBasicParsing "http://localhost:8080/"
$prometheus = Invoke-RestMethod "http://localhost:9090/api/v1/targets"
$grafana = Invoke-RestMethod "http://localhost:3000/api/health"
Assert-True ($adminPage.StatusCode -eq 200) "admin web"
Assert-True ($prometheus.status -eq "success") "Prometheus API"
Assert-True ($grafana.database -eq "ok") "Grafana database"

Write-Host "[13/13] Completed"
[pscustomobject]@{
  requestId = $created.id
  reservationId = $reservation.reservationId
  routePlanId = $routePlanId
  routeDistanceMeters = $routeDetail.summary.distanceMeters
  routeBaselineMeters = $routeDetail.summary.baselineDistanceMeters
  notifications = $notifications.Count
  fulfilledRequests = $impact.fulfilledRequests
  peopleServed = $impact.peopleServed
  status = "PASS"
} | Format-List
