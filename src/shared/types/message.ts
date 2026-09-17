export type MessageDirection = 'sent' | 'received';

export type RiskLevel = 'high' | 'medium' | 'low';

/** A single parsed frame of a JS stack trace. */
export interface SourceLocation {
  /** Full script url, e.g. https://site.com/assets/app.js */
  file: string;
  /** Basename of the script, e.g. app.js */
  fileName: string;
  line: number;
  column: number;
  /** Function name, when the engine reported one. */
  fn?: string;
  /** The untouched stack line, kept for copy/paste. */
  raw: string;
}

export interface ExtensionPostMessage {
  id: string;
  /** Epoch ms of capture. */
  time: number;
  direction: MessageDirection;
  isTop: boolean;
  /** Origin of the sender. */
  from: string;
  /** Url of the receiving document (or the target window for sends). */
  to: string;
  fromFrame: string;
  toFrame: string;
  /** targetOrigin argument, sends only. */
  targetOrigin?: string;
  /** Serialized payload (truncated). */
  message: string;
  /** typeof / shape of the original payload. */
  dataType: string;
  /** Payload size in characters. */
  size: number;
  /** The postMessage() call site. */
  source?: SourceLocation;
  /** Full call stack of the send. */
  stack?: SourceLocation[];
  /** True when `source` was matched from a send captured in another frame. */
  correlated?: boolean;
  /** Payload fingerprint, used to pair a send with its receive. */
  hash?: string;
  /** Sink flows where this message's payload was later observed reaching a sink. */
  flows?: SinkFlow[];
  /** True once at least one flow confirmed the payload reached a dangerous sink. */
  confirmed?: boolean;
  risk: RiskLevel;
  flags: string[];
}

/**
 * A record that a received message's payload was later observed flowing into a
 * dangerous sink (innerHTML, eval, location, …) in the page realm. This is the
 * dynamic counterpart to the static sink scan on listener bodies: a confirmed
 * source-to-sink flow rather than a listener that merely looks dangerous.
 */
export interface SinkFlow {
  id: string;
  time: number;
  /** id of the received ExtensionPostMessage whose payload reached the sink. */
  messageId?: string;
  /** The sink the value reached, e.g. `innerHTML`. */
  sink: string;
  /** The tainted value as it reached the sink (truncated). */
  value: string;
  /** The sink call site. */
  source?: SourceLocation;
  /** Full call stack at the sink. */
  stack?: SourceLocation[];
}

export interface ExtensionListenerMessage {
  id: string;
  time: number;
  /** Source of the listener function. */
  listener: string;
  /** Raw stack line of the addEventListener() call. */
  stack: string;
  /** The addEventListener() call site. */
  source?: SourceLocation;
  stackFrames?: SourceLocation[];
  frame: string;
  origin: string;
  /** Whether the listener body appears to validate event.origin. */
  checksOrigin: boolean;
  /** Dangerous sinks found in the listener body. */
  sinks: string[];
  /** Wrapper libraries peeled off to reach the real listener, outermost first. */
  wrappers?: string[];
  /** Source of the outermost wrapper, when the listener was unwrapped. */
  wrapperSource?: string;
  /** True when the source is unavailable: a bound or native function. */
  bound?: boolean;
  risk: RiskLevel;
}

export enum ExtensionCommandType {
  reload = 'reload',
  initial = 'initial',
}

export interface ExtensionCommand {
  command: ExtensionCommandType;
  messages?: ExtensionPostMessage[];
  listeners?: ExtensionListenerMessage[];
  /** Url of the inspected tab, when known. */
  url?: string;
}

/** Messages a view (panel/popup) sends to the background worker. */
export interface ExtensionRequest {
  name: 'init' | 'fetch' | 'clear';
  tabId: number;
}

/** Result of replaying a message into the page. */
export interface ReplayResult {
  ok: boolean;
  error?: string;
}
