param(
  [string]$Language = "es-AR"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Write-SpeechJson {
  param([hashtable]$Payload)
  [Console]::Out.WriteLine(($Payload | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}

try {
  Add-Type -AssemblyName System.Speech

  $recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  $preferredLanguages = @($Language, "es-AR", "es-ES", "es-UY", "es-MX", "es-CL", "es-CO") | Where-Object { $_ } | Select-Object -Unique
  $selectedRecognizer = $null

  foreach ($languageName in $preferredLanguages) {
    $selectedRecognizer = $recognizers | Where-Object { $_.Culture.Name -eq $languageName } | Select-Object -First 1
    if ($selectedRecognizer) { break }
  }

  if (-not $selectedRecognizer) {
    $selectedRecognizer = $recognizers | Where-Object { $_.Culture.TwoLetterISOLanguageName -eq "es" } | Select-Object -First 1
  }

  if (-not $selectedRecognizer) {
    $available = ($recognizers | ForEach-Object { $_.Culture.Name }) -join ", "
    Write-SpeechJson @{
      type = "error"
      code = "recognizer-unavailable"
      available = $available
    }
    exit 2
  }

  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($selectedRecognizer)
  $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))

  try {
    $engine.SetInputToDefaultAudioDevice()
  } catch {
    Write-SpeechJson @{
      type = "error"
      code = "audio-device"
      message = $_.Exception.Message
    }
    exit 3
  }

  Register-ObjectEvent -InputObject $engine -EventName SpeechHypothesized -Action {
    $text = $EventArgs.Result.Text
    if ([string]::IsNullOrWhiteSpace($text)) { return }
    [Console]::Out.WriteLine((@{
      type = "interim"
      transcript = $text
      confidence = 0
    } | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
  } | Out-Null

  Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -Action {
    $confidence = [double]$EventArgs.Result.Confidence
    if ($confidence -lt 0.35) { return }
    $text = $EventArgs.Result.Text
    if ([string]::IsNullOrWhiteSpace($text)) { return }
    [Console]::Out.WriteLine((@{
      type = "result"
      transcript = $text
      confidence = $confidence
    } | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
  } | Out-Null

  Write-SpeechJson @{
    type = "ready"
    language = $selectedRecognizer.Culture.Name
  }

  $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)

  while ($true) {
    Start-Sleep -Milliseconds 250
  }
} catch {
  Write-SpeechJson @{
    type = "error"
    code = "startup"
    message = $_.Exception.Message
  }
  exit 1
} finally {
  if ($engine) {
    try { $engine.RecognizeAsyncStop() } catch {}
    $engine.Dispose()
  }
}
