import run from './runShellCommand';
import request from 'superagent';
import {css} from '@emotion/css';
import styled from '@emotion/styled';
import React from 'react';
// Liquid Glass by Sam Asante, MIT licensed. See licenses/liquid-glass-LICENSE.txt
import {
  Glass as RawGlass,
  GlassSurface,
  GlassMaterial,
} from './vendor/liquidGlass';

// Gailan's Preferences carry an enable switch and the optics; the client puts
// them on the document so a widget can just use <Glass> and inherit them.
function glassSettings() {
  const el = typeof document !== 'undefined' && document.documentElement;
  if (!el || !el.dataset.glass) return {enabled: true, optics: {}};
  try {
    const settings = JSON.parse(el.dataset.glass);
    return {enabled: settings.enabled !== false, optics: settings.optics || {}};
  } catch (e) {
    return {enabled: true, optics: {}};
  }
}

// Same component, except it honours the preference: disabled renders the
// children plainly, and the user's optics are the defaults a widget overrides.
const Glass = (props) => {
  const {enabled, optics} = glassSettings();
  if (!enabled) return props.children || null;
  return React.createElement(RawGlass, {
    ...props,
    optics: {...optics, ...(props.optics || {})},
  });
};

// Glass over the desktop rather than over page content. The system draws the
// material behind the window, because the page cannot see what is back there;
// this only marks the area, and the app does the rest.
const DesktopGlass = ({radius = 12, style, children, ...rest}) =>
  React.createElement(
    'div',
    {
      ...rest,
      'data-gailan-desktop-glass': radius,
      style: {borderRadius: radius, ...(style || {})},
    },
    children
  );

export {
  run,
  request,
  css,
  styled,
  React,
  Glass,
  GlassSurface,
  GlassMaterial,
  DesktopGlass,
  glassSettings,
};
