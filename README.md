# Prompt Action

**한국어로 편하게 쓰면, Codex가 AI가 더 잘 수행할 수 있는 영어 프롬프트로 바꿔줍니다.**

Prompt Action은 한국어 사용자를 위한 Windows용 로컬 프롬프트 최적화 도구이자 **Codex 기반 프롬프트 전처리기**입니다.

ChatGPT 입력창에서 평소처럼 한국어로 요청을 작성한 뒤 `Ctrl + \``를 누르면, 이미 로그인되어 있는 Codex CLI가 사용자의 의도를 분석하고 더 명확하고 실행 가능한 영어 프롬프트로 재구성합니다. 변환된 프롬프트는 대상 AI에게 최종 답변을 한국어로 하도록 지시합니다.

별도의 OpenAI API Key를 입력할 필요가 없습니다. Prompt Action은 프롬프트를 자동으로 전송하지 않으며, 변환 결과를 확인한 뒤 사용자가 직접 전송합니다.

## 왜 만들었나요?

많은 한국어 사용자는 한국어로 생각하고 요청을 작성하는 것이 가장 자연스럽습니다. 반면 복잡한 작업을 AI에게 맡길 때는 요구사항, 실행 조건, 검증 방법을 정확하게 구조화할수록 결과가 좋아집니다.

사용자가 직접 다음 일을 반복할 필요가 없도록 만들었습니다.

- 요청을 수동으로 영어로 번역하기
- 프롬프트 엔지니어링 문법을 따로 배우기
- 같은 지시사항을 여러 번 다시 쓰기
- 도구 사이를 오가며 복사·붙여넣기하기

Prompt Action은 ChatGPT에 보내기 전 한 단계의 전처리 과정을 넣습니다. 단순한 한국어→영어 번역기가 아니라, 요청의 의도와 실행에 필요한 조건을 해석해 AI가 수행하기 좋은 프롬프트로 재구성합니다.

```text
한국어 요청
   ↓
Ctrl + `
   ↓
Codex
   ↓
의도 분석 + 프롬프트 개선
   ↓
AI용 영어 프롬프트
   ↓
ChatGPT
   ↓
한국어 답변
```

## 핵심 기능

- 한국어 초안을 AI용 영어 프롬프트로 변환
- 단순 번역이 아닌 실행 성공률을 높이기 위한 재구성
- 의미 있는 경우 누락된 실행 조건, 검증 방법, 출력 형식을 보강
- 구체적인 숫자, 경로, 파일명, 명령어, 코드, 식별자 등을 최대한 그대로 보존
- 사용자의 기존 Codex CLI 로그인 상태 사용
- 별도 OpenAI API Key 입력 불필요
- 요청 복잡도에 따른 LOW / MEDIUM 자동 추론강도
- `Ctrl + Z`로 변환 직전의 정확한 원문 복구
- 자동 전송 없음
- 처리시간 toast 표시
- Google Chrome / Microsoft Edge 지원
- 현재 작성 중인 ChatGPT composer의 unsent prompt만 사용

## 실제 예시

입력:

```text
이 프로그램 코드 문제 찾아서 고치고 테스트도 해
```

가능한 출력:

```text
Inspect the program code, identify and fix the actual causes of any issues, preserve unrelated behavior and existing user changes, run appropriate tests or builds, investigate any failures, and verify that the implementation works correctly. Briefly summarize the changes and test results. Please answer in Korean.
```

실제 결과는 Codex 모델과 입력 내용에 따라 달라질 수 있습니다. 위 출력은 동작을 설명하기 위한 예시이며, 결과가 항상 같은 것은 아닙니다.

## LOW / MEDIUM

Prompt Action은 추가 AI 호출 없이 요청의 복잡도를 로컬에서 판단합니다.

- 간단한 질문이나 짧은 요청 → `LOW`
- 코딩, 디버깅, 아키텍처, 원인 분석, 여러 단계가 필요한 작업 → `MEDIUM`

`HIGH`는 사용하지 않습니다.

## 준비사항

- Windows 10 또는 Windows 11
- Microsoft Edge 또는 Google Chrome
- ChatGPT 웹
- 설치된 Codex CLI
- 로그인되어 실행 가능한 Codex CLI

Codex의 접근 권한과 사용량 제한은 사용자의 OpenAI/ChatGPT/Codex 계정과 요금제 조건에 따릅니다. Prompt Action은 인증을 제공하거나 사용량 제한을 우회하지 않습니다.

## 가장 쉬운 설치 방법

GitHub Releases에서 최신 `PromptAction-v1.2.0-Windows.zip`을 내려받는 방법을 권장합니다.

1. ZIP 파일을 내려받아 원하는 곳에 압축을 풉니다.
2. Edge에서 `edge://extensions`, Chrome에서 `chrome://extensions`를 엽니다.
3. **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램을 로드**를 선택합니다.
5. 압축을 푼 Prompt Action 폴더 안의 `extension` 폴더를 선택합니다.
6. 화면에 표시된 확장 프로그램 ID를 복사합니다.
7. 압축을 푼 Prompt Action 폴더에서 PowerShell을 엽니다.
8. 사용하는 브라우저에 맞는 명령을 실행합니다.

