import {
	commands,
	ExtensionContext,
	workspace
} from "vscode";
import { flutterHandler } from "./ui/flutter_menu";
import { vsCodeExtHandler } from "./utils/vs_code_menu";
import { addMicroservice } from "./commands/add_microservice";
import { generateOpenApiBridge } from "./commands/generate_openapi_bridge";
import { createNewProject } from "./commands/create_new_project";
import { createDataFilesByReplacement } from "./commands/create_data_files_by_replacement";
import { generateServerpodK8s } from "./commands/generate_serverpod_k8s";
import { setupCICD } from "./commands/setup_cicd";
import { importMicroservice } from "./commands/import_microservice";
import { exportMicroservice } from "./commands/export_microservice";
import { removeMicroservice } from "./commands/remove_microservice";
import { ServiceLocator } from "../../core/services/service_locator";

export function activate(context: ExtensionContext) {
	const templatesPath = workspace.getConfiguration('codeGenerator').get<string>('templatesPath');
	if (templatesPath) {
		ServiceLocator.getInstance().setTemplatesPath(templatesPath);
	}

	context.subscriptions.push(
		commands.registerCommand("code-generator.flutter-handler", flutterHandler),
		commands.registerCommand("code-generator.vsCodeExtHandler", vsCodeExtHandler),
		commands.registerCommand("code-generator.createNewProject", createNewProject),
		commands.registerCommand("code-generator.addMicroservice", addMicroservice),
		commands.registerCommand("code-generator.createDataFiles", createDataFilesByReplacement),
		commands.registerCommand("code-generator.generateK8s", generateServerpodK8s),
		commands.registerCommand("code-generator.importMicroservice", importMicroservice),
		commands.registerCommand("code-generator.exportMicroservice", exportMicroservice),
		commands.registerCommand("code-generator.setupCICD", setupCICD),
		commands.registerCommand("code-generator.removeMicroservice", removeMicroservice),
		commands.registerCommand("code-generator.generateOpenApiBridge", generateOpenApiBridge),
	);
}

export function deactivate() { }
