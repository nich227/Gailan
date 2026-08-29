'use strict';

const test = require('tape');
const path = require('path');
const fs = require('fs');
const os = require('os');

const esbuildWidget = require('../../src/esbuildWidget');

// A widget writing <> used to compile to React.Fragment, which no widget imports, so it
// threw on render and drew nothing. The bundler points at the fragment the client puts on
// the window instead.
test('a widget using a fragment does not reach for React', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-fragment-'));
  const file = path.join(dir, 'index.tsx');

  fs.writeFileSync(
    file,
    [
      'import { styled } from "gailan";',
      'const Row = styled("div")`color: red;`;',
      'export const command = "echo hi";',
      'export const render = () => (',
      '  <Row>',
      '    <>',
      '      <span>one</span>',
      '      <span>two</span>',
      '    </>',
      '  </Row>',
      ');',
    ].join('\n')
  );

  const bundle = esbuildWidget('fragment-widget', file);

  bundle.bundle((err, source) => {
    t.error(err, 'it compiles');
    const body = String((source && source.body) || source || '');
    t.ok(body.length > 0, 'and produced something');
    t.notOk(
      /React\.Fragment/.test(body),
      'without asking a widget for React.Fragment'
    );
    t.ok(/htmlFragment/.test(body), 'using the one the page provides');

    bundle.close();
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});
