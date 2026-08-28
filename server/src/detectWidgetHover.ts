// the page reaches the app through a handler webkit hangs off the window
type Bridge = {messageHandlers: {gailan: {postMessage: (message: unknown) => void}}};

const bridge = () => (window as unknown as {webkit: Bridge}).webkit;

module.exports = (containerEl: EventTarget) => {
  let insideWidget = false;

  const checkHover = (e: Event) => {
    if (insideWidget && containerEl === e.target) {
      insideWidget = false;
      bridge().messageHandlers.gailan.postMessage('widgetLeave');
    } else if (!insideWidget && containerEl !== e.target) {
      insideWidget = true;
      bridge().messageHandlers.gailan.postMessage('widgetEnter');
    }
  };

  const checkHoverRecursive = () => {
    window.addEventListener(
      'mousemove',
      (e) => {
        checkHover(e);
        setTimeout(checkHoverRecursive, 32);
      },
      {once: true},
    );
  };

  checkHoverRecursive();
};
