/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Position } from 'vs/editor/common/core/position';
import { withTestCodeEditor, TestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { DeleteWordPartLeft, DeleteWordPartRight, CursorWordPartLeft, CursorWordPartRight } from 'vs/editor/contrib/wordPartOperations/wordPartOperations';
import { EditorCommand } from 'vs/editor/browser/editorExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

suite('WordPartOperations', () => {
	const _deleteWordPartLeft = new DeleteWordPartLeft();
	const _deleteWordPartRight = new DeleteWordPartRight();
	const _cursorWordPartLeft = new CursorWordPartLeft();
	const _cursorWordPartRight = new CursorWordPartRight();

	function runEditorCommand(editor: ICodeEditor, command: EditorCommand): void {
		command.runEditorCommand(null, editor, null);
	}
	function moveWordPartLeft(editor: ICodeEditor, inSelectionmode: boolean = false): void {
		runEditorCommand(editor, inSelectionmode ? _cursorWordPartLeft : _cursorWordPartLeft);
	}
	function moveWordPartRight(editor: ICodeEditor, inSelectionmode: boolean = false): void {
		runEditorCommand(editor, inSelectionmode ? _cursorWordPartLeft : _cursorWordPartRight);
	}
	function deleteWordPartLeft(editor: ICodeEditor): void {
		runEditorCommand(editor, _deleteWordPartLeft);
	}
	function deleteWordPartRight(editor: ICodeEditor): void {
		runEditorCommand(editor, _deleteWordPartRight);
	}

	function deserializePipePositions(text: string): [string, Position[]] {
		let resultText = '';
		let lineNumber = 1;
		let charIndex = 0;
		let positions: Position[] = [];
		for (let i = 0, len = text.length; i < len; i++) {
			const chr = text.charAt(i);
			if (chr === '\n') {
				resultText += chr;
				lineNumber++;
				charIndex = 0;
				continue;
			}
			if (chr === '|') {
				positions.push(new Position(lineNumber, charIndex + 1));
			} else {
				resultText += chr;
				charIndex++;
			}
		}
		return [resultText, positions];
	}

	function serializePipePositions(text: string, positions: Position[]): string {
		positions.sort(Position.compare);
		let resultText = '';
		let lineNumber = 1;
		let charIndex = 0;
		for (let i = 0, len = text.length; i < len; i++) {
			const chr = text.charAt(i);
			if (positions.length > 0 && positions[0].lineNumber === lineNumber && positions[0].column === charIndex + 1) {
				resultText += '|';
				positions.shift();
			}
			resultText += chr;
			if (chr === '\n') {
				lineNumber++;
				charIndex = 0;
			} else {
				charIndex++;
			}
		}
		if (positions.length > 0 && positions[0].lineNumber === lineNumber && positions[0].column === charIndex + 1) {
			resultText += '|';
			positions.shift();
		}
		if (positions.length > 0) {
			throw new Error(`Unexpected left over positions!!!`);
		}
		return resultText;
	}

	function testRepeatedActionAndExtractPositions(text: string, initialPosition: Position, action: (editor: TestCodeEditor) => void, record: (editor: TestCodeEditor) => Position, stopCondition: (editor: TestCodeEditor) => boolean): Position[] {
		let actualStops: Position[] = [];
		withTestCodeEditor(text, {}, (editor, _) => {
			editor.setPosition(initialPosition);
			while (true) {
				action(editor);
				actualStops.push(record(editor));
				if (stopCondition(editor)) {
					break;
				}
			}
		});
		return actualStops;
	}

	test('move word part left basic', () => {
		const EXPECTED = [
			'|start| |line|',
			'|this|Is|A|Camel|Case|Var| | |this|_is|_a|_snake|_case|_var| |THIS|_IS|_CAPS|_SNAKE| |this|_IS|Mixed|Use|',
			'|end| |line'
		].join('\n');
		const [text,] = deserializePipePositions(EXPECTED);
		const actualStops = testRepeatedActionAndExtractPositions(
			text,
			new Position(1000, 1000),
			ed => moveWordPartLeft(ed),
			ed => ed.getPosition(),
			ed => ed.getPosition().equals(new Position(1, 1))
		);
		const actual = serializePipePositions(text, actualStops);
		assert.deepEqual(actual, EXPECTED);
	});

	test('move word part right basic', () => {
		const EXPECTED = [
			'start| |line|',
			'|this|Is|A|Camel|Case|Var| | |this_|is_|a_|snake_|case_|var| |THIS_|IS_|CAPS_|SNAKE| |this_|IS|Mixed|Use|',
			'|end| |line|'
		].join('\n');
		const [text,] = deserializePipePositions(EXPECTED);
		const actualStops = testRepeatedActionAndExtractPositions(
			text,
			new Position(1, 1),
			ed => moveWordPartRight(ed),
			ed => ed.getPosition(),
			ed => ed.getPosition().equals(new Position(3, 9))
		);
		const actual = serializePipePositions(text, actualStops);
		assert.deepEqual(actual, EXPECTED);
	});

	test('delete word part left basic', () => {
		const EXPECTED = '|   |/*| |Just| |some| |text| |a|+=| |3| |+|5|-|3| |*/|  |this|Is|A|Camel|Case|Var|  |this|_is|_a|_snake|_case|_var| |THIS|_IS|_CAPS|_SNAKE| |this|_IS|Mixed|Use';
		const [text,] = deserializePipePositions(EXPECTED);
		const actualStops = testRepeatedActionAndExtractPositions(
			text,
			new Position(1, 1000),
			ed => deleteWordPartLeft(ed),
			ed => ed.getPosition(),
			ed => ed.getValue().length === 0
		);
		const actual = serializePipePositions(text, actualStops);
		assert.deepEqual(actual, EXPECTED);
	});

	test('delete word part right basic', () => {
		const EXPECTED = '   |/*| |Just| |some| |text| |a|+=| 3| +|5|-|3| */|  |this|Is|A|Camel|Case|Var|  |this_|is_|a_|snake_|case_|var| |THIS_|IS_|CAPS_|SNAKE| |this_|IS|Mixed|Use|';
		const [text,] = deserializePipePositions(EXPECTED);
		const actualStops = testRepeatedActionAndExtractPositions(
			text,
			new Position(1, 1),
			ed => deleteWordPartRight(ed),
			ed => new Position(1, text.length - ed.getValue().length + 1),
			ed => ed.getValue().length === 0
		);
		const actual = serializePipePositions(text, actualStops);
		assert.deepEqual(actual, EXPECTED);
	});
});
