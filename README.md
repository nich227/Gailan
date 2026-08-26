# Gailan (概览 · Gàilǎn)
*Keep an eye on what's happening on your machine and in the world.*

**Gailan** (概览 - Gàilǎn) is the exact translation of *Übersicht* ("Overview") — a clean, six-letter
romanization that feels like a native developer tool in Latin script.

Read it in Cantonese instead and you get 芥蘭 🥦, Chinese broccoli. That wasn't the plan, but a leafy
green that sits there quietly and asks nothing of you is not the worst thing to name a desktop
widget host after.

Gailan is a fork of [felixhageloh/uebersicht](https://github.com/felixhageloh/uebersicht). For general
info on the original project, check out the [Übersicht website](http://tracesof.net/uebersicht).

## Differences from Übersicht

Everything is renamed, which means Gailan installs and runs alongside Übersicht rather than
upgrading it:

  - bundle id is `com.nich227.Gailan` (AppleScript needs the new id)
  - widgets live in `~/Library/Application Support/Gailan/widgets`
  - the widget API module is imported as `gailan`; `uebersicht` still resolves, so existing
    widgets keep working
  - the container element is `#gailan`, so user CSS targeting `#uebersicht` needs updating
  - requires macOS 13.5 or later, because the bundled Node runtime does

The Node runtime is Node 26 and is no longer checked into git; see [Building Gailan](#building-gailan).

## Writing Widgets

In essence, widgets are JavaScript modules that expose a few key properties and methods. They need to be defined in a single file with a `.jsx` extension for Gailan to pick them up. Widgets could previously be written in CoffeeScript, and those are still supported. Check [the old documentation](ClassicWidgets.md) for details. Gailan listens for file changes inside your widget directory, so you can edit widgets and see the result live.

Widget rendering is done using [React](https://react.dev) and its [JSX](https://react.dev/learn/writing-markup-with-jsx) syntax. Simple widget state is managed for you by Gailan, but for more advanced widgets you can manage state using a Redux-like pattern. You `dispatch` events, which are processed by a single `updateState` function that returns the new state, which is then passed to your widget's render function.

State is kept when you modify your widget, which allows for live coding. Any changes to the UI of your widget will be immediately visible. One drawback (at least with the current implementation) is that if you change the shape of your state you might have to 'Refresh all Widgets' from the app menu for your widget to work.

You can also include node modules and split your widget into separate files using [ESM syntax](http://2ality.com/2014/09/es6-modules-final.html). Any file that is in a directory called `/node_modules`, `/lib` or `/src` will be treated as a module and will not show up as a separate widget.

The following properties and methods are supported:

### command

A **string** containing the shell command to be executed, or<br>
a **function(dispatch : function)** which eventually dispatches an event,
or **undefined**, meaning that no command will be executed for this widget.

For example:

```jsx
export const command = "echo Hello World";
```

Watch out for quotes inside commands. Often they need to be properly escaped, like:

```jsx
export const command = "ps axo \"rss,pid,ucomm\" | sort -nr | head -n3";
```

Example using a command function:

```jsx
export const command = (dispatch) =>
  fetch('some/url.json')
    .then((response) => {
      dispatch({ type: 'FETCH_SUCCEEDED', data: response.json() });
    })
    .catch((error) => {
      dispatch({ type: 'FETCH_FAILED', error: error });
    });
```

The first and only argument passed to a command function is a `dispatch` function, which you can use to dispatch plain JavaScript objects, called events, to be picked up by your `updateState` function.


### refreshFrequency

A **number** specifying how often the above command is executed.

It defines the delay in milliseconds between consecutive command executions. Example:

```jsx
export const refreshFrequency = 1000; // widget will run command once a second
```

The default is 1000 (1s). If set to `false` the widget won't refresh automatically.

### className

An **object** or **string** defining the CSS rules to be applied to the root of your widget.

It is most commonly used to control the position of your widget. It is converted to a CSS class name using the [Emotion CSS-in-JS library](https://emotion.sh/docs/css). Read more about [styling your widgets](#styling-widgets).

```jsx
export const className = {
  top: 0,
  left: 0,
  color: '#fff'
}
```

or

```jsx
export const className = `
  top: 0;
  left: 0;
  color: #fff;
`
```

Note that widgets are positioned absolutely in relation to the screen (minus the menu bar), so a widget with `top: 0` and `left: 0` will be positioned in the top left corner of the screen, just below the menu bar.

### render : props

A **function(props : object)** to render your widget.

If you know [React functional components](https://react.dev/learn/your-first-component), you know how render works. The `props` passed to this function is whatever state your `updateState` function returns. If you don't provide your own `updateState` function, the default props that are passed are `output` and `error`, containing the output your command produced and any error that might have occurred.

```jsx
export const render = ({output, error}) => {
  return error ? (
    <div>Something went wrong: <strong>{String(error)}</strong></div>
  ) : (
    <div>
      <h1>We got some output!</h1>
      <p>{output}</p>
    </div>
  );
}
```

The default implementation of render just returns `output`.

### updateState : event, previousState

A **function(event : object, previousState : object)** implementing the state update behavior of this widget.

When provided, this function must return the next state, which will be passed as `props` to your render function. The default function will return `output` and `error` from the event object.

```jsx
export const updateState = (event, previousState) => {
  if (event.error) {
    return { ...previousState, warning: `We got an error: ${event.error}` };
  }
  const [cpuPct, processName] = event.output.split(',');
  return {
    cpuPct: parseFloat(cpuPct),
    processName
  };
}
```
This will pass a props object containing `cpuPct` and `processName` to the render function. If an error occurred, it will pass the previous state plus a warning message.

If your widget has more complex state logic, for example because it is fetching data from several different sources, it is a good idea to add a `type` property to your events. You can use this type to decide how to update your state. For example:

```jsx
export const updateState = (event, previousState) => {
  switch(event.type) {
    case 'CO2_FETCHED': return updateCo2(event.output, previousState);
    case 'TEMPERATURE_FETCHED': return updateTemp(event.output, previousState);
    default: {
      return previousState;
    }
  }
}
```

This example also shows that you can make use of functions to further break down your state update logic.

### initialState

An **object** with the initial state of your widget.

If you provide a custom `updateState` function you might need to define the initial state that gets passed on the initial render of the widget, before any command has been run.

```jsx
export const initialState = { output: 'fetching data...' };
```

The default initial state is `{ output: '' }`.

### init : dispatch

A **function(dispatch : function)** that is called the first time your widget loads. Many widgets won't need this, but you can use this function to perform any initial setup for more advanced use cases. For example, instead of relying on periodic shell commands, you might want to open and listen to WebSocket events to update your widget.

```jsx
export const init = (dispatch) => {
  const socket = new WebSocket('ws://localhost:8080');

  socket.addEventListener('message',  (event) => {
    dispatch({type: 'MESSAGE_RECEIVED', data: event.data});
  });
}
```

## Styling Widgets

Gailan comes bundled with [Emotion](https://emotion.sh) (version 11). It exposes its `css` and `styled` functions via the `gailan` module, which also carries
`run`, `request` (superagent) and `React`.

As described above, you can use `className` to style and position the root node of your widget. For further styling you can do something like this:

```jsx
import { css } from "gailan"

const header = css`
  font-family: Ubuntu;
  font-size: 20px;
  text-align: center;
  color: white;
`

const boxes = css`
  display: flex;
  justify-content: center;
`

const box = css({
  height: "40px",
  width: "40px",
  "& + &": {
    marginLeft: "5px"
  }
})

export const className = `
  left: 20px;
  top: 20px;
  width: 200px;
`

export const initialState = { colors: ["DeepPink", "DeepSkyBlue", "Coral"] }

export const render = ({ colors }) => {
  return (
    <div>
      <h1 className={header}>Some colored boxes</h1>
      <div className={boxes}>
        {colors.map((color, idx) => (
          <div className={`${box} ${css({ background: color })}`} key={idx} />
        ))}
      </div>
    </div>
  )
}
```

Alternatively, you can also make use of Emotion's styled components:

```jsx
import { styled } from "gailan"

const Header = styled("h1")`
  font-family: Ubuntu;
  font-size: 20px;
  text-align: center;
  color: white;
`

const Boxes = styled("div")`
  display: flex;
  justify-content: center;
`

const Box = styled("div")(props => ({
  height: "40px",
  width: "40px",
  background: props.color,
  marginRight: "5px"
}))

export const className = `
  left: 20px;
  top: 20px;
  width: 200px;
`

export const initialState = { colors: ["DeepPink", "DeepSkyBlue", "Coral"] }

export const render = ({ colors }) => {
  return (
    <div>
      <Header>Some colored boxes</Header>
      <Boxes>
        {colors.map((color, idx) => (
          <Box color={color} key={idx} />
        ))}
      </Boxes>
    </div>
  )
}
```

Finally, since you can also install and import any module you like, you can use your favorite styling library instead.

## Running Shell Commands

If you need to run extra shell commands without using the [command](#command) property, you can import the `run` function from the `gailan` module.

It returns a Promise, which will resolve to the output of the command (stdout) or reject if an error occurred.

```jsx
import { run } from 'gailan'

export const render = (props, dispatch) => {
  return (
    <button
      onClick={() => {
        run('echo "new output"')
          .then((output) => dispatch({type: 'OUTPUT_UPDATED', output}))
      }}
    >
      Update
    </button>
  );
}
```
> Note that in order to receive click events, you need to configure an interaction shortcut and give Gailan accessibility access.

## Geolocation API

While the WebView used by Gailan seems to provide the standard HTML5 geolocation API, it is not functional and there seems to be no way to enable it. Gailan provides its own implementation, which tries to follow the standard implementation as closely as possible. However, so far it provides only the basics and might still be somewhat unstable. The API can be found under `window.geolocation` (instead of `window.navigator.geolocation`), and supports the following methods:

```js
geolocation.getCurrentPosition(callback)
```

```js
geolocation.watchPosition(callback)
```

```js
geolocation.clearWatch(watchId)
```

Check the [documentation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation) for details on how to use these methods. The main differences from the standard API are that none of them accept options (position accuracy is always set to the highest) and that error reporting has not been implemented yet.

In addition to the standard `Position` object, Gailan provides an extra `address` property with the following fields:

  - Street
  - City
  - ZIP
  - Country
  - State
  - CountryCode


## Built-in Proxy Server

If you'd like to make Ajax requests to an external site without using a command, you can use the built-in proxy server. It is running on `http://127.0.0.1:41417` and can be used as follows:

    command: (callback) ->
      proxy = "http://127.0.0.1:41417/"
      server = "http://example.com:8080"
      path = "/getsomejson"
      $.get proxy + server + path, (json) ->
        callback null, json

## Scripting Support

Gailan supports AppleScript. To get detailed information on what you can script, open the Script Editor and add Gailan to the Library (use Window -> Library to show). Here are a few examples of what you can do with AppleScript. (Note that the examples all use the application id instead of the app name):

    tell application id "com.nich227.Gailan" to refresh

refreshes all widgets.

    tell application id "com.nich227.Gailan" to refresh widget id "my-widget"

refreshes the widget with id "my-widget".

    tell application id "com.nich227.Gailan" to every widget

lists all widgets.

    tell application id "com.nich227.Gailan" to set hidden of widget id "top-cpu-coffee" to false

shows the widget with id "top-cpu-coffee"


## Building Gailan

To build Gailan you need Node.js and a few dependencies:

### setup

Gailan bundles Node 26 into the app, and the server code expects it, so build with Node 26.
Homebrew's unversioned formula is on 26 (there is no `node@26`):

```
brew install node
```

Or pin it with a version manager, `nvm install 26`. Then:

```
cd server && npm install
```

### the bundled Node runtime

The `node` binaries that ship inside `Gailan.app` are not checked into git — a single darwin
build is around 145MB, which is over GitHub's 100MB file limit. `scripts/fetch-node.sh`
downloads them, verifies them against the SHA256 sums published by the Node project, and
drops them in `server/release/`:

```
./scripts/fetch-node.sh
```

`npm run release` (and therefore an Xcode build) calls it for you. To move to a newer Node,
change `NODE_VERSION` and the two checksums at the top of that script.

### building

The codebase consists of two parts: a Cocoa app, and a Node.js app inside `server/`. To build the Node app separately, use `npm run release`. This happens automatically every time you build with Xcode.

The Node app can be run standalone using

```
cd server && npx coffee server.coffee -d <path/to/widget/dir> -p <port>
```

`-s` points at a settings directory and `--login-shell` runs widget commands through a
login shell. `npm start` does the same with the defaults.

# Building in Xcode

The first time you open the project in Xcode, you might see this message when trying to build: "The run destination My Mac is not valid for Running the scheme 'Gailan'."

Click on `Gailan` in the project navigator and then select the menu `Editor > Validate Settings...` and click `Perform Changes`.

You can then attempt to build. If you are presented with code signing issues, click `Fix Issue` to continue.

Now you need to remove the code signing shell script: select the `Gailan` target and, under `Build Phases`, empty out the phase called `Run Script`.

You should now be able to build successfully. Nothing extra is needed to let the app talk
to its own server over http: `NSAllowsArbitraryLoads` is already set in `Gailan-Info.plist`.

# Legal

Gailan is a fork of [Übersicht](https://github.com/felixhageloh/uebersicht) by Felix Hageloh.

The source is released under the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

© 2026 Kevin Chen. Based on Übersicht, © 2019 Felix Hageloh.
