# StrategicAudit Pro

[![CI](https://github.com/strategicconnex/strategicaudit-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/strategicconnex/strategicaudit-pro/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/strategicconnex/strategicaudit-pro/branch/main/graph/badge.svg)](https://codecov.io/gh/strategicconnex/strategicaudit-pro)

Enterprise-grade technical auditing and cybersecurity intelligence platform.

---

## 📊 Coverage

Code coverage is tracked via [Codecov](https://codecov.io). After configuring the token (see setup below), every PR will display a coverage report comment automatically.

| Status | Badge |
|--------|-------|
| CI     | [![CI](https://github.com/strategicconnex/strategicaudit-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/strategicconnex/strategicaudit-pro/actions/workflows/ci.yml) |
| Coverage | [![codecov](https://codecov.io/gh/strategicconnex/strategicaudit-pro/branch/main/graph/badge.svg)](https://codecov.io/gh/strategicconnex/strategicaudit-pro) |

> La badge de cobertura funciona sin token para repositorios públicos.

---

## 🚀 Codecov Setup

### 1. Create a Codecov account

1. Go to [https://codecov.io](https://codecov.io) and sign in with your GitHub account
2. Authorize the Codecov GitHub App when prompted
3. Codecov will automatically detect your repositories
4. Find `strategicconnex/strategicaudit-pro` in the list and click "Add"

### 2. Get the upload token

Codecov proporciona **dos tokens distintos**:

| Token | Dónde va | ¿Secreto? |
|-------|----------|-----------|
| **Upload Token** | `secrets.CODECOV_TOKEN` en GitHub | ✅ Secreto — nunca compartir |
| **Badge Token** (opcional) | URL del badge en README | 🔓 Público — visible en el repo |

Para este proyecto usamos la badge **sin token** (funciona con repos públicos). Solo necesitas el **Upload Token** para el paso 3.

1. En Codecov, ve a **Settings → Repository Upload Token**
2. Copia el token (empieza con UUID o formato similar)

### 3. Add the token to GitHub Secrets

1. Go to **GitHub → Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. **Name:** `CODECOV_TOKEN`
4. **Value:** Paste the upload token from Codecov
5. Click **Add secret**

### 4. Verify

Push a commit to any branch. The CI will:
- Run `pnpm test:coverage`
- Generate `lcov.info`
- Upload to Codecov (the step is optional — won't fail if token is missing)
- Comment a coverage summary on the PR

You can view the full coverage report at:
`https://app.codecov.io/gh/strategicconnex/strategicaudit-pro`

---

## Getting Started

```bash
pnpm dev
```

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm test` | Run unit tests |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm test:e2e` | Run Playwright e2e tests |
