//
//  ClassicWidget.ts
//  Gailan
//
//  A wrapper (something like a base class) around the specific implementation
//  of a widget.
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

const $ = require('jquery');
(window as any).jQuery = $;

const Timer = require('./Timer');
const runCommand = require('./runCommand');
const runShellCommand = require('./runShellCommand');

type Implementation = {
  id: string;
  refreshFrequency: number | false;
  command?: string;
  css?: string;
  render: (output: any) => string;
  afterRender: (el: HTMLElement) => void;
  update?: (output: any, el: HTMLElement) => void;
  [key: string]: any;
};

type WidgetError = {
  message: string;
  lines?: string;
};

const defaults = {
  id: 'widget',
  refreshFrequency: 1000,
  render: (output: any) => output,
  afterRender: () => {},
};

module.exports = function ClassicWidget(widgetObject: any) {
  const api: {[key: string]: any} = {};
  const internalApi: {[key: string]: any} = {};

  let el: HTMLElement | null = null;
  let contentEl: HTMLElement | null = null;
  let started = false;
  let rendered = false;
  let commandLoop: any = null;
  let implementation: Implementation = {} as Implementation;
  let currentError: WidgetError | null = null;

  function init(widget: any) {
    currentError = widget.error ? JSON.parse(widget.error) : null;
    implementation = widget.implementation || {};

    Object.entries(defaults).forEach(([key, value]) => {
      if (implementation[key] == null) implementation[key] = value;
    });
    Object.entries(internalApi).forEach(([key, value]) => {
      if (!implementation[key]) implementation[key] = value;
    });

    commandLoop = Timer().map((done: (wait: number | false) => void) => {
      runCommand(implementation, (err: WidgetError, output: any) => {
        redraw(err, output);
        done(implementation.refreshFrequency);
      });
    });

    return api;
  }

  // renders and returns the widget's dom element
  api.create = () => {
    el = document.createElement('div');
    contentEl = document.createElement('div');
    contentEl.id = implementation.id;
    contentEl.className = 'widget';
    el.innerHTML = `<style>${implementation.css}</style>\n`;
    el.appendChild(contentEl);

    start();
    return el;
  };

  api.destroy = () => {
    stop();
    if (!el) return;
    if (el.parentNode) el.parentNode.removeChild(el);
    el = null;
    contentEl = null;
    rendered = false;
  };

  api.update = (newImplementation: any) => {
    const parentEl = el && el.parentNode;
    api.destroy();
    init(newImplementation);
    if (parentEl) parentEl.appendChild(api.create());
  };

  api.domEl = () => el;

  api.isRendered = () => !!el;

  api.internalApi = () => internalApi;

  api.implementation = () => implementation;

  api.forceRefresh = () => internalApi.refresh();

  // starts the widget refresh cycle
  const start = (internalApi.start = () => {
    if (currentError) return redraw(currentError);
    commandLoop.start();
  });

  // stops the widget refresh cycle
  const stop = (internalApi.stop = () => {
    commandLoop.stop();
  });

  // run widget command and redraw the widget
  internalApi.refresh = () => {
    if (implementation.command == null) return redraw();
    commandLoop.forceTick();
  };

  // runs command in the shell and calls callback with the result (err, stdout)
  internalApi.run = (command: string, callback: (...args: any[]) => void) =>
    runShellCommand(command, callback);

  function redraw(error?: WidgetError | null, output?: any) {
    if (!contentEl) return;

    if (error) {
      contentEl.style.fontFamily = 'monospace';
      contentEl.style.fontSize = '12px';
      contentEl.style.whiteSpace = 'pre';
      contentEl.style.background = '#fff';
      contentEl.style.padding = '20px';
      contentEl.innerHTML = error.message + '\n' + (error.lines || '');
      console.error(`${implementation.id}:`, error);
      rendered = false;
      return;
    }

    contentEl.style.fontFamily = '';
    contentEl.style.fontSize = '';
    contentEl.style.whiteSpace = '';
    contentEl.style.background = '';
    contentEl.style.padding = '';

    try {
      renderOutput(output);
    } catch (e) {
      redraw(e as WidgetError);
    }
  }

  function renderOutput(output: any) {
    if (!contentEl) return;

    if (implementation.update != null && rendered) {
      implementation.update(output, contentEl);
      return;
    }

    contentEl.innerHTML = implementation.render(output);
    loadScripts(contentEl);

    implementation.afterRender(contentEl);
    rendered = true;
    if (implementation.update != null) {
      implementation.update(output, contentEl);
    }
  }

  // Replacing a script tag is how a widget's scripts actually get fetched: the
  // ones innerHTML creates are inert. The swap has to happen at the script's own
  // parent, since upstream asked the widget's root to replace a grandchild and
  // the DOM refused, leaving the widget showing an error instead of its markup.
  function loadScripts(domEl: HTMLElement) {
    Array.from(domEl.getElementsByTagName('script')).forEach((script) => {
      const replacement = document.createElement('script');
      replacement.src = script.src;
      if (script.parentNode) {
        script.parentNode.replaceChild(replacement, script);
      }
    });
  }

  return init(widgetObject);
};
