//
//  MissingDependencies.js
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//
'use strict';

// What a widget looks like when it has asked for something the machine does not
// have. Gailan draws this rather than each widget, so a widget author writes none
// of it and every widget reads the same way.
//
// The widget's own content is drawn underneath and blurred, not replaced: the point
// is that this widget is blocked, not that it is gone. The message is not blurred
// and takes no filter of its own, since a filter on an ancestor would apply to it.

const React = require('react');
const html = React.createElement;

const holder = {
  position: 'relative',
  display: 'inline-block',
};

const behind = {
  filter: 'blur(6px)',
  // it cannot do anything useful, so it should not answer a click either
  pointerEvents: 'none',
  userSelect: 'none',
};

const notice = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px 14px',
  boxSizing: 'border-box',
  background: 'rgba(11, 11, 12, 0.58)',
  color: '#f4f4f2',
  font: '11px/1.4 "SF Mono", ui-monospace, Menlo, monospace',
  // a long list of names has to wrap rather than run past the widget's edge
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  whiteSpace: 'normal',
  textAlign: 'center',
};

const names = {
  color: '#f0b13b',
};

/* One sentence, then the names. An interpreter that is missing is named instead of
   the package that needed it, since installing the package is not the thing to do. */
function nameFor(dep) {
  if (dep.state === 'no-interpreter') {
    return interpreterFor(dep.type) || dep.name;
  }
  return dep.name;
}

function interpreterFor(type) {
  return {python: 'python3', ruby: 'ruby', brew: 'brew', node: 'node'}[type];
}

module.exports = function MissingDependencies(props) {
  const missing = props.missing || [];
  const listed = missing.map(nameFor).filter(Boolean);
  // the same name twice reads as a mistake, and two widgets can want one thing
  const unique = listed.filter((name, i) => listed.indexOf(name) === i);

  return html(
    'div',
    {style: holder},
    html('div', {style: behind, key: 'content'}, props.children),
    html(
      'div',
      {style: notice, key: 'notice'},
      html(
        'span',
        null,
        'This widget requires dependencies that are not yet installed: ',
        html('span', {style: names}, unique.join(', '))
      )
    )
  );
};
