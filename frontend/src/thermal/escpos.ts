// ESC/POS command builder for 58mm / 80mm thermal printers.
// Generates a Uint8Array ready to send via BLE or network socket.
//
// Reference: https://reference.epson-biz.com/modules/ref_escpos/index.php

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

export type PaperWidth = 32 | 42; // 32 chars = 58mm, 42 chars = 80mm

export class EscPos {
  private buf: number[] = [];
  readonly width: PaperWidth;

  constructor(width: PaperWidth = 32) {
    this.width = width;
  }

  // ── Printer control ──────────────────────────────────────────────

  reset(): this {
    this.buf.push(ESC, 0x40);
    return this;
  }

  feed(lines = 1): this {
    for (let i = 0; i < lines; i++) this.buf.push(LF);
    return this;
  }

  /** Full paper cut. */
  cut(): this {
    this.buf.push(GS, 0x56, 0x41, 0x00);
    return this;
  }

  /** Partial cut (leaves a thin strip). */
  partialCut(): this {
    this.buf.push(GS, 0x56, 0x42, 0x00);
    return this;
  }

  // ── Alignment ────────────────────────────────────────────────────

  left()  : this { this.buf.push(ESC, 0x61, 0); return this; }
  center(): this { this.buf.push(ESC, 0x61, 1); return this; }
  right() : this { this.buf.push(ESC, 0x61, 2); return this; }

  // ── Style ────────────────────────────────────────────────────────

  bold(on: boolean): this {
    this.buf.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  underline(on: boolean): this {
    this.buf.push(ESC, 0x2d, on ? 1 : 0);
    return this;
  }

  /** Double height. Note: also doubles width on most printers. */
  bigText(on: boolean): this {
    this.buf.push(ESC, 0x21, on ? 0x30 : 0x00); // double width + height
    return this;
  }

  // ── Text output ──────────────────────────────────────────────────

  /** Append raw text (non-ASCII replaced with '?', control bytes 0x00–0x1F stripped except LF/CR). */
  text(s: string): this {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x20 && c !== 0x0a && c !== 0x0d) continue; // strip ESC/POS control bytes
      this.buf.push(c < 128 ? c : 0x3f);
    }
    return this;
  }

  /** text + LF. */
  line(s: string): this {
    return this.text(s).feed();
  }

  /** Repeated character line across full paper width. */
  divider(char = "-"): this {
    return this.line(char.repeat(this.width));
  }

  /**
   * Two-column row: label on left, value on right, padded to paper width.
   * Ensures minimum 1 space between columns.
   */
  row(label: string, value: string): this {
    const pad = Math.max(1, this.width - label.length - value.length);
    return this.line(label + " ".repeat(pad) + value);
  }

  /**
   * Word-wrap a long string to paper width, indenting continuation lines.
   */
  wrap(s: string, indent = 0): this {
    const words = s.split(" ");
    let cur = "";
    for (const w of words) {
      if (cur.length + w.length + 1 > this.width) {
        this.line(cur);
        cur = " ".repeat(indent) + w;
      } else {
        cur = cur ? cur + " " + w : w;
      }
    }
    if (cur) this.line(cur);
    return this;
  }

  // ── Output ───────────────────────────────────────────────────────

  bytes(): Uint8Array {
    return new Uint8Array(this.buf);
  }

  /** Split bytes into BLE-safe chunks (default 20 bytes = safe minimum). */
  chunks(mtu = 20): Uint8Array[] {
    const data = this.bytes();
    const out: Uint8Array[] = [];
    for (let i = 0; i < data.length; i += mtu) {
      out.push(data.slice(i, i + mtu));
    }
    return out;
  }
}