Edge:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-native-host.ps1 -ExtensionId <확장-ID> -Browser Edge
```

Chrome:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-native-host.ps1 -ExtensionId <확장-ID> -Browser Chrome
```

Chrome과 Edge를 모두 사용할 때:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-native-host.ps1 -ExtensionId <확장-ID> -Browser Both
```

9. 확장 프로그램을 새로고침합니다.
10. ChatGPT 탭을 새로고침합니다.
11. Prompt Action 팝업을 열어 다음 상태를 확인합니다.

```text
Native host: 연결됨
Codex CLI: 사용 가능
```

Chrome과 Edge는 서로 다른 확장 프로그램 ID를 만들 수 있습니다. ID가 다르면 각 브라우저에 해당 ID로 설치 명령을 별도로 실행해야 합니다. 확장 프로그램을 다시 로드하거나 재설치해 ID가 바뀐 경우에도 Native Messaging 등록을 다시 실행하세요.

## 사용법

1. `chatgpt.com`을 엽니다.
2. ChatGPT 입력창에 한국어로 프롬프트를 작성합니다.
3. 아직 전송하지 않습니다.
4. `Ctrl + \``를 누릅니다.
5. 최적화가 끝날 때까지 기다립니다.
6. 영어로 바뀐 프롬프트를 검토합니다.
7. 만족스러우면 사용자가 직접 전송합니다.
8. 즉시 원문으로 되돌리고 싶다면 `Ctrl + Z`를 누릅니다.

Prompt Action은 **절대로 자동 전송하지 않습니다.** 최적화 결과를 확인하고 전송하는 시점은 항상 사용자에게 있습니다.

## 처리시간

예시:

```text
Prompt Action 완료 · 3.3초
Codex 3.2초 · 기타 0.1초 · LOW
Ctrl+Z로 원문 복구
```

대부분의 지연시간은 Codex 처리에서 발생합니다. 실제 처리시간은 요청 내용, Codex 상태, 모델, 계정 조건, 로컬 환경에 따라 달라지며 고정된 속도를 보장하지 않습니다.

## 개인정보 및 보안

Prompt Action은 현재 전송되지 않은 ChatGPT composer 텍스트만 로컬 Native Messaging Host와 Codex CLI로 전달합니다. 프롬프트 내용은 Prompt Action이 의도적으로 파일, 데이터베이스 또는 브라우저 저장소에 저장하지 않습니다.

Prompt Action은 다음을 의도적으로 수집하거나 사용하지 않습니다.

- 이전 ChatGPT 대화 내용
- 브라우저 방문 기록
- 다른 탭의 내용
- 쿠키
- 클립보드
- API Key
- `auth.json`
- OAuth token
- prompt history
- analytics

Prompt Action 자체는 Codex 인증을 제공하거나 우회하지 않습니다. 인증은 설치된 Codex CLI가 관리하며, 사용자는 자신의 계정으로 Codex CLI를 로그인해 두어야 합니다. Prompt Action은 `auth.json`의 credential 내용을 읽지 않습니다.

## 동작 구조

```text
ChatGPT
  → Browser Extension
  → Native Messaging
  → PromptAction.NativeHost.exe
  → codex exec
  → optimized prompt
  → ChatGPT composer
```

