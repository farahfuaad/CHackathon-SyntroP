/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_MCP_API_BASE?: string;
  readonly VITE_HEALTH_URL?: string;
  readonly VITE_AGENT_API_URL?: string;
  readonly VITE_SALES_UPLOAD_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}