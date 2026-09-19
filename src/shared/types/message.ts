export type MessageDirection = 'sent' | 'received';

export type RiskLevel = 'high' | 'medium' | 'low';

/** How a listener appears to validate the sender. */
export type OriginCheckKind = 'none' | 'strict' | 'bypassable' | 'source';

/** Which postMessage-like channel produced a record. */
export type MessageChannelKind = 'window' | 'port' | 'broadcast' | 'worker' | 'service-worker';

/** Non-postMessage taint sources seeded from the document. */
export type TaintSourceKind =
  | 'postMessage'
  | 'location.hash'
  | 'location.search'
  | 'location.href'
  | 'document.referrer'
  | 'window.name'
  | 'history';

export type OriginSpoofMode = 'off' | 'evil' | 'prefix' | 'suffix' | 'custom';

export type PageRecordKind =
  | 'message'
  | 'listener'
  | 'flow'
  | 'intercept'
  | 'listener-hit'
  | 'listener-update'
  | 'pollution'
  | 'clobber';

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
  /** Original-source location after source-map resolution. */
  mapped?: {
    file: string;
    fileName: string;
    line: number;
    column: number;
  };
}

export interface ExtensionPostMessage {
  kind?: 'message';
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
  channel?: MessageChannelKind;
  /** Structured-clone transfer list, when present. */
  transfer?: string[];
  /** Document source this taint was seeded from, when not a web message. */
  taintSource?: TaintSourceKind;
  /** True when DOMinator generated this as an auto-probe. */
  probe?: boolean;
  /** True when the listener was shown a spoofed origin. */
  spoofed?: boolean;
  /** Origin actually presented to the listener, when spoofed. */
  presentedOrigin?: string;
  /** Listener ids that ran for this receive. */
  listenerHits?: string[];
  /** Sensitive values this send appears to exfiltrate cross-origin. */
  leaks?: string[];
}

/**
 * A record that a received message's payload was later observed flowing into a
 * dangerous sink (innerHTML, eval, location, …) in the page realm. This is the
 * dynamic counterpart to the static sink scan on listener bodies: a confirmed
 * source-to-sink flow rather than a listener that merely looks dangerous.
 */
export interface SinkFlow {
  kind?: 'flow';
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
  /** True when Trusted Types or CSP blocked the assignment. */
  blocked?: boolean;
  blockedReason?: string;
  taintSource?: TaintSourceKind;
}

export interface ExtensionListenerMessage {
  kind?: 'listener' | 'listener-update';
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
  /** Finer origin-check classification; `none` when checksOrigin is false. */
  originCheck: OriginCheckKind;
  /** Bypass primitive detected, e.g. `startsWith`, `indexOf`. */
  originCheckDetail?: string;
  /** Dangerous sinks found in the listener body. */
  sinks: string[];
  /** Wrapper libraries peeled off to reach the real listener, outermost first. */
  wrappers?: string[];
  /** Source of the outermost wrapper, when the listener was unwrapped. */
  wrapperSource?: string;
  /** True when the source is unavailable: a bound or native function. */
  bound?: boolean;
  risk: RiskLevel;
  channel?: MessageChannelKind;
  via?: 'addEventListener' | 'onmessage' | 'handleEvent';
  hitCount?: number;
  confirmedCount?: number;
  lastHit?: number;
  removed?: boolean;
  /** Times this exact listener was re-registered (SPA remounts). */
  seen?: number;
  fingerprint?: string;
}

/** A message is sitting in a wrapped listener, waiting for the tester. */
export interface InterceptRequest {
  kind: 'intercept';
  id: string;
  time: number;
  listenerId: string;
  origin: string;
  message: string;
  dataType: string;
  frame: string;
  channel?: MessageChannelKind;
}

/** One wrapped listener ran for a receive. */
export interface ListenerHit {
  kind: 'listener-hit';
  id: string;
  time: number;
  listenerId: string;
  messageId?: string;
  origin: string;
  originRead: boolean;
  dataRead: boolean;
}

export interface PollutionRecord {
  kind: 'pollution';
  id: string;
  time: number;
  via: string;
  keys: string[];
  source?: SourceLocation;
  stack?: SourceLocation[];
  messageId?: string;
  frame: string;
}

export interface ClobberRecord {
  kind: 'clobber';
  id: string;
  time: number;
  name: string;
  tag: string;
  dangerous: boolean;
  frame: string;
  origin: string;
}

export enum ExtensionCommandType {
  reload = 'reload',
  initial = 'initial',
}

export interface ExtensionCommand {
  command: ExtensionCommandType;
  messages?: ExtensionPostMessage[];
  listeners?: ExtensionListenerMessage[];
  intercepts?: InterceptRequest[];
  pollutions?: PollutionRecord[];
  clobbers?: ClobberRecord[];
  /** Url of the inspected tab, when known. */
  url?: string;
}

/** Messages a view (panel/popup) sends to the background worker. */
export interface ExtensionRequest {
  name: 'init' | 'fetch' | 'clear' | 'intercept-resolve' | 'import' | 'command';
  tabId: number;
  interceptId?: string;
  action?: 'deliver' | 'drop' | 'edit';
  origin?: string;
  data?: string;
  mode?: 'json' | 'text';
  messages?: ExtensionPostMessage[];
  listeners?: ExtensionListenerMessage[];
  payload?: unknown;
}

/** Result of replaying a message into the page. */
export interface ReplayResult {
  ok: boolean;
  error?: string;
  spoofed?: boolean;
}

export interface SessionDump {
  version: 1;
  exportedAt: number;
  url?: string;
  messages: ExtensionPostMessage[];
  listeners: ExtensionListenerMessage[];
  pollutions?: PollutionRecord[];
  clobbers?: ClobberRecord[];
}
