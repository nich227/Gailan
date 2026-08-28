'use strict';

const ws = require('./SharedSocket');
type Message = Record<string, unknown>;

const listeners: ((message: Message) => void)[] = [];

ws.onMessage(function handleMessage(data: string) {
  let message;
  try { message = JSON.parse(data); } catch (e) { null; }

  if (message) {
    listeners.forEach((f) => f(message));
  }
});

module.exports = function listen(callback: (message: Message) => void) {
  listeners.push(callback);
};
