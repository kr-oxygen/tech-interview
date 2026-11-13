import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Bundle Monaco locally (no CDN) and run TS/JS IntelliSense in a web worker.
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    return label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker();
  },
};

const ts = monaco.languages.typescript;

// Models are .tsx/.jsx so React components type-check; JSX uses the automatic runtime.
const compilerOptions: monaco.languages.typescript.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
  strict: true,
  allowNonTsExtensions: true,
  lib: ['es2020', 'dom', 'dom.iterable'],
};
ts.typescriptDefaults.setCompilerOptions(compilerOptions);
ts.javascriptDefaults.setCompilerOptions({ ...compilerOptions, allowJs: true, checkJs: false });

// React type definitions for IntelliSense (`import { useState } from 'react'`, JSX elements).
// Loaded lazily so they don't weigh on the initial bundle.
const typeFiles = import.meta.glob<string>(
  [
    '/node_modules/@types/react/{index,global,jsx-runtime,jsx-dev-runtime}.d.ts',
    '/node_modules/csstype/index.d.ts',
  ],
  { query: '?raw', import: 'default' },
);
void Promise.all(
  Object.entries(typeFiles).map(async ([path, load]) => {
    const uri = `file://${path}`;
    const content = await load();
    ts.typescriptDefaults.addExtraLib(content, uri);
    ts.javascriptDefaults.addExtraLib(content, uri);
  }),
).then((loaded) => {
  if (loaded.length === 0) console.warn('React type definitions for the editor were not found');
});

loader.config({ monaco });

export { monaco };
export { canFormat, modelPath } from './languages';
