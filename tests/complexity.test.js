const test = require('node:test');
const assert = require('node:assert/strict');

const {
  analyzePromptComplexity,
  classifyPromptComplexity
} = require('../extension/shared/complexity.js');

test('simple requests remain LOW', () => {
  for (const prompt of [
    '오늘 서울 날씨 알려줘',
    '이 문장을 자연스럽게 정리해줘',
    '아이폰과 갤럭시 차이를 알려줘',
    'Translate this email more naturally.'
  ]) {
    assert.equal(classifyPromptComplexity(prompt), 'low', prompt);
  }
});

test('code, analysis, and design requests upgrade to MEDIUM', () => {
  for (const prompt of [
    '이 프로그램 코드 문제 찾아서 고치고 테스트도 해',
    '이 자료를 분석해서 원인을 찾고 개선안을 비교해줘',
    '두 설계안을 비용, 유지보수성, 성능 관점에서 비교하고 최적안을 설계해줘'
  ]) {
    const result = analyzePromptComplexity(prompt);
    assert.equal(result.effort, 'medium', prompt);
  }
});

test('file paths and code blocks upgrade to MEDIUM', () => {
  assert.equal(
    classifyPromptComplexity('C:\\Github\\project 코드를 분석해서 성능 병목을 수정해줘'),
    'medium'
  );
  assert.equal(
    classifyPromptComplexity('이 코드 블록의 오류를 찾아줘\n```js\nreturn value;\n```'),
    'medium'
  );
});

test('a short single-step request stays LOW and no HIGH effort is exposed', () => {
  const result = analyzePromptComplexity('서울의 이번 주말 기온을 알려줘');
  assert.equal(result.effort, 'low');
  assert.deepEqual(Object.keys(result).sort(), ['effort', 'signals']);
  assert.equal('high' in result, false);
});

test('multiple explicit steps upgrade to MEDIUM without a second model call', () => {
  const result = analyzePromptComplexity('문서를 읽고 핵심을 요약한 다음 표로 정리해줘');
  assert.equal(result.effort, 'medium');
  assert.equal(result.signals.multipleSteps, true);
});
