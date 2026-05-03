export function textValidator(text: string): string | null {
    if (text.match(/^[a-z_][a-z0-9_]*$/)) {
        return null;
    } else {
        return 'Name must contain only lowercase letters, numbers and _';
    }
}

export function cap(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function unCap(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
}

export function pluralConvert(str: string): string {
    if (str.match(/[sxz]$/) || str.match(/[cs]h$/)) {
        return str + 'es';
    } else if (str.match(/.*y$/)) {
        return str.replace(/(.*)([^aeiou])y$/, '$1$2ies');
    }
    return str + 's';
}

export function toPascalCase(str: string): string {
    return str.replace(/(^\w|-\w)/g, clearAndUpper);
}

export function toCamelCase(str: string): string {
    return str.replace(/-\w/g, clearAndUpper).replace(/^\w/, (c) => c.toLowerCase());
}

function clearAndUpper(text: string): string {
    return text.replace(/-/, "").toUpperCase();
}

export function toSnakeCase(str: string): string {
    if (!str) { return ''; }
    return str
        .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
        .replace(/([a-z\d])([A-Z])/g, '$1_$2')
        .toLowerCase();
}

/**
 * Converts snake_case to PascalCase (ClassName).
 */
export function snakeToPascalCase(snakeCaseString: string): string {
    return snakeCaseString.split('_').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
}

/**
 * Converts snake_case to lowerCamelCase (e.g. `terminal_set` → `terminalSet`).
 *
 * Throws на ill-formed input. Validation regex
 * `/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/` отвергает:
 *   - leading underscore (`_bad`)
 *   - trailing underscore (`bad_`)
 *   - double underscore (`double__bad`)
 *   - empty string
 *   - non-lowercase first char
 *
 * Используется для конверсии Serverpod YAML `relation(parent=X)` directives
 * (where X is snake_case identifier) в lowerCamelCase `relatedModel` token,
 * который затем потребляется consumer layers (path/class/method contexts).
 *
 * **Fail-fast** rationale: parser не валидирует upstream YAML, и silent
 * tolerance к malformed input приведёт к junk generated code. Лучше throw
 * с descriptive error и attach context на parser side.
 *
 * @throws Error если input не соответствует strict snake_case pattern
 */
export function snakeToLowerCamelCase(snake: string): string {
    const validRegex = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
    if (!validRegex.test(snake)) {
        throw new Error(`Invalid snake_case identifier: '${snake}'`);
    }
    return snake.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

export const textGroupReplacer = (content: string, regex: RegExp, newTableName: string) =>
    content.replace(regex, (match, p1) => {
        const trimmedCont = p1.trim();
        return `tables: [${trimmedCont ? trimmedCont + ', ' : ''}${newTableName}]`;
    });
