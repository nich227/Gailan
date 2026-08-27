// The frontend specs used to be bundled and handed to electron. Electron will
// not install on node 26, so they run against jsdom instead. Loaded with tape's
// -r so the globals exist before anything requires jquery, react or superagent.
const Module = require('module');
const {JSDOM, VirtualConsole} = require('jsdom');

// emotion emits css jsdom's parser rejects, and those errors are noise here
const virtualConsole = new VirtualConsole();
virtualConsole.forwardTo(console, {jsdomErrors: 'none'});

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true, // gives us requestAnimationFrame
  virtualConsole,
});

// jsdom has no matchMedia, and the client asks it about the appearance
if (!dom.window.matchMedia) {
  dom.window.matchMedia = (query) => ({
    media: query,
    matches: false,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

global.window = dom.window;
global.document = dom.window.document;

// In a browser, window is the global, so VirtualDomWidget's window.html is what
// the error views call. Under jsdom the two are separate objects, so the factory
// has to be put where a bare html() will find it.
global.html = require('react').createElement;

for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in global || key.startsWith('_')) continue;
  try {
    global[key] = dom.window[key];
  } catch (e) {
    // a few are read-only in node, where node's own version will do
  }
}

// superagent reads window.XMLHttpRequest while nise fakes the global one, so
// point the window at whatever the global currently is
global.XMLHttpRequest = dom.window.XMLHttpRequest;
Object.defineProperty(dom.window, 'XMLHttpRequest', {
  configurable: true,
  get: () => global.XMLHttpRequest,
});

// browserify picks superagent's xhr build for the widget bundle, so that is the
// one to exercise. node would otherwise resolve its http build, which sidesteps
// the fake server the specs install.
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'superagent') {
    return load.call(this, 'superagent/lib/client', ...rest);
  }
  return load.call(this, request, ...rest);
};
