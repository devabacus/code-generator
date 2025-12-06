import * as yaml from 'js-yaml';

export interface ServerDataConfig {
    project: {
        name: string;
    };
    server: {
        ip: string;
        http_port: string;
        https_port: string;
        domain: string;
        subdomain: {
            api: string;
            web: string;
            insights: string;
        };
        email: string;
        domain_registy?: string;
    };
    database: {
        host: string;
        port: string;
        name: string;
        user: string;
    };
    reddis: {
        host: string;
        port: string;
        user: string;
    };
    deployment?: {
        organization: string;
        ssh_user: string;
    };
}

export function parseServerDataYaml(yamlContent: string): ServerDataConfig {
    try {
        const config = yaml.load(yamlContent);
        if (typeof config !== 'object' || config === null) {
            throw new Error('YAML content did not parse to an object.');
        }
        return config as ServerDataConfig;
    } catch (e) {
        console.error("Error parsing YAML:", e);
        throw new Error(`Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`);
    }
}
