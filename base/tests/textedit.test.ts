import { describe, it, expect } from 'vitest';
import { applyTextEdit } from '../src/client/textedit.js';

const MAX = 16;

describe('undo-free name editing', () => {
  it('inserts at the caret and over a selection', () => {
    expect(applyTextEdit('ac', 1, 1, 'insertText', 'b', MAX)).toEqual({ value: 'abc', caret: 2 });
    expect(applyTextEdit('hello', 1, 4, 'insertText', 'EY', MAX)).toEqual({ value: 'hEYo', caret: 3 });
  });

  it('clamps typing and pastes to maxLength', () => {
    expect(applyTextEdit('x'.repeat(16), 16, 16, 'insertText', 'y', MAX)).toEqual({ value: 'x'.repeat(16), caret: 16 });
    expect(applyTextEdit('abc', 3, 3, 'insertFromPaste', 'z'.repeat(40), MAX)!.value).toHaveLength(16);
    // replacing a selection frees up its room
    expect(applyTextEdit('x'.repeat(16), 0, 16, 'insertFromPaste', 'new', MAX)).toEqual({ value: 'new', caret: 3 });
  });

  it('flattens pasted newlines', () => {
    expect(applyTextEdit('', 0, 0, 'insertFromPaste', 'a\r\nb', MAX)!.value).toBe('a b');
  });

  it('deletes backward and forward', () => {
    expect(applyTextEdit('abc', 2, 2, 'deleteContentBackward', null, MAX)).toEqual({ value: 'ac', caret: 1 });
    expect(applyTextEdit('abc', 0, 0, 'deleteContentBackward', null, MAX)).toEqual({ value: 'abc', caret: 0 });
    expect(applyTextEdit('abc', 1, 1, 'deleteContentForward', null, MAX)).toEqual({ value: 'ac', caret: 1 });
    expect(applyTextEdit('abc', 3, 3, 'deleteContentForward', null, MAX)).toEqual({ value: 'abc', caret: 3 });
    expect(applyTextEdit('abcd', 1, 3, 'deleteContentBackward', null, MAX)).toEqual({ value: 'ad', caret: 1 });
    expect(applyTextEdit('abcd', 1, 3, 'deleteByCut', null, MAX)).toEqual({ value: 'ad', caret: 1 });
  });

  it('deletes words and lines', () => {
    expect(applyTextEdit('big bad bob', 8, 8, 'deleteWordBackward', null, MAX)).toEqual({ value: 'big bob', caret: 4 });
    expect(applyTextEdit('big bad bob', 3, 3, 'deleteWordForward', null, MAX)).toEqual({ value: 'big bob', caret: 3 });
    expect(applyTextEdit('big bad', 4, 4, 'deleteSoftLineBackward', null, MAX)).toEqual({ value: 'bad', caret: 0 });
    expect(applyTextEdit('big bad', 3, 3, 'deleteSoftLineForward', null, MAX)).toEqual({ value: 'big', caret: 3 });
  });

  it('leaves composition, Enter and history to the browser', () => {
    for (const t of ['insertCompositionText', 'insertLineBreak', 'historyUndo', 'insertReplacementText']) {
      expect(applyTextEdit('abc', 1, 1, t, 'x', MAX)).toBeNull();
    }
  });
});
