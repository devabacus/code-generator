import {
	commands,
	ExtensionContext
} from "vscode";
import { flutterHandler } from "./ui/flutter_menu";
import { vsCodeExtHandler } from "./utils/vs_code_menu";

export function activate(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand("code-generator.flutter-handler", flutterHandler),
		commands.registerCommand("code-generator.vsCodeExtHandler", vsCodeExtHandler),		
	);
}

export function deactivate() { }
