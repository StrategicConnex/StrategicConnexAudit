'use client';

import React from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

/**
 * Dynamically loaded Swagger UI client component.
 *
 * Wrapped in next/dynamic with ssr:false so the ~3MB swagger-ui-react
 * bundle is only downloaded when the user visits /swagger, not on every page.
 *
 * CSS is imported here (not in the parent) so it's code-split together
 * with the component.
 */
export default function SwaggerClient() {
  return (
    <SwaggerUI
      url="/openapi.json"
      docExpansion="list"
      defaultModelsExpandDepth={1}
      defaultModelExpandDepth={1}
      tryItOutEnabled={true}
      filter={true}
      persistAuthorization={true}
      displayRequestDuration={true}
      deepLinking={true}
      showExtensions={false}
      showCommonExtensions={false}
      syntaxHighlight={{ activated: true, theme: 'monokai' }}
    />
  );
}
