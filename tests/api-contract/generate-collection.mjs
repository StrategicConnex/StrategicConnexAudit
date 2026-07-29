#!/usr/bin/env node
/**
 * generate-collection.mjs
 *
 * Reads public/openapi.json and generates a Postman Collection v2.1 with
 * embedded contract test scripts for Newman CI.
 *
 * Usage: node tests/api-contract/generate-collection.mjs
 * Output: tests/api-contract/scaudit-api-collection.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = resolve(__dirname, '../../public/openapi.json');
const OUTPUT_PATH = resolve(__dirname, 'scaudit-api-collection.json');

if (!existsSync(OPENAPI_PATH)) {
  console.error('openapi.json not found at ' + OPENAPI_PATH);
  process.exit(1);
}

const spec = JSON.parse(readFileSync(OPENAPI_PATH, 'utf-8'));
console.log('Loaded OpenAPI spec: ' + spec.info.title + ' v' + spec.info.version);

// ─── Test script generator ───────────────────────────────────────────────

function buildTestScript(method, path, responses) {
  const lines = [];
  const codes = Object.keys(responses);

  // Status code validation: accept any documented code
  const codesList = codes.join(', ');
  lines.push('// Status code: accept any documented response');
  lines.push('pm.test("Status is one of documented [' + codesList + ']", function() {');
  lines.push('  pm.expect(pm.response.code).to.be.oneOf([' + codesList + ']);');
  lines.push('});');

  // Rate limit headers (present on all responses)
  lines.push('');
  lines.push('// Rate limit headers');
  lines.push('pm.test("Has RateLimit-Limit header", function() {');
  lines.push('  pm.expect(pm.response.headers.get("RateLimit-Limit")).to.exist;');
  lines.push('});');
  lines.push('pm.test("Has RateLimit-Remaining header", function() {');
  lines.push('  pm.expect(pm.response.headers.get("RateLimit-Remaining")).to.exist;');
  lines.push('});');
  lines.push('pm.test("Has RateLimit-Reset header", function() {');
  lines.push('  pm.expect(pm.response.headers.get("RateLimit-Reset")).to.exist;');
  lines.push('});');

  // Schema validation: only required fields (optional fields are conditional)
  const successCode = codes.find(function(c) { return c.startsWith('2'); });
  if (successCode) {
    const respSpec = responses[successCode];
    const ctype = respSpec && respSpec.content;
    if (ctype && ctype['application/json'] && ctype['application/json'].schema) {
      const schema = ctype['application/json'].schema;
      const requiredProps = schema.required || [];
      if (requiredProps.length > 0) {
        lines.push('');
        lines.push('// JSON response: required fields only');
        lines.push('pm.test("Response has all required top-level fields", function() {');
        lines.push('  var body = pm.response.json();');
        requiredProps.forEach(function(key) {
          lines.push('  pm.expect(body).to.have.property("' + key + '");');
        });
        lines.push('});');
      }
    }
  }

  return lines.join('\n');
}

// ─── Auth mapper ─────────────────────────────────────────────────────────

function getAuth(security) {
  if (!security || security.length === 0) return null;
  for (var i = 0; i < security.length; i++) {
    var scheme = security[i];
    if (scheme.apiKey) {
      return {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{apiKey}}', type: 'string' }]
      };
    }
    if (scheme.sessionCookie) {
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: 'sb-access-token', type: 'string' },
          { key: 'value', value: '{{sessionToken}}', type: 'string' },
          { key: 'in', value: 'cookie', type: 'string' }
        ]
      };
    }
  }
  return null;
}

// ─── URL builder ─────────────────────────────────────────────────────────

function buildUrl(baseUrl, path, methodSpec) {
  var url = { raw: baseUrl + path, host: [baseUrl], path: path.split('/').filter(Boolean) };
  var queryParams = [];
  if (methodSpec.parameters) {
    queryParams = methodSpec.parameters.filter(function(p) { return p.in === 'query'; });
  }
  if (queryParams.length > 0) {
    url.query = queryParams.map(function(p) {
      return {
        key: p.name,
        value: p.example !== undefined ? String(p.example) : '{{' + p.name + '}}',
        description: p.description || '',
        disabled: !p.required
      };
    });
  }
  return url;
}

// ─── Main ───────────────────────────────────────────────────────────────

var baseUrl = spec.servers && spec.servers[0] ? spec.servers[0].url : 'https://scaudit.vercel.app';
var specUrl = baseUrl + '/openapi.json';

// Build folders by tag
var tagNames = spec.tags ? spec.tags.map(function(t) { return t.name; }) : [];
var folders = {};
tagNames.forEach(function(tag) { folders[tag] = { name: tag, item: [] }; });
var items = [];

var pathKeys = Object.keys(spec.paths);
pathKeys.forEach(function(path) {
  var methods = spec.paths[path];
  var methodKeys = Object.keys(methods);
  methodKeys.forEach(function(method) {
    var details = methods[method];
    var responses = details.responses || {};
    var testScript = buildTestScript(method.toUpperCase(), path, responses);
    var auth = getAuth(details.security);
    var url = buildUrl(baseUrl, path, details);

    var item = {
      name: details.summary || (method.toUpperCase() + ' ' + path),
      request: {
        method: method.toUpperCase(),
        header: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Accept', value: 'application/json' }
        ],
        url: url,
        description: details.description || '',
        auth: auth || undefined
      },
      event: [{
        listen: 'test',
        script: {
          exec: testScript.split('\n'),
          type: 'text/javascript'
        }
      }]
    };

    var tag = details.tags && details.tags[0];
    if (tag && folders[tag]) {
      folders[tag].item.push(item);
    } else {
      items.push(item);
    }
  });
});

// Assemble collection
var folderItems = Object.values(folders);
var collection = {
  info: {
    name: 'SCAUDIT API - ' + spec.info.version,
    description: (spec.info.description || '').split('\n')[0],
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    _exporter_id: 'scaudit-ci'
  },
  item: folderItems.concat(items),
  auth: {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{apiKey}}', type: 'string' }]
  },
  variable: [
    { key: 'baseUrl', value: baseUrl, type: 'string' },
    { key: 'apiKey', value: 'sa_live_YOUR_API_KEY_HERE', type: 'string' },
    { key: 'sessionToken', value: '', type: 'string' },
    { key: 'specUrl', value: specUrl, type: 'string' }
  ]
};

writeFileSync(OUTPUT_PATH, JSON.stringify(collection, null, 2));

var totalEndpoints = items.length;
Object.values(folders).forEach(function(f) { totalEndpoints += f.item.length; });
var folderCount = Object.keys(folders).length;

console.log('Collection generated: ' + OUTPUT_PATH);
console.log('  Endpoints: ' + totalEndpoints + '  Folders: ' + folderCount);
console.log('');
console.log('Run in CI:');
console.log('  npx newman run ' + OUTPUT_PATH);
console.log('    --env-var "apiKey=$SCAUDIT_API_KEY"');
console.log('    --reporters cli,junit');
console.log('    --reporter-junit-export results/api-contract.xml');
console.log('    --bail');
