import * as path from 'path';
import { BaseGenerator } from '../../../../core/generators/base_generator';
import { IFileSystem } from '../../../../core/interfaces/file_system';
import { ServerDataConfig } from '../../parsers/server_data_parser';

export class EnvGenerator extends BaseGenerator<ServerDataConfig> {
    constructor(fileSystem: IFileSystem) {
        super(fileSystem);
    }

    protected getPath(basePath: string, _name?: string, _data?: ServerDataConfig): string {
        const projectName = path.basename(basePath);
        return path.join(basePath, `${projectName}_flutter`, '.env');
    }

    protected getContent(data?: ServerDataConfig): string {
        if (!data) {
            throw new Error('ServerDataConfig not provided');
        }

        const apiSubdomain = data.server.subdomain.api;
        const domain = data.server.domain;
        const baseUrl = `https://${apiSubdomain}.${domain}/`;

        return `# manifest: startProject

API_KEY=
// TODO
BASE_URL=${baseUrl}

# URL для локальной разработки на ЭМУЛЯТОРЕ ANDROID
LOCAL_BASE_URL_ANDROID=http://10.0.2.2:8080/

# URL для локальной разработки на Windows (или macOS/Linux)
LOCAL_BASE_URL_DESKTOP=http://localhost:8080/


# LOGGER = logger
LOGGER = logging
# LOGGER = talker
`;
    }
}
