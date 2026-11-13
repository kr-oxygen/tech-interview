// Pure helpers about editor languages (no Monaco import, so they are cheap to test and reuse).

const EXTENSIONS: Record<string, string> = { javascript: 'jsx', typescript: 'tsx', go: 'go' };

/**
 * Model URI for a task document. Use it for every Monaco model path. JS/TS models are .jsx/.tsx so
 * JSX type-checks; Go gets syntax highlighting only (Monaco has no Go language service).
 */
export const modelPath = (prefix: string, id: string, language: string) =>
  `file:///${prefix}-${id}.${EXTENSIONS[language] ?? 'tsx'}`;

/** Languages with a built-in Monaco formatter ("Format document"). */
export const canFormat = (language: string) => language === 'typescript' || language === 'javascript';
