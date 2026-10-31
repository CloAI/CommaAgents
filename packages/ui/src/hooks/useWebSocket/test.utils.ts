/** Browser socket fixture exposing server events without opening a network connection. */
export class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readonly url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  readonly sent: string[] = [];
  throwOnSend = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  /** Simulate an established connection.
   * @returns {void} No return value.
   */
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  /** Simulate incoming unparsed data.
   * @param {unknown} data - Browser message data.
   * @returns {void} No return value.
   */
  message(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>);
  }

  /** Simulate a failed connection.
   * @returns {void} No return value.
   */
  fail(): void {
    this.onerror?.();
  }

  /** Record an outgoing message or simulate a send failure.
   * @param {string} data - Serialized outgoing message.
   * @returns {void} No return value.
   */
  send(data: string): void {
    if (this.throwOnSend) throw new Error("Sending failed.");
    this.sent.push(data);
  }

  /** Close without delivering another server event.
   * @returns {void} No return value.
   */
  close(): void {
    this.readyState = 3;
  }
}
