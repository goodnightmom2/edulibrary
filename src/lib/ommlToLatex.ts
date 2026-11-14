/**
 * Pure TypeScript OOXML Math Markup Language (OMML) -> LaTeX converter.
 * Preserves fractions, radicals, integrals, summations, limits, matrices,
 * subscripts/superscripts, accents/vectors, delimiters, and math/chemistry symbols.
 */

export interface OrderedXmlNode {
  [tagName: string]: unknown;
  ':@'?: Record<string, string>;
}

const SYMBOL_MAP: Record<string, string> = {
  '×': '\\times ',
  '÷': '\\div ',
  '±': '\\pm ',
  '∓': '\\mp ',
  '≤': '\\le ',
  '≥': '\\ge ',
  '≠': '\\ne ',
  '≈': '\\approx ',
  '≡': '\\equiv ',
  '∞': '\\infty ',
  '→': '\\rightarrow ',
  '←': '\\leftarrow ',
  '↔': '\\leftrightarrow ',
  '⇒': '\\Rightarrow ',
  '⇔': '\\Leftrightarrow ',
  '⇌': '\\rightleftharpoons ',
  '∈': '\\in ',
  '∉': '\\notin ',
  '⊂': '\\subset ',
  '⊆': '\\subseteq ',
  '∪': '\\cup ',
  '∩': '\\cap ',
  '∀': '\\forall ',
  '∃': '\\exists ',
  '∂': '\\partial ',
  '∇': '\\nabla ',
  '∫': '\\int ',
  '∑': '\\sum ',
  '∏': '\\prod ',
  '√': '\\sqrt{}',
  '°': '^\\circ ',
  '∠': '\\angle ',
  '⊥': '\\perp ',
  '∥': '\\parallel ',
  '△': '\\triangle ',
  'α': '\\alpha ',
  'β': '\\beta ',
  'γ': '\\gamma ',
  'δ': '\\delta ',
  'Δ': '\\Delta ',
  'ε': '\\varepsilon ',
  'θ': '\\theta ',
  'λ': '\\lambda ',
  'μ': '\\mu ',
  'π': '\\pi ',
  'ρ': '\\rho ',
  'σ': '\\sigma ',
  'φ': '\\varphi ',
  'ω': '\\omega ',
  'Ω': '\\Omega ',
  '⋅': '\\cdot ',
  '·': '\\cdot ',
};

export function mapMathSymbols(raw: string): string {
  let out = '';
  for (const ch of raw) {
    out += SYMBOL_MAP[ch] ?? ch;
  }
  return out;
}

function getTagKey(node: OrderedXmlNode): string | null {
  for (const key of Object.keys(node)) {
    if (key !== ':@' && key !== '#text') return key;
  }
  return null;
}

function getChildren(node: OrderedXmlNode, tag: string): OrderedXmlNode[] {
  const val = node[tag];
  return Array.isArray(val) ? (val as OrderedXmlNode[]) : [];
}

function findChildByTag(nodes: OrderedXmlNode[], tag: string): OrderedXmlNode | undefined {
  return nodes.find((n) => Object.prototype.hasOwnProperty.call(n, tag));
}

function findAttr(node: OrderedXmlNode, propTag: string, attrName: string): string | undefined {
  const key = getTagKey(node);
  if (!key) return undefined;
  const children = getChildren(node, key);
  const pr = findChildByTag(children, propTag);
  if (!pr) return undefined;
  const prChildren = getChildren(pr, propTag);
  for (const child of prChildren) {
    const childKey = getTagKey(child);
    if (childKey && childKey.endsWith(attrName)) {
      const attrs = child[':@'];
      if (attrs && typeof attrs['@_m:val'] === 'string') return attrs['@_m:val'];
      if (attrs && typeof attrs['@_w:val'] === 'string') return attrs['@_w:val'];
      if (attrs && typeof attrs['@_val'] === 'string') return attrs['@_val'];
    }
  }
  return undefined;
}

function extractTextFromNodes(nodes: OrderedXmlNode[]): string {
  let result = '';
  for (const node of nodes) {
    if (node['#text'] !== undefined && node['#text'] !== null) {
      result += String(node['#text']);
      continue;
    }
    const key = getTagKey(node);
    if (!key) continue;
    result += extractTextFromNodes(getChildren(node, key));
  }
  return result;
}

function wrapGroup(tex: string): string {
  const trimmed = tex.trim();
  if (!trimmed) return '{}';
  if (trimmed.length === 1 && /[a-zA-Z0-9]/.test(trimmed)) return trimmed;
  return `{${trimmed}}`;
}

