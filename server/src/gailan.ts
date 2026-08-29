//
//  gailan.ts
//  Gailan
//
//  The module widgets import. CommonJS rather than ESM so it can be required
//  directly as well as bundled.
//
//  Copyright (c) 2026 Kevin Chen.
//  Based on code by Felix Hageloh.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//
'use strict';

const run = require('./runShellCommand');
const request = require('superagent');
const {css} = require('@emotion/css');
const styled = require('@emotion/styled').default;
const React = require('react');
const {constrainDrag} = require('./constrainDrag');

type DesktopGlassProps = {
  radius?: number;
  style?: Record<string, unknown>;
  children?: unknown;
  [key: string]: unknown;
};

// The page cannot see what is behind its window, so glass over the desktop is
// drawn by macOS. This marks the area; the app asks the system for the rest.
const DesktopGlass = ({
  radius = 12,
  style,
  children,
  ...rest
}: DesktopGlassProps) =>
  React.createElement(
    'div',
    {
      ...rest,
      'data-gailan-desktop-glass': radius,
      style: {borderRadius: radius, ...(style || {})},
    },
    children
  );

module.exports = {run, request, css, styled, React, DesktopGlass, constrainDrag};
