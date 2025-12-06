import { GenerationConfig } from "../config/generation_config";
import { getSectionGenerator } from "./section_generators";
import { ServerpodModel } from "../parsers/formatters/types";

/**
 * Class for processing files with generated sections.
 * Finds all blocks 'generated_start:NAME' and 'generated_end:NAME',
 * calls corresponding generator 'NAME' and inserts the result.
 */
export class SectionReplacer {
    public process(
        content: string,
        config: GenerationConfig,
        model: ServerpodModel
    ): string {
        const sectionRegex = /(?:\/\/|#) === generated_start:(\w+) ===[\s\S]*?(?:\/\/|#) === generated_end:\1 ===/g;

        return content.replace(sectionRegex, (match, generatorName) => {
            const generatorFunc = getSectionGenerator(generatorName);

            if (generatorFunc) {
                const newContent = generatorFunc(model) || '';
                const startMarker = `// === generated_start:${generatorName} ===`;
                const endMarker = `// === generated_end:${generatorName} ===`;

                if (newContent) {
                    const indentedContent = newContent.split('\n').map((line: string) => line ? `  ${line}` : '').join('\n');
                    return `${startMarker}\n${indentedContent}\n${endMarker}`;
                } else {
                    return `${startMarker}\n${endMarker}`;
                }
            }

            console.warn(`[SectionReplacer] Generator function not found for name: ${generatorName}`);
            return match;
        });
    }
}
