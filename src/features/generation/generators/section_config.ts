import { GenerationConfig } from "../config/generation_config";
import { getSectionGenerator } from "./section_generators";
import { ServerpodModel } from "../parsers/formatters/types";

/**
 * Markers, обрабатываемые НЕ через `SectionReplacer`, а через специализированные
 * patcher'ы (D11 — Standard Finding #4):
 *   - `syncImports` / `syncEntityTypes` / `syncRegistrations` → `OrchestratorPatcher`
 *
 * Для этих имён `SectionReplacer.process()` тихо skip'ает marker блок (no-op),
 * не выводя warning. Это убирает шум `[SectionReplacer] Generator function not
 * found for name: syncImports` в test output (3 строки на каждый orchestrator
 * file pass).
 */
const SECTION_REPLACER_SKIP_MARKERS: ReadonlySet<string> = new Set([
    'syncImports',
    'syncEntityTypes',
    'syncRegistrations',
]);

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
                const newContent = generatorFunc(model, config) || '';
                const startMarker = `// === generated_start:${generatorName} ===`;
                const endMarker = `// === generated_end:${generatorName} ===`;

                if (newContent) {
                    const indentedContent = newContent.split('\n').map((line: string) => line ? `  ${line}` : '').join('\n');
                    return `${startMarker}\n${indentedContent}\n${endMarker}`;
                } else {
                    return `${startMarker}\n${endMarker}`;
                }
            }

            // D11 (2026-05-02): silently skip markers, обрабатываемые специализированными
            // patcher'ами (см. SECTION_REPLACER_SKIP_MARKERS comment above).
            if (SECTION_REPLACER_SKIP_MARKERS.has(generatorName)) {
                return match;
            }

            console.warn(`[SectionReplacer] Generator function not found for name: ${generatorName}`);
            return match;
        });
    }
}
