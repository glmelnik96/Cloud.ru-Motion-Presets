// Build-time constants (panel/vite.config.mjs define) and the CEP globals the panel reaches.
declare const __CRBK_VERSION__: string;
declare const __CRBK_BUILD__: string;
declare const __CRBK_DEV__: boolean;

interface CepRuntime {
  evalScript(script: string, callback?: (result: string) => void): void;
  getHostEnvironment(): string;
  getSystemPath(pathType: string): string;
  requestOpenExtension(extensionId: string, params: string): void;
}

interface Window {
  __adobe_cep__?: CepRuntime;
  cep_node?: { require(id: string): unknown };
  require?: (id: string) => unknown;
}