사용자 프롬프트는 리디렉션된 표준 입력(stdin)으로 전달되며, 임의의 shell command 문자열에 삽입되지 않습니다. Native Host는 요청마다 `codex exec`를 실행하고, 브라우저와 Native Messaging port를 유지해 여러 요청을 처리합니다.

Codex App Server 방식도 실험했지만 실제 지연시간 개선이 충분히 일관되지 않아 최종 공개판은 단순한 `codex exec` 구조를 사용합니다.

## 소스에서 빌드

소스에서 테스트하거나 Native Host를 다시 빌드하려면 다음 도구가 필요합니다.

- Node.js 20 이상
- .NET 8 SDK
- Windows용 PowerShell
- 로그인된 Codex CLI

저장소 루트에서 실행합니다.

```powershell
npm test
dotnet build .\native-host\PromptAction.NativeHost.csproj --configuration Release --runtime win-x64 --self-contained true
.\scripts\build-native-host.ps1
npm test
```

`build-native-host.ps1`는 `native-host\dist`에 win-x64 self-contained 단일 실행 파일과 `optimize-prompt.txt`를 생성합니다. GitHub Release ZIP에 포함된 Native Host는 self-contained로 빌드되어 별도의 .NET Runtime 설치가 필요하지 않습니다. 소스에서 직접 빌드할 때만 .NET 8 SDK가 필요합니다.

자동 테스트는 실제 Codex 모델을 호출하지 않고 fake Codex 프로세스를 사용합니다.

## 제거

Native Messaging Host 등록을 제거하려면 압축을 푼 Prompt Action 폴더에서 다음 명령을 실행합니다.

Edge:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\uninstall-native-host.ps1 -Browser Edge
```

Chrome:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\uninstall-native-host.ps1 -Browser Chrome
```

둘 다:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\uninstall-native-host.ps1 -Browser Both
```

그 다음 Edge 또는 Chrome의 확장 프로그램 관리 화면에서 Prompt Action의 압축해제된 확장 프로그램을 제거합니다.

## 문제 해결

- **Native Messaging host not registered**: 현재 확장 프로그램 ID를 다시 복사해 `install-native-host.ps1`을 실행하고, 확장 프로그램과 ChatGPT 탭을 새로고침합니다.
- **Codex CLI를 찾을 수 없음**: PowerShell에서 `codex`가 실행되는지 확인합니다. Codex CLI가 PATH에 있어야 합니다.
- **Codex 로그인이 필요함**: 터미널에서 `codex`를 실행하고 사용자의 ChatGPT/Codex 계정으로 로그인합니다.
- **확장 프로그램 통신 실패**: 확장 프로그램을 새로고침하고 ChatGPT를 다시 열어 봅니다. 그래도 안 되면 현재 ID로 Native Messaging 등록을 다시 실행합니다.
- **단축키가 아무 반응이 없음**: ChatGPT 입력창에 초안을 작성하고 전송하지 않은 상태에서 `Ctrl + \``를 누릅니다. IME 조합 중에는 실행되지 않습니다.
- **ChatGPT 입력창을 찾지 못함**: ChatGPT의 DOM이 바뀌었을 수 있습니다. 최신 공개 버전으로 업데이트하고 문제가 계속되면 이슈를 남겨 주세요.
- **확장 프로그램 ID가 바뀜**: 확장 프로그램을 다시 로드하거나 재설치한 뒤 표시된 새 ID로 `install-native-host.ps1`을 다시 실행합니다. Chrome과 Edge는 각각 따로 등록할 수 있습니다.

## 현재 제한

- Windows 환경에 초점을 둡니다.
- 현재는 ChatGPT 웹을 대상으로 합니다.
- 로컬 Codex CLI가 설치되어 있고 실행 가능해야 합니다.
- 지연시간은 Codex, 모델, 계정, 요청 내용 및 로컬 환경에 따라 달라집니다.
- ChatGPT DOM이 변경되면 입력창 어댑터 업데이트가 필요할 수 있습니다.
- 스토어 배포판이 없으므로 현재는 Chrome/Edge의 압축해제된 확장 프로그램 설치가 필요합니다.

## 라이선스

MIT
