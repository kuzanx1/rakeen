/**
 * Every Arabic string the app can put on screen must have an English entry.
 *
 * Why this exists: the cashier toggles «ع / EN» and expects every word to
 * follow. Translation lives in one table (src/ui/i18n.tsx + i18nMore.ts),
 * applied at <Text>; anything missing from the table silently stays Arabic.
 * By November 2026 that was ~500 strings -- whole screens written after the
 * table, half-English settings, «سفري» in an English order list. Nobody
 * notices at the time a screen is written, so the check has to be a test:
 * __tests__/i18nCoverage.test.ts runs this and fails on any miss.
 *
 * What counts: every string literal, template literal and JSX text with an
 * Arabic letter, under src/ and App.tsx. A template or a JSX run with
 * expressions inside («باقي ${n} طلب», <Text>باقي {n} طلب</Text>) must have
 * a placeholder key ('باقي {n} طلب').
 *
 * What does not:
 *  - PRINT_ONLY files: receipts and kitchen tickets stay Arabic on paper.
 *  - console.* arguments, accessibility/test ids.
 *  - Any line carrying the comment `i18n-ignore` -- for Arabic that is data
 *    or print output inside a UI file. Say why next to it.
 *
 * Run by hand:  node scripts/i18n-coverage.js
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const DICT_FILES = ['src/ui/i18n.tsx', 'src/ui/i18nMore.ts'];
const PRINT_ONLY = [
  'src/domain/receiptPrintable.ts',
  'src/domain/receiptRenderEscPos.ts',
  'src/domain/escposText.ts',
  'src/domain/escposTextReceipt.ts',
  'src/domain/receiptModel.ts',
  'src/application/receiptModelFromOrder.ts',
  'src/application/printStationService.ts',
  'src/application/receiptBench.ts',
];
const SKIP_ATTRS = new Set(['accessibilityLabel', 'accessibilityHint', 'testID', 'nativeID', 'key']);
const LETTER = /[ء-ي]/;

function normalize(v) {
  return v
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ً-ْـ]/g, '')
    .replace(/\{[a-zA-Z0-9_]*\}/g, '{}')
    .replace(/\s+/g, ' ')
    .trim();
}

function parse(rel) {
  const file = path.join(ROOT, rel);
  const src = fs.readFileSync(file, 'utf8');
  return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function dictionaryKeys() {
  const keys = new Set();
  for (const rel of DICT_FILES) {
    const sf = parse(rel);
    (function visit(n) {
      if (ts.isObjectLiteralExpression(n)) {
        for (const p of n.properties) {
          if (ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.name) || ts.isNoSubstitutionTemplateLiteral(p.name))) keys.add(normalize(p.name.text));
        }
      }
      ts.forEachChild(n, visit);
    })(sf);
  }
  return keys;
}

function walk(dir, out = []) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${f}`;
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(f)) out.push(rel);
  }
  return out;
}

function templateText(node) {
  let s = node.head.text;
  for (const span of node.templateSpans) s += '{}' + span.literal.text;
  return s;
}

function inConsole(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && /^console\./.test(p.expression.getText())) return true;
    if (ts.isJsxAttribute(p) && SKIP_ATTRS.has(p.name.getText())) return true;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
  }
  return false;
}

function findMissing() {
  const keys = dictionaryKeys();
  const files = ['App.tsx', ...walk('src')].filter(f => !DICT_FILES.includes(f) && !PRINT_ONLY.includes(f));
  const missing = [];
  for (const rel of files) {
    const sf = parse(rel);
    const lines = sf.getFullText().split('\n');
    const check = (text, node) => {
      const t = text.trim();
      if (!LETTER.test(t)) return;
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
      if (/i18n-ignore/.test(lines[line] || '') || /i18n-ignore/.test(lines[line - 1] || '')) return;
      if (inConsole(node)) return;
      if (keys.has(normalize(t))) return;
      missing.push({ file: rel, line: line + 1, text: t });
    };
    (function visit(n) {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        if (!(ts.isPropertyAssignment(n.parent) && n.parent.name === n) && !ts.isLiteralTypeNode(n.parent)) check(n.text, n);
        return;
      }
      if (ts.isTemplateExpression(n)) {
        check(templateText(n), n);
        n.templateSpans.forEach(s => visit(s.expression));
        return;
      }
      if (ts.isJsxElement(n)) {
        // A run of text and {expressions} between two elements reads as one
        // sentence on screen, so it is one key.
        let run = '';
        let first = null;
        let hasText = false;
        const flush = () => {
          if (first && hasText) check(run, first);
          run = '';
          first = null;
          hasText = false;
        };
        for (const c of n.children) {
          if (ts.isJsxText(c)) {
            if (!c.text.trim() && !run) continue;
            run += c.text.replace(/\s*\n\s*/g, ' ');
            first = first || c;
            if (LETTER.test(c.text)) hasText = true;
          } else if (ts.isJsxExpression(c) && c.expression && !ts.isJsxElement(c.expression) && !ts.isConditionalExpression(c.expression) && !ts.isBinaryExpression(c.expression) && !ts.isCallExpression(c.expression)) {
            // A plain value: {n}, {name}, {total.toFixed(2)} is a call --
            // a call might return an element, so it ends the run instead.
            run += '{}';
            first = first || c;
            visit(c.expression);
          } else {
            flush();
            visit(c);
          }
        }
        flush();
        visit(n.openingElement);
        return;
      }
      ts.forEachChild(n, visit);
    })(sf);
  }
  return missing;
}

module.exports = { findMissing, normalize };

if (require.main === module) {
  const missing = findMissing();
  if (process.argv[2] === '--json') {
    process.stdout.write(JSON.stringify(missing, null, 1));
  } else {
    for (const m of missing) console.log(`${m.file}:${m.line}  ${m.text}`);
    console.log(`\n${missing.length} Arabic string(s) with no English entry`);
  }
  process.exitCode = missing.length ? 1 : 0;
}
