const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const runner = fs.readFileSync(path.join(root, 'native-host', 'CodexRunner.cs'), 'utf8');
const handler = fs.readFileSync(path.join(root, 'native-host', 'RequestHandler.cs'), 'utf8');
const program = fs.readFileSync(path.join(root, 'native-host', 'Program.cs'), 'utf8');

test('Codex receives the optimizer request through redirected stdin', () => {
  assert.match(runner, /RedirectStandardInput\s*=\s*true/);
  assert.match(runner, /StandardInput\.WriteAsync\(request\)/);
  assert.match(runner, /arguments\.Add\("exec"\)/);
  assert.match(runner, /PromptActionModel\s*=\s*"gpt-5\.6-luna"/);
  assert.match(runner, /ReasoningEffortConfigKey\s*=\s*"model_reasoning_effort"/);
  assert.match(runner, /--sandbox/);
  assert.match(runner, /--model/);
  assert.match(runner, /arguments\.Add\(\$"\{ReasoningEffortConfigKey\}=\{effort\}"\)/);
  assert.match(runner, /CodexTotalMs/);
  assert.match(runner, /CodexProcessStartMs/);
  assert.match(runner, /cachedInstruction/);
  assert.match(runner, /EffectiveTimeoutMilliseconds/);
  assert.doesNotMatch(runner, /FileName\s*=\s*sourceText/);
  assert.doesNotMatch(runner, /ArgumentList\.Add\(sourceText/);
});

test('native host exposes only ping and optimize_prompt with LOW/MEDIUM effort', () => {
  assert.match(handler, /action == "ping"/);
  assert.match(handler, /action != "optimize_prompt"/);
  assert.match(handler, /HasOnlyProperties\(root, "action", "text", "effort", "requestId"\)/);
  assert.match(handler, /value is "low" or "medium"/);
  assert.match(handler, /CodexRunner codexRunner/);
  assert.doesNotMatch(handler, /engineMode|app-server|AppServer|PromptEngine/);
  assert.doesNotMatch(handler, /GetProperty\("(executable|command|arguments)"/i);
});

test('program keeps the Native Messaging read loop alive for multiple requests', () => {
  assert.match(program, /while \(NativeMessagingProtocol\.TryReadJson/);
  assert.match(program, /new RequestHandler\(new CodexRunner\(\)\)/);
  assert.doesNotMatch(program, /AppServer|PromptEngine|engineMode/);
});

test('final native host source contains no App Server implementation', () => {
  assert.equal(fs.existsSync(path.join(root, 'native-host', 'CodexAppServerEngine.cs')), false);
  assert.equal(fs.existsSync(path.join(root, 'native-host', 'CodexExecEngine.cs')), false);
  assert.equal(fs.existsSync(path.join(root, 'native-host', 'PromptEngine.cs')), false);
  assert.doesNotMatch(runner, /AppServer|App Server|app-server/);
  assert.doesNotMatch(program, /AppServer|App Server|app-server/);
});
