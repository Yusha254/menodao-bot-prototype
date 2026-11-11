# Dental Clinic WhatsApp AI Assistant — Backend

A NestJS backend powering a WhatsApp AI assistant for a dental clinic group. It receives inbound
webhook events from the Meta WhatsApp Cloud API, persists conversation history in PostgreSQL via
Prisma, generates grounded, safety-constrained replies through a vendor-agnostic LLM abstraction
layer (Gemini by default, OpenAI as a drop-in swap), and exposes an administrative REST API for
managing clinics, insurance plans, leads, and conversation logs.

## Tech Stack

- **Framework:** NestJS (TypeScript)
- **Database:** PostgreSQL + Prisma ORM
- **LLM Providers:** Gemini 2.0 Flash (`@google/genai`, default) / OpenAI (`openai`, swappable)
- **Messaging:** Waboxapp, FlareSend, or Meta WhatsApp Cloud API
- **Docs:** `@nestjs/swagger` (OpenAPI) at `/api/docs`
- **Validation:** `class-validator` / `class-transformer`

## Architecture Highlights

- **Dependency Inversion for LLMs:** `AiService` depends only on the `ILlmProvider` interface,
  injected via the `LLM_PROVIDER` token. `AiModule` wires that token to either `GeminiProvider` or
  `OpenAiProvider` at runtime based on the `LLM_PROVIDER_NAME` environment variable — no business
  logic changes are needed to switch providers.
- **Grounded responses:** `AiService` pulls active clinics and insurance plans from Postgres on
  every request and injects them into the system prompt, so the assistant never invents clinic
  names, prices, or perks.
- **Safety rules:** non-diagnostic persona, emergency redirection to real clinics, no
  medication/dosage advice, and a mandatory disclaimer footer appended to every reply.
- **Lead capture:** lightweight keyword-based intent detection creates `INSURANCE_INTEREST` or
  `CLINIC_APPOINTMENT` leads automatically, deduplicated against existing open leads per user.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `DATABASE_URL`, `WABOXAPP_API_TOKEN`, `WABOXAPP_PHONE_NUMBER`, and
`GEMINI_API_KEY` (or `OPENAI_API_KEY` if using OpenAI). The Waboxapp phone number
must use international format with digits only. Set `WHATSAPP_PROVIDER=waboxapp`
to use Waboxapp; the existing FlareSend and Meta clients remain available.

### 3. Start PostgreSQL locally

```bash
docker compose up -d
```

### 4. Run Prisma migrations and seed data

```bash
npx prisma migrate dev --name init
npm run prisma:seed
```

### 5. Start the server

```bash
npm run start:dev
```

The API runs on `http://localhost:3000` (configurable via `PORT`).
Swagger docs: `http://localhost:3000/api/docs`.

## WhatsApp Provider Setup

Set `WHATSAPP_PROVIDER` to `waboxapp`, `flaresend`, or `meta` in `.env`.
Waboxapp uses `WABOXAPP_API_TOKEN` and `WABOXAPP_PHONE_NUMBER` for API requests.
Configure its incoming-message webhook to `https://<your-domain>/webhook` (or
`/webhook/waboxapp`). FlareSend remains available with its existing
`FLARESEND_API_KEY` and `FLARESEND_BASE_URL` settings.

### Flaresend Image Messages

Flaresend inbound image messages are downloaded from the WhatsApp media CDN,
authenticated and decrypted before being sent to the configured Gemini or
OpenAI model. JPEG, PNG, and WebP images up to 10 MB are supported. Images are
not stored in PostgreSQL or written to application logs; image captions and
ordinary prompts may still be logged as part of the existing conversation and
LLM-call logging. Image replies describe visible content but do not diagnose
dental conditions.

## Patient WhatsApp Registration

The hosted registration page is available at `https://<your-domain>/register`.
Patients enter their phone number in international format and consent to its use.
The configured WhatsApp provider sends a one-time six-digit numeric code to
that number. The patient replies to that message from the WhatsApp account they
want to link. On a correct code, the inbound sender ID (including a FlareSend
`@lid`) is stored as the WhatsApp identity, while the phone number is stored
separately and used as the reply destination. The bot sends a fixed confirmation
without calling the LLM; normal messages can then use the assistant.

The linking code is never shown on the registration page and is stored hashed in
the database. Apply the database migration before enabling registration:

```bash
npx prisma migrate deploy
npx prisma generate
```

Codes expire after 10 minutes. Requests are limited to one per number per minute
and five per hour; each WhatsApp identity gets at most five guesses per process
during a code window.

WhatsApp text messages use the shared intent and booking pipeline. Booking
details are kept in a draft while the patient reviews them; the appointment is
created only after the patient replies **Yes** to the read-back. The patient
name from the booking is also saved to their profile.

## Webhook Setup (Meta App Dashboard)

1. Set the **Callback URL** to `https://<your-domain>/webhook`.
2. Set **Verify Token** to match `WEBHOOK_VERIFY_TOKEN` in your `.env`.
3. Subscribe to the `messages` webhook field.

## Switching LLM Providers

Set `LLM_PROVIDER_NAME=openai` (with a valid `OPENAI_API_KEY`) or `LLM_PROVIDER_NAME=gemini`
(with a valid `GEMINI_API_KEY`) in `.env` — no code changes required.

## Admin API

All admin endpoints are documented in Swagger at `/api/docs`. Highlights:

- `POST /admin/clinics`, `GET /admin/clinics`, `PATCH /admin/clinics/:id`, `DELETE /admin/clinics/:id`
- `POST /admin/insurance-plans`, `GET /admin/insurance-plans`, `PATCH /admin/insurance-plans/:id`
- `GET /admin/leads`, `PATCH /admin/leads/:id/status`
- `GET /admin/users`, `GET /admin/users/:id/conversation`
- `GET /admin/llm-usage` returns lifetime call counts and the 100 most recent full prompts, histories, and responses.

The admin dashboard at `/admin/dashboard` includes an **LLM Usage** tab for
reviewing those records. Prompt logs can contain patient-identifying and health
information; restrict access to the admin dashboard and API before exposing
them. Provider billing metadata is not currently captured, so the dashboard
shows call counts rather than estimated cost. Apply the LLM call-log migration
with `npx prisma migrate deploy` before using this feature.

## Project Structure

```
prisma/                  Prisma schema and seed script
src/
  common/prisma/         Global PrismaService/PrismaModule
  common/filters/        Global HTTP exception filter
  modules/webhook/       Meta webhook handshake + event ingestion
  modules/whatsapp/      Message parsing, history persistence, Graph API client
  modules/ai/            LLM abstraction (interface, Gemini/OpenAI providers, AiService)
  modules/admin/         Admin REST API (clinics, insurance, leads, logs)
```
