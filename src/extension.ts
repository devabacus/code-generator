// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
	commands,
	ExtensionContext
} from "vscode";
import { flutterHandler } from "./ui/flutter_menu";
import { createNewProject } from "./createNewProject";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	
	context.subscriptions.push(
		// commands.registerCommand("code-generator.flutter-handler", flutterHandler),
		commands.registerCommand("code-generator.flutter-handler", createNewProject),
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
