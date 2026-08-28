var ClassicWidget = require('./ClassicWidget.ts');
var VirtualDomWidget = require('./VirtualDomWidget');

type WidgetSource = {filePath: string};

module.exports = function Widget(widget: WidgetSource) {
  var api;

  if (/\.(jsx|tsx)$/.test(widget.filePath)) {
    api = VirtualDomWidget(widget);
  } else {
    api = ClassicWidget(widget);
  }

  return api;
};