export function convertOmmlNodesToLatex(nodes: OrderedXmlNode[]): string {
  let out = '';

  for (const node of nodes) {
    if (node['#text'] !== undefined && node['#text'] !== null) {
      out += mapMathSymbols(String(node['#text']));
      continue;
    }

    const key = getTagKey(node);
    if (!key) continue;
    const children = getChildren(node, key);

    switch (key) {
      case 'm:oMathPara':
      case 'm:oMath':
      case 'm:e':
      case 'm:num':
      case 'm:den':
      case 'm:sub':
      case 'm:sup':
      case 'm:deg':
      case 'm:lim':
      case 'm:fName': {
        out += convertOmmlNodesToLatex(children);
        break;
      }

      case 'm:r': {
        const textNode = findChildByTag(children, 'm:t') || findChildByTag(children, 'w:t');
        if (textNode) {
          const textTag = Object.prototype.hasOwnProperty.call(textNode, 'm:t') ? 'm:t' : 'w:t';
          const raw = extractTextFromNodes(getChildren(textNode, textTag));
          out += mapMathSymbols(raw);
        } else {
          out += convertOmmlNodesToLatex(children);
        }
        break;
      }

      case 'm:t':
      case 'w:t': {
        out += mapMathSymbols(extractTextFromNodes(children));
        break;
      }

      case 'm:f': {
        // Fraction
        const numNode = findChildByTag(children, 'm:num');
        const denNode = findChildByTag(children, 'm:den');
        const num = numNode ? convertOmmlNodesToLatex(getChildren(numNode, 'm:num')).trim() : '';
        const den = denNode ? convertOmmlNodesToLatex(getChildren(denNode, 'm:den')).trim() : '';
        out += `\\frac{${num}}{${den}}`;
        break;
      }

      case 'm:rad': {
        // Radical / nth root
        const degNode = findChildByTag(children, 'm:deg');
        const eNode = findChildByTag(children, 'm:e');
        const deg = degNode ? convertOmmlNodesToLatex(getChildren(degNode, 'm:deg')).trim() : '';
        const body = eNode ? convertOmmlNodesToLatex(getChildren(eNode, 'm:e')).trim() : '';
        if (deg) {
          out += `\\sqrt[${deg}]{${body}}`;
        } else {
          out += `\\sqrt{${body}}`;
        }
        break;
      }

      case 'm:sSup': {
        const eNode = findChildByTag(children, 'm:e');
        const supNode = findChildByTag(children, 'm:sup');
        const base = eNode ? convertOmmlNodesToLatex(getChildren(eNode, 'm:e')).trim() : '';
        const sup = supNode ? convertOmmlNodesToLatex(getChildren(supNode, 'm:sup')).trim() : '';
        out += `${wrapGroup(base)}^{${sup}}`;
        break;
      }

      case 'm:sSub': {
        const eNode = findChildByTag(children, 'm:e');
        const subNode = findChildByTag(children, 'm:sub');
        const base = eNode ? convertOmmlNodesToLatex(getChildren(eNode, 'm:e')).trim() : '';
        const sub = subNode ? convertOmmlNodesToLatex(getChildren(subNode, 'm:sub')).trim() : '';
        out += `${wrapGroup(base)}_{${sub}}`;
        break;
      }

      case 'm:sSubSup': {
        const eNode = findChildByTag(children, 'm:e');
        const subNode = findChildByTag(children, 'm:sub');
        const supNode = findChildByTag(children, 'm:sup');
        const base = eNode ? convertOmmlNodesToLatex(getChildren(eNode, 'm:e')).trim() : '';
        const sub = subNode ? convertOmmlNodesToLatex(getChildren(subNode, 'm:sub')).trim() : '';
        const sup = supNode ? convertOmmlNodesToLatex(getChildren(supNode, 'm:sup')).trim() : '';
        out += `${wrapGroup(base)}_{${sub}}^{${sup}}`;
        break;
      }

      case 'm:nary': {
        // Integral, Summation, Product
        const chr = findAttr(node, 'm:naryPr', 'chr') || '∫';
        const opMap: Record<string, string> = {
          '∫': '\\int',
          '∬': '\\iint',
          '∭': '\\iiint',
          '∮': '\\oint',
          '∑': '\\sum',
          '∏': '\\prod',
          '⋃': '\\bigcup',
          '⋂': '\\bigcap',
        };
        const op = opMap[chr] || '\\int';
        const subNode = findChildByTag(children, 'm:sub');
        const supNode = findChildByTag(children, 'm:sup');
        const eNode = findChildByTag(children, 'm:e');
        const sub = subNode ? convertOmmlNodesToLatex(getChildren(subNode, 'm:sub')).trim() : '';
        const sup = supNode ? convertOmmlNodesToLatex(getChildren(supNode, 'm:sup')).trim() : '';
        const body = eNode ? convertOmmlNodesToLatex(getChildren(eNode, 'm:e')).trim() : '';
        out += `${op}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''} ${body}`;
        break;
      }

      case 'm:limLow': {
        const eNode = findChildByTag(children, 'm:e');
        const limNode = findChildByTag(children, 'm:lim');
        const base = eNode ? convertOmmlNodesToLatex(getChildren(eNode, 'm:e')).trim() : '';
        const lim = limNode ? convertOmmlNodesToLatex(getChildren(limNode, 'm:lim')).trim() : '';
        const normBase = base === 'lim' ? '\\lim' : base;
        out += `${normBase}_{${lim}} `;
        break;
      }

      case 'm:limUpp': {
        const eNode = findChildByTag(children, 'm:e');
        const limNode = findChildByTag(children, 'm:lim');
        const base = eNode ? convertOmmlNodesToLatex(getChildren(eNode, 'm:e')).trim() : '';
        const lim = limNode ? convertOmmlNodesToLatex(getChildren(limNode, 'm:lim')).trim() : '';
        out += `\\overset{${lim}}{${base}}`;
        break;
      }

      case 'm:d': {
        // Delimiters () [] {} ||
        const begChr = findAttr(node, 'm:dPr', 'begChr') ?? '(';
        const endChr = findAttr(node, 'm:dPr', 'endChr') ?? ')';
        const left = begChr === '{' ? '\\{' : begChr === '' ? '.' : begChr;
        const right = endChr === '}' ? '\\}' : endChr === '' ? '.' : endChr;
        const eNodes = children.filter((c) => Object.prototype.hasOwnProperty.call(c, 'm:e'));
        const parts = eNodes.map((e) => convertOmmlNodesToLatex(getChildren(e, 'm:e')).trim());
        out += `\\left${left} ${parts.join(', ')} \\right${right}`;
        break;
      }

      case 'm:m': {
        // Matrix
        const rows = children.filter((c) => Object.prototype.hasOwnProperty.call(c, 'm:mr'));
        const rowLatex = rows.map((row) => {
          const cells = getChildren(row, 'm:mr').filter((c) =>
            Object.prototype.hasOwnProperty.call(c, 'm:e')
          );
          return cells.map((cell) => convertOmmlNodesToLatex(getChildren(cell, 'm:e')).trim()).join(' & ');
        });
        out += `\\begin{pmatrix} ${rowLatex.join(' \\\\ ')} \\end{pmatrix}`;
        break;
      }

      case 'm:eqArr': {
        // Equation array (system of equations)
        const eqs = children.filter((c) => Object.prototype.hasOwnProperty.call(c, 'm:e'));
        const lines = eqs.map((e) => convertOmmlNodesToLatex(getChildren(e, 'm:e')).trim());
        out += `\\begin{cases} ${lines.join(' \\\\ ')} \\end{cases}`;
        break;
      }

      case 'm:acc': {
        // Accent (vector arrow, overline, hat)
        const chr = findAttr(node, 'm:accPr', 'chr') || '\u20D7';
        const eNode = findChildByTag(children, 'm:e');
        const body = eNode ? convertOmmlNodesToLatex(getChildren(eNode, 'm:e')).trim() : '';
        if (chr === '\u20D7' || chr === '→' || chr === '⃗') {
          out += `\\vec{${body}}`;
        } else if (chr === '¯' || chr === '\u0304' || chr === '\u0305') {
          out += `\\overline{${body}}`;
        } else if (chr === '^' || chr === '\u0302') {
          out += `\\hat{${body}}`;
        } else {
          out += `\\vec{${body}}`;
        }
        break;
      }

      case 'm:bar': {
        const eNode = findChildByTag(children, 'm:e');
        const body = eNode ? convertOmmlNodesToLatex(getChildren(eNode, 'm:e')).trim() : '';
        out += `\\overline{${body}}`;
        break;
      }

      case 'm:func': {
        const fNameNode = findChildByTag(children, 'm:fName');
        const eNode = findChildByTag(children, 'm:e');
        const fn = fNameNode ? convertOmmlNodesToLatex(getChildren(fNameNode, 'm:fName')).trim() : '';
        const arg = eNode ? convertOmmlNodesToLatex(getChildren(eNode, 'm:e')).trim() : '';
        const stdFns = ['sin', 'cos', 'tan', 'cot', 'log', 'ln', 'lim', 'exp', 'max', 'min'];
        const fnTex = stdFns.includes(fn) ? `\\${fn}` : fn;
        out += `${fnTex} ${arg}`;
        break;
      }

      case 'm:rPr':
      case 'm:fPr':
      case 'm:radPr':
      case 'm:naryPr':
      case 'm:dPr':
      case 'm:mPr':
      case 'm:accPr':
      case 'm:sSupPr':
      case 'm:sSubPr':
      case 'm:sSubSupPr':
      case 'm:oMathParaPr':
      case 'm:ctrlPr':
      case 'w:rPr':
        // Skip formatting metadata nodes
        break;

      default: {
        out += convertOmmlNodesToLatex(children);
      }
    }
  }

  return out.replace(/\s+/g, ' ').trim();
}
