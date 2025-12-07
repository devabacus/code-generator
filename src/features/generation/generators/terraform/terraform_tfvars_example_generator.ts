import * as path from 'path';
import { BaseGenerator } from '../../../../core/generators/base_generator';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ServerDataConfig } from '../../parsers/server_data_parser';

export class TerraformTfvarsExampleGenerator extends BaseGenerator<ServerDataConfig> {
    constructor(fileSystem: IFileSystem) {
        super(fileSystem);
    }

    protected getPath(basePath: string, _name?: string, _data?: ServerDataConfig): string {
        const projectName = path.basename(basePath);
        return path.join(basePath, `${projectName}_server`, 'terraform', 'README.md');
    }

    protected getContent(data?: ServerDataConfig): string {
        if (!data) {
            throw new Error('ServerDataConfig not provided');
        }

        const appName = data.project.name;

        return `# Terraform для ${appName}

## Быстрый старт

\`\`\`powershell
cd ${appName}_server/terraform
.\\apply.ps1
\`\`\`

**Это автоматически:**
1. Создаст БД \`${data.database.name}\` в Timeweb PostgreSQL
2. Создаст пользователя \`${data.database.user}\` с паролем
3. Настроит все GitHub Secrets

## ⚠️ ВАЖНО: Добавление привилегий вручную

**После \`apply.ps1\`** нужно вручную добавить привилегии пользователю:

1. Timeweb Console → Базы данных → PostgreSQL
2. Раздел "Пользователи" → \`${data.database.user}\`
3. Кнопка "Изменить привилегии"
4. Выберите БД \`${data.database.name}\` слева
5. Нажмите "Выбрать все привилегии"
6. Сохранить

> Это нужно потому что Timeweb API не предоставляет привилегию CONNECT через Terraform.

## Настройка (один раз)

### 1. Файлы секретов в \`C:/Users/User/.secrets/\`:

| Файл | Содержимое |
|------|------------|
| \`timeweb_token\` | Токен из https://timeweb.cloud/my/api-keys |
| \`github_token\` | Результат \`gh auth token\` |
| \`redis_password\` | Пароль Redis из Timeweb Console |
| \`postgres_cluster_id\` | ID кластера PostgreSQL (число) |
| \`registry_domain\` | Ваш registry домен, напр. \`xxx.registry.twcstorage.ru\` |
| \`registry_user\` | Имя пользователя registry, напр. \`xxx\` |

### 2. Где найти значения

- **postgres_cluster_id**: Timeweb Console → Базы данных → PostgreSQL → ID кластера
- **registry_domain/user**: Timeweb Console → Container Registry → Информация о репозитории

### 3. kubeconfig

Уже есть в \`~/.kube/config\` — ничего делать не нужно!

## Что создаётся

| Ресурс | Источник |
|--------|----------|
| **Timeweb PostgreSQL DB** | 🔄 Создаётся |
| **Timeweb PostgreSQL User** | 🔄 Создаётся с auto-паролем |
| DB_PASSWORD | 🔄 Генерируется → GitHub |
| SERVICE_SECRET | 🔄 Генерируется → GitHub |
| REDIS_PASSWORD | 📁 ~/.secrets/redis_password → GitHub |
| REGISTRY_DOMAIN | 📁 ~/.secrets/registry_domain → GitHub |
| REGISTRY_USER | 📁 ~/.secrets/registry_user → GitHub |
| REGISTRY_PASSWORD | 📁 timeweb_token → GitHub |
| REGISTRY_EMAIL | 📧 ${data.server.email} → GitHub |
| KUBE_CONFIG | 📁 ~/.kube/config → GitHub |

## Полный процесс деплоя

\`\`\`
.\\apply.ps1
   ↓
✅ БД и user созданы в Timeweb
✅ GitHub Secrets настроены
   ↓
⚠️ Добавьте привилегии вручную в Timeweb Console!
   ↓
git push origin master
   ↓
🚀 Деплой!
\`\`\`
`;
    }
}
