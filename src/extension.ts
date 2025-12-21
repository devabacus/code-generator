import {
	commands,
	ExtensionContext
} from "vscode";
import { flutterHandler } from "./ui/flutter_menu";
import { vsCodeExtHandler } from "./utils/vs_code_menu";

// Модули
import { registerFlutterCommands } from "./modules/flutter";
import { registerPythonCommands } from "./modules/python";
import { registerNodeCommands } from "./modules/node";
import { registerGoCommands } from "./modules/go";
import { addMicroservice } from "./core/commands/add_microservice";

export function activate(context: ExtensionContext) {
	// Legacy команды (UI меню)
	context.subscriptions.push(
		commands.registerCommand("code-generator.flutter-handler", flutterHandler),
		commands.registerCommand("code-generator.vsCodeExtHandler", vsCodeExtHandler),
	);

	// Unified addMicroservice command
	context.subscriptions.push(
		commands.registerCommand("code-generator.addMicroservice", addMicroservice)
	);

	// Модули
	context.subscriptions.push(...registerFlutterCommands());
	context.subscriptions.push(...registerPythonCommands());
	context.subscriptions.push(...registerNodeCommands());
	context.subscriptions.push(...registerGoCommands());
}

export function deactivate() { }
