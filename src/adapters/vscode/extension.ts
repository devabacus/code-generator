import {
	commands,
	ExtensionContext,
	workspace
} from "vscode";
import { flutterHandler } from "./ui/flutter_menu";
import { vsCodeExtHandler } from "./utils/vs_code_menu";
import { addMicroservice } from "./commands/add_microservice";
import { generateOpenApiBridge } from "./commands/generate_openapi_bridge";
import { ServiceLocator } from "../../core/services/service_locator";

export function activate(context: ExtensionContext) {
	// Initialize ServiceLocator with vscode config
	const templatesPath = workspace.getConfiguration('codeGenerator').get<string>('templatesPath');
	if (templatesPath) {
		ServiceLocator.getInstance().setTemplatesPath(templatesPath);
	}

	// Legacy commands (UI menu)
	context.subscriptions.push(
		commands.registerCommand("code-generator.flutter-handler", flutterHandler),
		commands.registerCommand("code-generator.vsCodeExtHandler", vsCodeExtHandler),
	);

	// Unified commands
	context.subscriptions.push(
		commands.registerCommand("code-generator.addMicroservice", addMicroservice),
		commands.registerCommand("code-generator.generateOpenApiBridge", generateOpenApiBridge)
	);
}

export function deactivate() { }
