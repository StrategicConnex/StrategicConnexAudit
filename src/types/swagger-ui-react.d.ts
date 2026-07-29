declare module 'swagger-ui-react' {
  import { ComponentType } from 'react';

  interface SwaggerUIProps {
    url?: string;
    spec?: Record<string, unknown>;
    docExpansion?: 'list' | 'full' | 'none';
    defaultModelsExpandDepth?: number;
    defaultModelExpandDepth?: number;
    tryItOutEnabled?: boolean;
    filter?: boolean | string;
    persistAuthorization?: boolean;
    displayRequestDuration?: boolean;
    deepLinking?: boolean;
    showExtensions?: boolean;
    showCommonExtensions?: boolean;
    syntaxHighlight?: {
      activated?: boolean;
      theme?: string;
    };
    supportedSubmitMethods?: string[];
    presets?: unknown[];
    plugins?: unknown[];
    layout?: string;
    onComplete?: () => void;
    requestInterceptor?: (req: unknown) => unknown;
    responseInterceptor?: (res: unknown) => unknown;
  }

  const SwaggerUI: ComponentType<SwaggerUIProps>;
  export default SwaggerUI;
}
