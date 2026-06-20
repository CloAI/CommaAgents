/** Browser-safe TTY surface used by Ink and terminal-size feature checks. */
export class ReadStream {}

export class WriteStream {
  columns = 80;
  rows = 24;
}

export default { ReadStream, WriteStream };
