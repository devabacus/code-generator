import {
	commands,
	ExtensionContext
} from "vscode";
import { flutterHandler } from "./ui/flutter_menu";
import { vsCodeExtHandler } from "./utils/vs_code_menu";
import { createNewProject } from "./features/generation/commands/create_new_project";
import { addPythonToProject } from "./features/generation/commands/add_python_to_project";
import { createDataFilesByReplacement } from "./features/generation/commands/create_data_files_by_replacement";
import { generateServerpodK8s } from "./features/generation/commands/generate_serverpod_k8s";

export function activate(context: ExtensionContext) {
	context.subscriptions.push(
		commands.registerCommand("code-generator.flutter-handler", flutterHandler),
		commands.registerCommand("code-generator.vsCodeExtHandler", vsCodeExtHandler),
		commands.registerCommand("code-generator.createNewProject", createNewProject),
		commands.registerCommand("code-generator.addPython", addPythonToProject),
		commands.registerCommand("code-generator.createDataFiles", createDataFilesByReplacement),
		commands.registerCommand("code-generator.generateK8s", generateServerpodK8s),
	);
}

export function deactivate() { }
