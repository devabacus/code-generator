import {
	commands,
	ExtensionContext
} from "vscode";
import { flutterHandler } from "./ui/flutter_menu";

export function activate(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand("code-generator.flutter-handler", flutterHandler),
	);
}

export function deactivate() { }
