import path from 'path';
import { IFileSystem } from '../interfaces/file_system';
import { DefaultFileSystem } from '../implementations/default_file_system';

/**
 * Информация о шаблоне
 */
export interface TemplateInfo {
    /** Имя папки шаблона */
    name: string;
    /** Полный путь к шаблону */
    path: string;
    /** Категория (имя родительской папки: python, node, go) */
    category: string;
    /** Описание из template.json (если есть) */
    description?: string;
}

/**
 * Сервис для работы с шаблонами проектов.
 * Общий код для всех модулей (Flutter, Python, Node, Go, Web).
 */
export class TemplateService {
    private readonly fileSystem: IFileSystem;

    constructor(fileSystem?: IFileSystem) {
        this.fileSystem = fileSystem || new DefaultFileSystem();
    }

    /**
     * Сканирует папку с шаблонами и возвращает список доступных шаблонов.
     * @param basePath Путь к корню шаблонов (например, G:/Templates)
     * @param category Категория для фильтрации (python, node, go). Если не указано - все.
     */
    async scanTemplates(basePath: string, category?: string): Promise<TemplateInfo[]> {
        const templates: TemplateInfo[] = [];
        const searchPath = category ? path.join(basePath, category) : basePath;

        if (!await this.fileSystem.exists(searchPath)) {
            return templates;
        }

        const categories = category ? [category] : await this.getSubdirectories(basePath);

        for (const cat of categories) {
            const categoryPath = path.join(basePath, cat);
            const templateDirs = await this.getSubdirectories(categoryPath);

            for (const templateName of templateDirs) {
                const templatePath = path.join(categoryPath, templateName);
                const templateInfo: TemplateInfo = {
                    name: templateName,
                    path: templatePath,
                    category: cat,
                };

                // Попробуем прочитать описание из template.json
                const configPath = path.join(templatePath, 'template.json');
                if (await this.fileSystem.exists(configPath)) {
                    try {
                        const configContent = await this.fileSystem.readFile(configPath);
                        const config = JSON.parse(configContent);
                        templateInfo.description = config.description;
                    } catch {
                        // Игнорируем ошибки парсинга
                    }
                }

                templates.push(templateInfo);
            }
        }

        return templates;
    }

    /**
     * Копирует шаблон в целевую папку.
     * @param sourcePath Путь к шаблону
     * @param destinationPath Путь назначения
     * @param ignorePatterns Паттерны для игнорирования (по умолчанию: node_modules, __pycache__, .git и т.д.)
     */
    async copyTemplate(
        sourcePath: string,
        destinationPath: string,
        ignorePatterns: string[] = [
            'node_modules',
            '__pycache__',
            '.git',
            '.venv',
            'dist',
            'build',
            '.pytest_cache',
            '.ruff_cache',
            '.terraform',          // Terraform directory
            'terraform.tfstate',   // Terraform state files
            '.terraform.lock.hcl', // Terraform lock file
            'template.json',       // Template config
        ]
    ): Promise<void> {
        await this.copyDirectoryRecursive(sourcePath, destinationPath, ignorePatterns);
    }

    /**
     * Получает список поддиректорий в папке.
     */
    private async getSubdirectories(dirPath: string): Promise<string[]> {
        if (!await this.fileSystem.exists(dirPath)) {
            return [];
        }

        const entries = await this.fileSystem.readDirectory(dirPath);
        const subdirs: string[] = [];

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry);
            if (await this.fileSystem.isDirectory(fullPath)) {
                subdirs.push(entry);
            }
        }

        return subdirs;
    }

    /**
     * Рекурсивно копирует директорию с учётом игнорирования.
     */
    private async copyDirectoryRecursive(
        source: string,
        destination: string,
        ignorePatterns: string[]
    ): Promise<void> {
        await this.fileSystem.createFolder(destination);

        const entries = await this.fileSystem.readDirectory(source);

        for (const entry of entries) {
            // Проверяем, нужно ли игнорировать (точное совпадение имени)
            if (ignorePatterns.some(pattern => entry === pattern)) {
                continue;
            }

            const sourcePath = path.join(source, entry);
            const destPath = path.join(destination, entry);

            if (await this.fileSystem.isDirectory(sourcePath)) {
                await this.copyDirectoryRecursive(sourcePath, destPath, ignorePatterns);
            } else {
                const content = await this.fileSystem.readFile(sourcePath);
                await this.fileSystem.createFile(destPath, content);
            }
        }
    }
}
