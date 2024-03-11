export interface ExtensionPostMessage {
  isTop: boolean;
  from: string;
  to: string;
  fromFrame: string;
  toFrame: string;
  message: string | number | boolean | null | undefined | object;
}

export enum ExtensionCommandType {
  reload = 'reload',
  initial = 'initial',
}

export interface ExtensionCommand {
  command: ExtensionCommandType;
  messages?: ExtensionPostMessage[];
  listeners?: ExtensionListenerMessage[];
}

export interface ExtensionListenerMessage {
  listener: string;
  stack: string;
  frame: string;
  origin: string;
}
