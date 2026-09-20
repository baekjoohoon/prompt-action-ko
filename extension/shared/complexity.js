(function (root) {
  'use strict';

  const LOW = 'low';
  const MEDIUM = 'medium';

  const COMPLEXITY_EFFORTS = Object.freeze({ LOW, MEDIUM });
  const CODE_BLOCK_PATTERN = /```[\s\S]*```/;
  const FILE_PATH_PATTERN = /(?:[A-Za-z]:[\\/]|(?:^|[\s"'(`])(?:\.\.?[\\/]|~\/)|(?:^|[\s"'(])\/(?:[^/\s]+\/)+)/;
  const ANALYSIS_PATTERN = /(?:\banaly[sz](?:e|ing|is|ed)?\b|\bdiagnos(?:e|is|ing|ed)?\b|\broot cause\b|\btroubleshoot(?:ing|ed)?\b|\binvestigat(?:e|ing|ed)\b|\bassess\b|\bevaluate\b|분석|원인|근본 원인|진단|문제.{0,12}찾|개선안|검토)/iu;
  const CODING_PATTERN = /(?:\b(?:code|coding|debug|debugging|bug|test|tests|testing|build|compile|implement|refactor|regression)\b|코드|프로그램|디버그|버그|테스트|빌드|컴파일|구현|리팩터|회귀)/iu;
  const DESIGN_PATTERN = /(?:\b(?:architecture|architectural|system design|technical design|maintainability|scalability)\b|아키텍처|설계|유지보수성|확장성|구조|리팩터)/iu;
  const OPTIMIZATION_PATTERN = /(?:\boptimi[sz](?:e|ation|ing|ed)\b|performance bottleneck|성능 최적화|최적화|병목)/iu;
  const MULTI_STEP_PATTERN = /(?:\b(?:then|also|after that|before|first|next|finally|and then|as well as)\b|그리고|해서|하고|한 다음|이후|및|동시에|까지|[가-힣]+고(?=\s))/giu;
  const CONSTRAINT_PATTERN = /(?:\b(?:must|should|need to|do not|don't|preserve|keep|without|only|exactly|at least|unless|constraint|acceptance)\b|반드시|해야|하지 말|유지|그대로|제외|조건|제약|요구사항)/giu;
  const CRITERIA_PATTERNS = Object.freeze([
    /\bcost\b|\bprice\b|비용|가격/iu,
    /\bmaintainability\b|\bmaintenance\b|유지보수/iu,
    /\bperformance\b|성능/iu,
    /\bsecurity\b|보안/iu,
    /\bscalability\b|확장성/iu,
    /\breliability\b|신뢰성/iu,
    /\bpros and cons\b|\btrade-?offs?\b|장단점/iu,
    /\bcriteria\b|관점/iu
  ]);

  function countMatches(source, pattern) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    return [...source.matchAll(globalPattern)].length;
  }

  function hasComparisonWithMultipleCriteria(source) {
    const hasComparison = /(?:\bcompar(?:e|ison|ing)\b|\bversus\b|\bvs\.?\b|비교)/iu.test(source);
    if (!hasComparison) {
      return false;
    }
    return CRITERIA_PATTERNS.filter((pattern) => pattern.test(source)).length >= 2;
  }

  function hasMultipleExplicitConstraints(source) {
    return countMatches(source, CONSTRAINT_PATTERN) >= 2;
  }

  function hasMultipleSteps(source) {
    const stepCount = countMatches(source, MULTI_STEP_PATTERN);
    const listItemCount = (source.match(/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/gmu) || []).length;
    return stepCount >= 2 || listItemCount >= 2;
  }

  function hasLongStructuredInput(source) {
    if (source.length < 700) {
      return false;
    }
    const lineCount = source.split(/\r?\n/).length;
    const hasList = /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/mu.test(source);
    return lineCount >= 4 || hasList;
  }

  function analyzePromptComplexity(text) {
    const source = typeof text === 'string' ? text : '';
    const signals = {
      codeBlock: CODE_BLOCK_PATTERN.test(source),
      filePath: FILE_PATH_PATTERN.test(source),
      analysisIntent: ANALYSIS_PATTERN.test(source),
      codingOrTestingIntent: CODING_PATTERN.test(source),
      designIntent: DESIGN_PATTERN.test(source),
      optimizationIntent: OPTIMIZATION_PATTERN.test(source),
      comparisonWithMultipleCriteria: hasComparisonWithMultipleCriteria(source),
      multipleSteps: hasMultipleSteps(source),
      multipleConstraints: hasMultipleExplicitConstraints(source),
      longStructuredInput: hasLongStructuredInput(source)
    };

    const medium = Object.values(signals).some(Boolean);
    return {
      effort: medium ? MEDIUM : LOW,
      signals
    };
  }

  function classifyPromptComplexity(text) {
    return analyzePromptComplexity(text).effort;
  }

  const api = Object.freeze({
    COMPLEXITY_EFFORTS,
    analyzePromptComplexity,
    classifyPromptComplexity
  });

  root.PromptActionComplexity = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
