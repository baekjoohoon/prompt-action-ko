# Prompt Action

**한국어로 작성한 ChatGPT 초안을 Codex로 더 강한 영어 프롬프트로 개선하고, 최종 답변은 한국어로 받게 하는 Windows용 로컬 브라우저 확장입니다.**

Prompt Action은 ChatGPT 입력창의 초안을 로컬 Codex CLI에 전달해 실행 가능한 영어 프롬프트로 다듬습니다. 결과를 확인한 뒤 사용자가 직접 ChatGPT에 전송합니다. Prompt Action이 프롬프트를 자동 전송하거나 대화 기록을 저장하지는 않습니다.

## v1.2.1의 설치·인증 개선

확장 프로그램 팝업을 열면 다음 상태를 한눈에 확인할 수 있습니다.

```text
Prompt Action

✅ Native Host      연결됨
✅ Codex CLI        설치됨
✅ Codex 로그인     로그인됨
```

Codex CLI가 없으면 `Codex 설치 안내` 링크가 표시되고, 설치되어 있지만 로그인하지 않았으면 `Codex 로그인` 버튼이 표시됩니다. 버튼은 Prompt Action이 credential을 받는 화면이 아니라 공식 `codex login` 흐름만 시작합니다. 브라우저에서 인증을 완료한 뒤 팝업을 다시 열거나 `상태 새로고침`을 누르면 `codex login status`로 상태를 다시 확인합니다.

## 일반 사용자에게 필요한 것

일반 사용자는 Node.js나 .NET SDK를 설치할 필요가 없습니다.

GitHub Releases의 Windows ZIP에는 self-contained Native Host가 포함되어 있으므로 .NET Runtime도 필요하지 않습니다. 필요한 것은 다음뿐입니다.

- Windows 10 또는 Windows 11
- Google Chrome 또는 Microsoft Edge
- ChatGPT 웹 사용 환경
- 설치·로그인된 Codex CLI

Node.js 20 이상과 .NET 8 SDK는 저장소 소스에서 직접 테스트하거나 Native Host를 다시 빌드하는 개발자에게만 필요합니다.

## 필요한 인증

Prompt Action 자체에는 다음이 없습니다.

- Prompt Action 회원가입
- GitHub 로그인
- 별도 OpenAI API Key 입력
- 별도 OAuth 계정 연결

프롬프트 개선에 필요한 인증은 **Codex CLI 로그인 하나**입니다. ChatGPT 웹 로그인은 ChatGPT를 사용하기 위한 평소의 브라우저 세션이며, Prompt Action 자체 인증으로 취급하지 않습니다.

팝업의 `Codex 로그인` 버튼은 Native Messaging을 통해 내부적으로 고정된 `codex login`만 실행합니다. 실제 로그인과 credential 관리는 공식 Codex CLI가 담당하고, 사용자는 Codex가 여는 공식 브라우저 로그인 흐름에서 인증합니다.

Prompt Action은 다음을 받거나 처리하지 않습니다.

- 비밀번호
- `auth.json` credential 내용
- OAuth token 또는 access token
- OpenAI API key
- prompt history

