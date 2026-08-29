// The app listens on the other side of this. Everywhere else, including a browser
// running the page for a test, there is nobody there and asking throws.
const tell = (message) => {
  const bridge =
    window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gailan;

  if (bridge) bridge.postMessage(message);
};

module.exports = (containerEl) => {
  let insideWidget = false;

  const checkHover = (e) => {
    if (insideWidget && containerEl === e.target) {
      insideWidget = false;
      tell('widgetLeave');
    } else if (!insideWidget && containerEl !== e.target) {
      insideWidget = true;
      tell('widgetEnter');
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
