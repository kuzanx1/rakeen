/**
 * Web cashier (public/pos/rakeen-pos.js): every Arabic text the screen can
 * show must have an English entry in its I18N_EN table.
 *
 * Same rule and same reason as react-native-poc/scripts/i18n-coverage.js:
 * translation is a lookup on each rendered text node, and a missing entry
 * stays Arabic on an English till with no error anywhere. Run by
 * `npm run precf:deploy`, so a screen cannot ship half-translated.
 *
 * What is read: string and template literals with an Arabic letter. HTML
 * inside them is split at tags (each piece becomes its own text node in the
 * page), `${...}` becomes a `{}` placeholder, and placeholder/title/
 * aria-label attribute values are checked too.
 *
 * What is not:
 *  - the I18N_EN table itself, console.* arguments;
 *  - functions that build paper (receipts, kitchen tickets, close reports)
 *    -- matched by name in PRINT_FN; paper stays Arabic;
 *  - any line with the comment `i18n-ignore` (say why next to it).
 *
 * node tools/i18n-check/pwa-coverage.cjs          → list misses
 * node tools/i18n-check/pwa-coverage.cjs --json   → machine-readable
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..', '..');
const FILE = 'public/pos/rakeen-pos.js';
// The till's static HTML (rendered once, then translated by the same walker).
const MARKUP = 'app/pos/pos-markup.ts';
const LETTER = /[ء-ي]/;
// Builders of printed paper. The till never shows these strings; the
// receipt must stay Arabic whatever the screen language is.
const PRINT_FN = /receipt|Receipt|kitchen|Kitchen|Ticket|ticket|escpos|EscPos|Escpos|closingReport|ClosingReport|printHtml|PrintHtml|zatca|Zatca/;
// Declarations that hold data, not UI text: the demo menu (names render
// inside #productGrid, which the translator skips and name_en covers),
// delivery-app brand names, the printed bilingual order kinds, and the
// Arabic-folding helper's own letters.
const DATA_DECL = new Set(['CATEGORIES', 'PRODUCTS', 'MODIFIER_PRODUCTS', 'UPSELL_RULES', 'DELIVERY_PLATFORMS', 'ORDER_KIND_BILINGUAL', 'normalizeArabic']);

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

function decode(v) {
  return v.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function load(rel = FILE) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
}

function tableNode(sf) {
  let found = null;
  (function v(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText() === 'I18N_EN' && n.initializer && ts.isObjectLiteralExpression(n.initializer)) found = n.initializer;
    if (!found) ts.forEachChild(n, v);
  })(sf);
  return found;
}

function keysOf(obj) {
  const keys = new Set();
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.name) || ts.isNoSubstitutionTemplateLiteral(p.name))) keys.add(normalize(p.name.text));
  }
  return keys;
}

function enclosingFnName(node) {
  for (let p = node.parent; p; p = p.parent) {
    if ((ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p)) && p.name && DATA_DECL.has(p.name.getText())) return p.name.getText();
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name && PRINT_FN.test(p.name.getText())) return p.name.getText();
    if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && ts.isVariableDeclaration(p.parent) && PRINT_FN.test(p.parent.name.getText())) return p.parent.name.getText();
    if (ts.isCallExpression(p) && /^console\./.test(p.expression.getText())) return 'console';
  }
  return null;
}

// Text pieces as the browser will split them into text nodes.
function pieces(text) {
  const out = [];
  const attrs = /\b(?:placeholder|title|aria-label)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = attrs.exec(text))) out.push(m[1]);
  for (const chunk of text.split(/<[^>]*>/)) out.push(chunk);
  return out.map(decode).map(s => s.trim()).filter(s => LETTER.test(s));
}

function findMissing() {
  const keys = keysOf(tableNode(load()));
  return [...scan(FILE, keys), ...scan(MARKUP, keys)];
}

function scan(rel, keys) {
  const sf = load(rel);
  const table = rel === FILE ? tableNode(sf) : null;
  const lines = sf.getFullText().split('\n');
  const missing = [];
  const check = (text, node) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
    if (/i18n-ignore/.test(lines[line] || '') || /i18n-ignore/.test(lines[line - 1] || '')) return;
    if (enclosingFnName(node)) return;
    for (const piece of pieces(text)) {
      if (keys.has(normalize(piece))) continue;
      missing.push({ file: rel, line: line + 1, text: piece });
    }
  };
  // 'اختر ' + n + ' على الأقل' becomes one text node on screen, so it is
  // one key: flatten a + chain that holds a string into a template.
  const flat = n => {
    if (ts.isParenthesizedExpression(n)) return flat(n.expression);
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const l = flat(n.left), r = flat(n.right);
      return { text: l.text + r.text, str: l.str || r.str, rest: [...l.rest, ...r.rest] };
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return { text: n.text, str: true, rest: [] };
    if (ts.isTemplateExpression(n)) {
      let s = n.head.text;
      for (const span of n.templateSpans) s += '{}' + span.literal.text;
      return { text: s, str: true, rest: n.templateSpans.map(sp => sp.expression) };
    }
    return { text: '{}', str: false, rest: [n] };
  };
  (function visit(n) {
    if (n === table) return;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && !(ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
      const f = flat(n);
      if (f.str) {
        check(f.text, n);
        f.rest.forEach(visit);
        return;
      }
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (!(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) check(n.text, n);
      return;
    }
    if (ts.isTemplateExpression(n)) {
      let s = n.head.text;
      for (const span of n.templateSpans) s += '{}' + span.literal.text;
      check(s, n);
      n.templateSpans.forEach(sp => visit(sp.expression));
      return;
    }
    ts.forEachChild(n, visit);
  })(sf);
  return missing;
}

module.exports = { findMissing };

if (require.main === module) {
  const missing = findMissing();
  if (process.argv[2] === '--json') process.stdout.write(JSON.stringify(missing, null, 1));
  else {
    for (const m of missing) console.log(`${m.file}:${m.line}  ${m.text}`);
    console.log(`\n${missing.length} Arabic string(s) in the web cashier with no English entry`);
  }
  process.exitCode = missing.length ? 1 : 0;
}
