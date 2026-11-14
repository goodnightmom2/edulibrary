import test from 'node:test';
import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { convertOmmlNodesToLatex, type OrderedXmlNode } from './ommlToLatex.ts';

const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
});

function ommlToLatex(xml: string): string {
  const parsed = parser.parse(xml) as OrderedXmlNode[];
  return convertOmmlNodesToLatex(parsed);
}

test('converts OMML fraction and radical to LaTeX accurately', () => {
  const xml = `
    <m:oMath>
      <m:f>
        <m:num><m:rad><m:deg/><m:e><m:r><m:t>x+1</m:t></m:r></m:e></m:rad></m:num>
        <m:den><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:den>
      </m:f>
    </m:oMath>
  `;
  assert.equal(ommlToLatex(xml), '\\frac{\\sqrt{x+1}}{x^{2}}');
});

test('converts OMML definite integral with limits and superscripts', () => {
  const xml = `
    <m:oMath>
      <m:nary>
        <m:naryPr><m:chr m:val="∫"/></m:naryPr>
        <m:sub><m:r><m:t>0</m:t></m:r></m:sub>
        <m:sup><m:r><m:t>π</m:t></m:r></m:sup>
        <m:e><m:func><m:fName><m:r><m:t>sin</m:t></m:r></m:fName><m:e><m:r><m:t>x dx</m:t></m:r></m:e></m:func></m:e>
      </m:nary>
    </m:oMath>
  `;
  assert.equal(ommlToLatex(xml), '\\int_{0}^{\\pi} \\sin x dx');
});

test('converts OMML matrix and vector accent cleanly', () => {
  const xml = `
    <m:oMath>
      <m:acc><m:accPr><m:chr m:val="→"/></m:accPr><m:e><m:r><m:t>F</m:t></m:r></m:e></m:acc>
      <m:r><m:t>=</m:t></m:r>
      <m:m>
        <m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e><m:e><m:r><m:t>2</m:t></m:r></m:e></m:mr>
        <m:mr><m:e><m:r><m:t>3</m:t></m:r></m:e><m:e><m:r><m:t>4</m:t></m:r></m:e></m:mr>
      </m:m>
    </m:oMath>
  `;
  assert.equal(ommlToLatex(xml), '\\vec{F} = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}');
});

test('converts OMML chemical equilibrium and subscripts', () => {
  const xml = `
    <m:oMath>
      <m:sSub><m:e><m:r><m:t>H</m:t></m:r></m:e><m:sub><m:r><m:t>2</m:t></m:r></m:sub></m:sSub>
      <m:r><m:t>SO</m:t></m:r>
      <m:sSub><m:e><m:r><m:t>4</m:t></m:r></m:e><m:sub><m:r><m:t></m:t></m:r></m:sub></m:sSub>
      <m:r><m:t>⇌</m:t></m:r>
      <m:sSup><m:e><m:r><m:t>H</m:t></m:r></m:e><m:sup><m:r><m:t>+</m:t></m:r></m:sup></m:sSup>
    </m:oMath>
  `;
  const latex = ommlToLatex(xml);
  assert.ok(latex.includes('H_{2}'));
  assert.ok(latex.includes('\\rightleftharpoons'));
  assert.ok(latex.includes('H^{+}'));
});
