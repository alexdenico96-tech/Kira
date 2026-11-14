const test = require('node:test');
const assert = require('node:assert/strict');

(async () => {
  const { repairGeneratedHtml, repairHtmlMarkup } = await import('../lib/htmlArtifactRepair.js');

  test('remove escapes from HTML attribute quotes', () => {
    const input = String.raw`<html lang=\"pt-BR\"><meta charset=\"UTF-8\" />`;
    const result = repairHtmlMarkup(input);
    assert.equal(result.content, '<html lang="pt-BR"><meta charset="UTF-8" />');
    assert.equal(result.changed, 4);
  });

  test('preserve normal HTML without changes', () => {
    const input = '<!DOCTYPE html>\n<html lang="pt-BR"><body></body></html>';
    const result = repairHtmlMarkup(input);
    assert.equal(result.content, input);
    assert.equal(result.changed, 0);
  });

  test('repair markup quotes while preserving script body strings', () => {
    const input = String.raw`<script src=\"/app.js\">const value = "\\\"quoted\\\"";</script>
<div title=\"demo\">ok</div>`;
    const result = repairHtmlMarkup(input);
    assert.ok(result.content.includes('<script src="/app.js">'));
    assert.ok(result.content.includes(String.raw`const value = "\\\"quoted\\\"";`));
    assert.ok(result.content.includes('<div title="demo">ok</div>'));
  });

  test('repair accidental escaped DOCTYPE prefix', () => {
    const result = repairHtmlMarkup(String.raw`\<!DOCTYPE html>`);
    assert.equal(result.content, '<!DOCTYPE html>');
  });

  test('touch only HTML files in a project', () => {
    const files = [
      { path: 'index.html', content: String.raw`<div id=\"root\"></div>` },
      { path: 'src/App.jsx', content: String.raw`const value = \"keep\";` },
      { path: 'style.css', content: String.raw`.x { content: \"keep\"; }` }
    ];
    const result = repairGeneratedHtml(files);
    assert.equal(result.repairedFiles, 1);
    assert.equal(result.files[0].content, '<div id="root"></div>');
    assert.equal(result.files[1], files[1]);
    assert.equal(result.files[2], files[2]);
  });
})();