Codex가 설치되어 있지 않은 경우에는 팝업의 [Codex 설치 안내](https://developers.openai.com/codex/cli)를 이용하세요. Prompt Action이 Codex를 자동 설치하지는 않습니다.

## 설치

### 1. Release ZIP 받기

[최신 Release](https://github.com/baekjoohoon/prompt-action-ko/releases/latest)에서 `PromptAction-v1.2.1-Windows.zip`을 내려받아 원하는 폴더에 압축 해제합니다.

ZIP에는 일반 사용자에게 필요한 다음 항목만 들어 있습니다.

```text
extension/
native-host/dist/
scripts/install-native-host.ps1
scripts/uninstall-native-host.ps1
README.md
LICENSE
```

### 2. 확장 프로그램 로드

1. Edge에서 `edge://extensions`, Chrome에서 `chrome://extensions`를 엽니다.
2. `개발자 모드`를 켭니다.
3. `압축해제된 확장 프로그램을 로드`를 선택합니다.
4. 압축 해제한 폴더의 `extension` 폴더를 선택합니다.
5. 화면에 표시된 확장 프로그램 ID를 복사합니다. 팝업의 `설치 정보`에서도 확인할 수 있습니다.

### 3. Native Host 등록

압축 해제한 폴더에서 PowerShell을 열고 사용하는 브라우저에 맞는 설치 스크립트를 한 번 실행합니다. Chrome과 Edge를 모두 사용하면 `Both`가 기본값입니다.

Edge:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-native-host.ps1 -ExtensionId <확장-프로그램-ID> -Browser Edge
```

Chrome:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-native-host.ps1 -ExtensionId <확장-프로그램-ID> -Browser Chrome
```

두 브라우저 모두:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-native-host.ps1 -ExtensionId <확장-프로그램-ID>
```

확장 프로그램과 ChatGPT 탭을 새로고침한 뒤 Prompt Action 팝업을 열어 `Native Host`가 `✅ 연결됨`인지 확인합니다. Native Host 등록은 브라우저별로 확장 프로그램 ID를 허용하는 Windows 사용자 영역 설정을 추가합니다.

## 사용법

1. `chatgpt.com` 또는 `chat.openai.com`을 엽니다.
2. ChatGPT 입력창에 한국어 초안을 작성합니다.
3. 아직 전송하지 않은 상태에서 `Ctrl + \``를 누릅니다.
4. Prompt Action이 LOW 또는 MEDIUM으로 복잡도를 판단해 Codex CLI에 개선을 요청합니다.
5. 영어로 개선된 프롬프트를 검토하고 직접 ChatGPT에 전송합니다.
6. 결과가 마음에 들지 않으면 즉시 `Ctrl + Z`를 눌러 정확한 원문을 복구합니다.

다음 동작은 그대로 유지됩니다.

- 한국어 입력을 Codex로 영어 프롬프트로 개선
- 결과에 `Please answer in Korean.` 포함
- 간단한 요청은 `LOW`, 코드·분석·다단계 작업은 `MEDIUM`
- `gpt-5.6-luna` 모델 사용
- `codex exec --ephemeral --sandbox read-only` 사용
- 사용자 프롬프트는 stdin으로 전달
- 자동 전송 없음
- prompt history 저장 없음
- App Server 없음
- Prompt Action의 직접 OpenAI API 호출 없음

## 보안·동작 구조

브라우저와 Native Host 사이의 허용 action은 다음 세 가지로 고정되어 있습니다.

```text
ping
optimize_prompt
codex_login
```

`codex_login`은 브라우저가 executable, path, command, arguments를 전달하지 않고 Native Host가 내부적으로 고정된 `codex login`만 실행합니다. 일반 명령 실행 API(`shell`, `exec`, `run_command`)는 제공하지 않습니다.

프롬프트 개선 흐름은 다음과 같습니다.

```text
ChatGPT 입력창
  → Browser Extension
  → Native Messaging
  → PromptAction.NativeHost.exe
  → codex exec --ephemeral --sandbox read-only
  → 개선된 프롬프트
```

인증 상태 확인은 Native Host가 Codex CLI의 `codex login status`를 실행해 판별합니다. 로그인 버튼은 `codex login` 프로세스를 시작한 뒤 즉시 응답하므로 Native Messaging 연결을 장시간 차단하지 않습니다.

## 문제 해결

- **Native Host 연결 필요**: 확장 프로그램 ID가 현재 설치된 확장 프로그램의 ID와 같은지 확인한 뒤 설치 스크립트를 다시 실행하고 확장 프로그램과 ChatGPT 탭을 새로고침합니다.
- **Codex CLI 설치 필요**: 팝업의 `Codex 설치 안내`를 열어 공식 설치 문서를 확인합니다.
- **Codex 로그인 필요**: 팝업의 `Codex 로그인`을 누르고 공식 브라우저 인증을 완료한 뒤 `상태 새로고침`을 누릅니다.
- **입력창에서 단축키가 동작하지 않음**: 초안을 실제 ChatGPT composer에 작성하고 IME 조합이 끝난 뒤 `Ctrl + \``를 누릅니다. Prompt Action은 자동 전송하지 않습니다.

## 소스에서 테스트·빌드하기

개발자만 다음 환경이 필요합니다.

- Node.js 20 이상
- .NET 8 SDK
- Windows PowerShell
- 로그인된 Codex CLI (실제 테스트는 fake Codex를 사용하며 quota를 소모하지 않음)

저장소 루트에서 실행합니다.

```powershell
npm test
dotnet build .\native-host\PromptAction.NativeHost.csproj --configuration Release --runtime win-x64 --self-contained true
.\scripts\build-native-host.ps1
```

`build-native-host.ps1`는 Release Native Host를 win-x64 self-contained single-file로 만들며 debug symbol을 배포 출력에 포함하지 않습니다. Release ZIP을 만들 때는 `extension/`, `native-host/dist/`, 설치·제거 스크립트, `README.md`, `LICENSE`만 포함하고 소스 테스트·`node_modules`·`bin`·`obj`·credential은 포함하지 않습니다.

## 제거

Native Host 등록을 제거하려면 압축 해제한 폴더에서 다음을 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\uninstall-native-host.ps1 -Browser Both
```

그 다음 Chrome 또는 Edge 확장 프로그램 관리 화면에서 Prompt Action을 제거합니다.

## 라이선스

MIT
