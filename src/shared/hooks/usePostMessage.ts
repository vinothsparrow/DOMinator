import { useCallback } from 'react';
import { ExtensionPostMessage, ExtensionListenerMessage, ExtensionCommand } from '../types/message';

export const usePostMessage = (
  options = {
    name: 'client',
  },
) => {
  const { name = 'client' } = options;

  const backgroundPageConnection = chrome.runtime.connect({
    name: name,
  });

  const receivePostMessage = useCallback(
    (callback: (message: ExtensionPostMessage) => void) => {
      const handler = (message: ExtensionPostMessage) => {
        if (!message || !Object.hasOwn(message, 'message')) return;
        callback(message);
      };

      backgroundPageConnection.onMessage.addListener(handler);
      return () => {
        backgroundPageConnection.onMessage.removeListener(handler);
        backgroundPageConnection.disconnect();
      };
    },
    [backgroundPageConnection],
  );

  const receiveCommand = useCallback(
    (callback: (message: ExtensionCommand) => void) => {
      const handler = (message: ExtensionCommand) => {
        if (!message || !Object.hasOwn(message, 'command')) return;
        callback(message);
      };

      backgroundPageConnection.onMessage.addListener(handler);
      return () => {
        backgroundPageConnection.onMessage.removeListener(handler);
        backgroundPageConnection.disconnect();
      };
    },
    [backgroundPageConnection],
  );

  const receiveListenerMessage = useCallback(
    (callback: (message: ExtensionListenerMessage) => void) => {
      const handler = (message: ExtensionListenerMessage) => {
        if (!message || !Object.hasOwn(message, 'stack')) return;
        callback(message);
      };

      backgroundPageConnection.onMessage.addListener(handler);
      return () => {
        backgroundPageConnection.onMessage.removeListener(handler);
        backgroundPageConnection.disconnect();
      };
    },
    [backgroundPageConnection],
  );

  const send = useCallback(
    (
      message:
        | string
        | number
        | boolean
        | null
        | undefined
        | object
        | Array<string | number | boolean | null | undefined | object>,
    ) => {
      backgroundPageConnection.postMessage(message);
    },
    [backgroundPageConnection],
  );

  return { send, receivePostMessage, receiveListenerMessage, receiveCommand };
};
