import * as vscode from 'vscode';
import { Command, getAllCommands } from './commands';
export function activate(context: vscode.ExtensionContext) {
	const commands: Array<Command> = getAllCommands();
	
	for (const { name, handler } of commands) {
		const disposable = vscode.commands.registerCommand(name, () => {
			handler();
		});
		context.subscriptions.push(disposable);
	}
}

export function deactivate() { }