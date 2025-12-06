import * as fs from 'fs';
import path from 'path';

/**
 * Fixes common issues in a fresh Flutter project:
 * 1. Removes widget_test.dart
 * 2. Sets explicit NDK version in build.gradle.kts
 */
export async function startAppFix(rootPath: string) {
    const filePath = path.join(rootPath, "test", "widget_test.dart");
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    const buildGradlePath = path.join(rootPath, "android", "app", "build.gradle.kts");
    if (fs.existsSync(buildGradlePath)) {
        const content = fs.readFileSync(buildGradlePath, { encoding: "utf-8" });
        const newContent = content.replace('ndkVersion = flutter.ndkVersion', 'ndkVersion = "27.0.12077973"');
        fs.writeFileSync(buildGradlePath, newContent, { encoding: "utf-8" });
    }
}
