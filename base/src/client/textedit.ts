/**
 * Undo-free text editing for the name field (pure; DOM wiring is in lobby.ts).
 *
 * Native typing leaves an entry on the browser's undo stack. iPadOS then offers
 * "Undo Typing" whenever the device is shaken or three fingers touch the screen,
 * which happens constantly mid-game. Edits applied by script never reach that
 * stack, so we cancel the native edit and apply the same change ourselves.
 */

export interface TextEdit {
  value: string;
  /** Collapsed caret position after the edit. */
  caret: number;
}

/**
 * Apply a `beforeinput` edit to `value` with the selection `[start, end)`.
 * Returns null for input types we leave to the browser (IME composition,
 * Enter, history, drag and drop…).
 */
export function applyTextEdit(
  value: string,
  start: number,
  end: number,
  inputType: string,
  data: string | null,
  maxLength: number,
): TextEdit | null {
  const splice = (from: number, to: number, text: string): TextEdit => ({
    value: value.slice(0, from) + text + value.slice(to),
    caret: from + text.length,
  });
  const collapsed = start === end;

  switch (inputType) {
    case 'insertText':
    case 'insertFromPaste': {
      const room = Math.max(0, maxLength - (value.length - (end - start)));
      const text = [...(data ?? '').replace(/[\r\n]+/g, ' ')].slice(0, room).join('').slice(0, room);
      return splice(start, end, text);
    }
    case 'deleteContentBackward':
      return collapsed ? splice(Math.max(0, start - 1), end, '') : splice(start, end, '');
    case 'deleteContentForward':
      return collapsed ? splice(start, Math.min(value.length, end + 1), '') : splice(start, end, '');
    case 'deleteWordBackward': {
      if (!collapsed) return splice(start, end, '');
      const head = value.slice(0, start);
      return splice(head.replace(/\S*\s*$/, '').length, end, '');
    }
    case 'deleteWordForward': {
      if (!collapsed) return splice(start, end, '');
      const eaten = /^\s*\S*/.exec(value.slice(end))![0].length;
      return splice(start, end + eaten, '');
    }
    case 'deleteSoftLineBackward':
    case 'deleteHardLineBackward':
      return collapsed ? splice(0, end, '') : splice(start, end, '');
    case 'deleteSoftLineForward':
    case 'deleteHardLineForward':
      return collapsed ? splice(start, value.length, '') : splice(start, end, '');
    case 'deleteByCut':
      return splice(start, end, '');
    default:
      return null;
  }
}
