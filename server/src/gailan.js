import run from './runShellCommand';
import request from 'superagent';
import {css} from '@emotion/css';
import styled from '@emotion/styled';
import React from 'react';
// The page cannot see what is behind its window, so glass over the desktop is
// drawn by macOS. This marks the area; the app asks the system for the rest.
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

export {run, request, css, styled, React, DesktopGlass};
