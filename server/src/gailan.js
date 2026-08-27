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
    return JSON.parse(el.dataset.glass);
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

export {
  run,
  request,
  css,
  styled,
  React,
  Glass,
  GlassSurface,
  GlassMaterial,
  glassSettings,
};
