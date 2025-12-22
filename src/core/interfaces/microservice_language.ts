/**
 * Интерфейс для языка микросервиса.
 * Определяет специфику работы с Python, Node.js, Go и другими языками.
 */
export interface MicroserviceLanguage {
    /** Идентификатор языка: 'python', 'node', 'go' */
    readonly name: string;

    /** Отображаемое имя: 'Python', 'Node.js', 'Go' */
    readonly displayName: string;

    /** Папка в templates/: 'python', 'node', 'go' */
    readonly templateCategory: string;

    /** Порт по умолчанию: 8000, 3000, 8080 */
    readonly defaultPort: number;

    /**
     * Инициализация проекта после копирования шаблона.
     * Например: uv sync, npm install, go mod tidy
     * @param projectPath Путь к проекту
     * @param templateName Имя шаблона (опционально, для замены в go.mod и т.д.)
     * @param projectName Имя проекта (опционально)
     */
    initialize(projectPath: string, templateName?: string, projectName?: string): Promise<void>;

    /**
     * Директории/файлы для исключения при копировании.
     * Например: ['__pycache__', '.venv'] или ['node_modules']
     */
    getExclusions(): string[];

    /**
     * URL для OpenAPI спецификации.
     * Например: http://localhost:8000/openapi.json
     */
    getOpenApiUrl(port?: number): string;

    /**
     * Команда для запуска dev-сервера.
     * Например: 'uv run uvicorn app.main:app --reload'
     */
    getDevServerCommand(): string;
}

/**
 * Метаданные шаблона, создаётся при добавлении микросервиса.
 */
export interface TemplateMetadata {
    /** Язык микросервиса */
    language: string;
    /** Имя исходного шаблона */
    templateName: string;
    /** Дата создания */
    createdAt: string;
}

/**
 * Тип языка микросервиса.
 */
export type LanguageType = 'python' | 'node' | 'go';
