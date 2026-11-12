# FlareSend WhatsApp Bot: Implementation and Setup Guide

This guide documents the FlareSend integration as it currently exists in this
repository, how to configure it through the first WhatsApp reply, and where to
change response language and intent behavior.

## Current implementation status

The repository already has the main inbound-to-outbound path:

- FlareSend is selectable through `WHATSAPP_PROVIDER=flaresend`.
- The app accepts FlareSend webhook events at `POST /webhook` and
  `POST /webhook/flaresend`.
- Text, button replies, and media captions are extracted from FlareSend message
  payloads.
- Inbound JPEG, PNG, and WebP images can be downloaded, authenticated,
  decrypted, and passed to a vision-capable configured LLM.
- Inbound Ogg/Opus voice notes can be downloaded, authenticated, decrypted,
  transcribed by AssemblyAI, and passed through the same intent/response
  pipeline used by text.
- Outbound FlareSend text is sent using `POST /send-message`.
- The intent router supports `BOOKING_SESSION`, `CLINICAL_INTAKE`, and
  `HEALTH_EDUCATION`. Booking drafts and clinical intake records are persisted.

The following are not currently implemented in the FlareSend path:

- Sending generated audio or voice-note replies. Replies to incoming voice
  notes are text.
- General multi-turn conversational history for the Health Education response.
  Booking uses recent messages while collecting booking details.
- A FlareSend webhook signature/token check. The webhook controller currently
  accepts the provider POST and acknowledges it.
- Guaranteed end-to-end language selection for every response. See
  [Language behavior and tuning](#language-behavior-and-tuning).

## End-to-end architecture

```text
Patient WhatsApp
  -> FlareSend connected instance
  -> HTTPS POST /webhook/flaresend
  -> WebhookController returns { "status": "received" }
  -> WhatsappService recognizes message_received
  -> text/caption OR media download/decryption OR audio transcription
  -> VoicePipelineService routes intent
  -> booking logic OR clinical intake extraction OR health education reply
  -> FlareSend POST /send-message
  -> Patient WhatsApp
```

The webhook HTTP response is an acknowledgement, not the bot reply. The
controller starts payload processing asynchronously and returns HTTP 200 with
`{"status":"received"}`. The actual reply is sent later through FlareSend.

## Prerequisites

You need:

1. A FlareSend account, an instance with a WhatsApp account connected, and that
   instance's API key.
2. A public HTTPS URL for this NestJS app so FlareSend can deliver webhooks.
   A development tunnel or forwarded HTTPS port is suitable for testing; use a
   stable, access-controlled HTTPS deployment for production.
3. Node.js and npm compatible with the repository's package setup.
4. PostgreSQL. The included Docker Compose file provides a local development
   database.
5. A Gemini or OpenAI API key for LLM inference.
6. An AssemblyAI API key if you want to handle voice notes.
7. Seeded clinic data for accurate clinic names, services, and appointment
   options. Configure this data in the database/admin UI as appropriate.

## Local setup

From the repository root:

```bash
npm install
cp .env.example .env
docker compose up -d
```

Edit `.env`. Use actual credentials only in this ignored local file or in your
deployment's secret manager; do not put real API keys in this guide, source
control, or webhook examples.

Minimum configuration for FlareSend text:

```dotenv
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dental_bot?schema=public"

WHATSAPP_PROVIDER="flaresend"
FLARESEND_API_KEY="your_instance_api_key"
FLARESEND_BASE_URL="https://api.flaresend.com"

LLM_PROVIDER_NAME="gemini"
GEMINI_API_KEY="your_gemini_api_key"
GEMINI_MODEL="your_available_gemini_model"
```

To use OpenAI instead, set `LLM_PROVIDER_NAME="openai"` and configure
`OPENAI_API_KEY` and, optionally, `OPENAI_MODEL`. The provider factory in
`src/modules/ai/ai.module.ts` chooses the implementation at startup.

Add these settings for voice notes:

```dotenv
ASSEMBLY_AI_API_KEY="your_assemblyai_api_key"
```

The transcription service also accepts `ASSEMBLYAI_API_KEY` as an alternate
name, but `ASSEMBLY_AI_API_KEY` is the name used in `.env.example`.

The example file includes booking settings. Review those values for your
business before enabling bookings:

```dotenv
BOOKING_TIMEZONE="Africa/Nairobi"
BOOKING_OPEN_DAYS="1,2,3,4,5,6"
BOOKING_OPEN_TIME="08:00"
BOOKING_CLOSE_TIME="17:00"
BOOKING_SLOT_MINUTES="30"
BOOKING_DRAFT_TTL_MINUTES="30"
```

`src/main.ts` uses `PORT` when set and otherwise listens on port 80. Keep
`PORT=3000` for the local instructions above, or deliberately configure the
port expected by your hosting platform.

Apply the existing schema migrations and add initial data:

```bash
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed
```

If you are developing a new schema change locally, use the repository's
`npm run prisma:migrate` script to create/apply a development migration, then
regenerate the client if needed.

Start the app:

```bash
npm run start:dev
```

Confirm the server is listening on the configured port. The admin API is
available at `/api/docs`; the webhook itself is excluded from Swagger.

## Configure the FlareSend instance

1. In FlareSend, create or select the WhatsApp instance and connect the
   intended WhatsApp account by following the provider's pairing instructions.
   Wait until the instance is connected/ready before testing sends.
2. Copy the instance API key into `FLARESEND_API_KEY`. Keep it server-side.
3. Set `FLARESEND_BASE_URL` to the API base URL for your FlareSend account. The
   current default is `https://api.flaresend.com`.
4. Set `WHATSAPP_PROVIDER=flaresend` and restart the NestJS server after
   changing environment variables.
5. In the FlareSend instance's webhook settings, register one of:
   - `https://<your-public-host>/webhook/flaresend` (recommended), or
   - `https://<your-public-host>/webhook`.
6. Subscribe to inbound message events, especially `message_received`.
7. Confirm that the webhook URL is reachable over HTTPS. A GET request to the
   base webhook path returns an active-endpoint response:

```bash
curl -i "https://<your-public-host>/webhook"
```

The GET health response is:

```json
{
  "status": "ok",
  "message": "Webhook endpoint active"
}
```

The dedicated `/webhook/flaresend` route is a POST alias. The GET health check
is implemented at `/webhook`.

The checked-in FlareSend API reference is
[`flaresend-api-documentation-main.md`](./flaresend-api-documentation-main.md).
Provider dashboard labels and payload variants can change; compare a real
webhook with the examples below without logging media keys or message content.

## FlareSend API request and webhook shapes

### Sending text

The current FlareSend client sends one recipient per request:

```http
POST /send-message
Authorization: Bearer <FLARESEND_API_KEY>
Content-Type: application/json
```

```json
{
  "recipients": ["254712345678"],
  "type": "text",
  "text": "Hello from the assistant."
}
```

Phone numbers are normalized to international digits, without `+` or a JID
suffix. The client requires `success: true` in the response and treats the
recipient as failed if it appears in `invalid_recipients` or
`failed_recipients`. Delivery failures are logged and surfaced as errors.

### Incoming text event

The documented event shape is approximately:

```json
{
  "event": "message_received",
  "instanceId": "<instance-id>",
  "data": {
    "from": "254712345678@s.whatsapp.net",
    "id": "<message-id>",
    "timestamp": 1760705280,
    "pushName": "Patient",
    "message": {
      "conversation": "How do I brush my teeth?"
    }
  },
  "timestamp": "<ISO timestamp>"
}
```

The handler also supports `extendedTextMessage.text`, button and interactive
reply text, image captions, and video captions. It ignores messages from the
bot itself, status broadcasts, and group chats.

### Incoming image

An image is carried under `data.message.imageMessage`. The implementation
expects the provider payload to contain media metadata such as `mimetype`,
`mediaKey`, and either `url` or `directPath`; `caption` and `fileLength` (or
`fileSize`) are also used when present. Do not copy real `mediaKey` values into
logs, tickets, or examples.

The client:

1. Accepts JPEG, PNG, and WebP only, with a 10 MB decrypted-image limit.
2. Requires an HTTPS media URL on a `whatsapp.net` host.
3. Downloads without attaching the FlareSend API Authorization header.
4. Verifies the encrypted media MAC, decrypts the media, checks the declared
   size when provided, and validates the image file signature.
5. Passes image bytes and MIME type to the LLM only on the Health Education
   path. The image prompt explicitly forbids diagnosis and treats text in an
   image as untrusted.

For an image without a caption, the bot supplies a generic prompt asking what
the user wants to know. If the image cannot be opened, it replies with a
text-only resend/description instruction.

### Incoming voice note

Voice-note data is carried under `data.message.audioMessage`. The implementation
expects `mimetype`, `mediaKey`, and `url` or `directPath`, with optional
`fileLength`/`fileSize`, `seconds`, and `isPtt`.

The client accepts Ogg/Opus, limits decrypted audio to 16 MB, verifies and
decrypts the WhatsApp media, and checks for an Ogg file signature. The
`VoicePipelineService` submits the resulting buffer to AssemblyAI with language
detection, punctuation, and text formatting enabled. The transcript then
enters the shared message router. The response is a WhatsApp text message; no
speech synthesis or outbound audio upload is currently connected.

## Phone identity and registration

FlareSend can identify some senders with a WhatsApp LID such as
`12345@lid`, rather than a phone-number JID. The bot keeps this WhatsApp
identity separate from the verified phone used for replies and appointments.
An unlinked LID cannot be used as a phone destination.

When using the hosted registration page (`/register`):

1. The patient submits their phone number in international format and consents
   to linking it.
2. The bot sends a one-time numeric code to that number.
3. The patient sends the code from the WhatsApp account they want to link.
4. A valid code links the incoming WhatsApp identity to that phone. Normal
   messages can then be answered.

The code is stored hashed, expires after ten minutes, and has request/guess
limits. Apply migrations before enabling registration. The bot handles a
six-digit inbound code before normal intent classification. Do not send a
linking code in public or display it in a public registration page.

## Response types and data flow

There are three response layers. Do not confuse the webhook acknowledgement
with the patient-facing response.

### 1. Webhook HTTP acknowledgement

The POST controller immediately returns HTTP 200:

```ts
{ status: 'received' }
```

Processing continues asynchronously. Provider retry behavior and deployment
timeouts should be considered when hosting the app.

### 2. Internal voice/text pipeline result

`VoicePipelineService` returns a `PipelineExecutionResult`. Its important
fields are:

```ts
interface PipelineExecutionResult {
  intakeUuid: string;
  senderPhone: string;
  transcript: string;
  detectedLanguage?: string;
  intent: 'CLINICAL_INTAKE' | 'HEALTH_EDUCATION' | 'BOOKING_SESSION';
  intentConfidence: number;
  clinicalIntake?: ClinicalIntakeSchema;
  bookingResult?: { confirmationMessage: string };
  healthEducationReply?: string;
  patientMessage: string;
  ttsAudioBase64?: string;
  status: 'completed' | 'failed';
  error?: string;
}
```

The webhook sender uses `patientMessage` as the outbound reply. `ttsAudioBase64`
is an optional result field in the shared type, but the FlareSend voice-note
path does not generate or send it. On voice failures, the pipeline returns a
failed result with a safe fallback `patientMessage`.

Clinical extraction uses this structured data shape:

```ts
interface ClinicalIntakeSchema {
  primary_symptom: string;
  patient_verbatim_quote: string;
  anatomical_location: string;
  duration_and_onset: string;
  pain_character: string;
  functional_impact: string;
  previous_interventions: string;
  immediate_triage_flag: boolean;
  confidence_score: number;
}
```

It is persisted as lead notes. It is not returned as JSON to the patient; the
patient receives a fixed acknowledgement.

### 3. Patient-facing WhatsApp reply

The actual FlareSend response sent to the patient is a plain text string. It is
one of:

- A generated Health Education answer.
- A fixed clinical-intake receipt.
- A booking question, read-back, cancellation, emergency instruction, or
  confirmation.
- A media/transcription failure fallback.
- A verified registration confirmation.

The FlareSend `sendTextMessage` method does not send the internal JSON result,
image bytes, or audio bytes.

## LLM inference and intent routing

The active FlareSend inbound path calls `VoicePipelineService`, which uses the
`LLM_PROVIDER` abstraction. The abstraction is wired at startup to Gemini or
OpenAI and wrapped by `ObservedLlmProvider` for call logging.

### Routing order

For text, captions, and successfully transcribed voice notes:

1. Ensure a user record exists and log the inbound message.
2. If a fresh booking draft exists, continue it without running the intent
   classifier. Stale drafts are removed and reclassified.
3. Otherwise, classify into one of:
   - `BOOKING_SESSION`: the user wants a specific appointment or time.
   - `CLINICAL_INTAKE`: a personal active symptom or clinical concern without a
     specific appointment-time request.
   - `HEALTH_EDUCATION`: a general dental/oral-health question.
4. Booking runs a multi-turn extraction process. The model extracts only
   explicitly stated fields; TypeScript validates clinic, service, date, time,
   opening hours, slot availability, and confirmation. A booking is created
   only after the user confirms the read-back.
5. Clinical Intake extracts a schema for the clinic team and records a lead.
   The standard response is a fixed acknowledgement.
6. Health Education generates a concise conversational response. Images are
   attached to this LLM call when the classified intent is Health Education.

The code contains both `AiService` and the voice/text pipeline. The FlareSend
webhook currently uses `VoicePipelineService`; it does not call
`AiService.generateReply()`. In particular, clinic/insurance grounding and the
disclaimer appended by `AiService` are not automatically applied to the
Synthetic Steward response. If those behaviors are required in FlareSend
replies, integrate them deliberately rather than assuming the other service
already runs.

### Model settings and structured output

Both Gemini and OpenAI providers currently use temperature `0.4` and a maximum
of 800 output tokens. They support `responseFormat: 'json'` for callers that
need JSON. Booking extraction uses this mode and validates parsed output;
intent classification and clinical extraction currently rely on prompts,
parsing, and fallback behavior rather than requesting provider JSON mode.

`ObservedLlmProvider` records provider, model, operation, prompt, history,
response, status, error, and duration in the LLM call log. These records may
include patient messages, transcripts, or health details. Restrict admin
access, follow applicable privacy policies, and avoid using real patient
content in prompt experiments.

## Language behavior and tuning

The response rules are centralized in
[`src/prompts/system-prompts.ts`](./src/prompts/system-prompts.ts). The main
prompts are:

- `INTENT_CLASSIFIER_SYSTEM_PROMPT` and
  `buildIntentClassificationPrompt()` for routing.
- `BORDER_AGENT_SYSTEM_PROMPT` and
  `buildBorderAgentUserPrompt()` for clinical extraction.
- `SYNTHETIC_STEWARD_SYSTEM_PROMPT` and
  `buildSyntheticStewardUserPrompt()` for educational answers.
- `BOOKING_EXTRACTION_SYSTEM_PROMPT` and
  `buildBookingExtractionPrompt()` for booking fields.

The Steward prompt currently asks for Swahili, English, or mixed Kenyan
phrasing and to match the user's primary language. The intent classifier prompt
includes English and Swahili examples. The booking extraction schema accepts
`en` and `sw` only. AssemblyAI's detected language code is retained in the
pipeline result, but it is not currently injected into the classifier or
Steward prompt. Clinical-intake receipts are currently hard-coded in Swahili.
Therefore, language matching is prompt-led and not enforced consistently
across routes.

To tune language and intent safely:

1. Change the centralized prompt definitions, not provider-specific copies.
2. Keep the three intent definitions mutually exclusive. In particular,
   preserve the existing priority: symptoms plus a specific requested
   appointment date/time should route to `BOOKING_SESSION`; symptoms without a
   requested slot should route to `CLINICAL_INTAKE`.
3. Add realistic, non-identifying examples for English, Swahili, Sheng, code
   switching, typos, and short replies such as "yes", "ndiyo", "sawa", and
   "tomorrow at 10". Include ambiguous cases and expected intent.
4. If explicit language selection is needed, pass the detected language into
   the generation prompts and define a fallback for unsupported/uncertain
   language codes. Do not treat speech-detection language as infallible; the
   transcript itself should remain available for context.
5. Keep safety constraints explicit in every response-generating prompt.
   Clinical extraction should quote reported symptoms, not diagnose; education
   should not prescribe; booking confirmation should be produced only by the
   deterministic booking state machine.
6. Validate structured responses after parsing. For new classifier JSON
   fields, add runtime validation and a deterministic safe fallback rather
   than trusting prompt compliance.
7. Evaluate prompt edits against a small fixed test set before deployment.
   Measure intent correctness, language match, booking field extraction,
   refusal/triage behavior, and whether responses invent clinic facts. Keep
   the examples and expected outputs with focused tests where practical.
8. Avoid relying only on temperature changes to fix misrouting. Clarify prompt
   boundaries and validate the model's output first. The current provider
   temperature is set in `gemini.provider.ts` and `openai.provider.ts`.

The classifier's fallback heuristic is in
[`src/modules/voice-pipeline/voice-pipeline.service.ts`](./src/modules/voice-pipeline/voice-pipeline.service.ts).
It uses English and Swahili keyword lists; it is a reliability fallback, not a
complete multilingual language or intent detector. Update and test it if
prompt/schema changes alter the classifier's categories.

## Verify the bot end to end

### 1. Confirm application and database

- `npm run start:dev` starts without configuration or database errors.
- Seeded clinics/services are present if booking is expected.
- `GET /webhook` returns HTTP 200 and the active-endpoint JSON.

### 2. Confirm FlareSend can call the webhook

Send a WhatsApp message to the connected instance. Check application logs for a
`message_received` event and a safe summary of sender type/message length. The
handler should not log the full inbound media key or image/audio bytes.

### 3. Confirm text reply

Send a simple text question from a normal one-to-one WhatsApp chat, for example
"How can I brush better?" Confirm that the inbound message is classified,
processed, and followed by a FlareSend outbound text message. If the provider
returns a failed or invalid recipient, verify the normalized recipient and
instance readiness in FlareSend.

### 4. Confirm booking flow

Use a non-urgent test booking conversation. Provide the required details, check
the read-back, then reply "Yes" or "Ndiyo". Verify that the appointment is not
created until confirmation and that the final reply is sent.

### 5. Confirm voice and image paths

- Send a short Ogg/Opus WhatsApp voice note. Confirm successful media download,
  AssemblyAI transcription, intent processing, and a text reply.
- Send a supported JPEG, PNG, or WebP under 10 MB with a question. Confirm the
  image is described safely and the response does not diagnose.
- Test unsupported/oversized media and provider/transcription failures; a
  user-facing fallback should be returned where the handler supports one.

Run the relevant existing tests and build when changing code:

```bash
npm test -- --runInBand
npm run build
```

## Operational and safety notes

- Keep FlareSend, LLM, AssemblyAI, and database credentials in environment
  secrets; never commit them.
- Webhook handling currently has no provider authenticity validation. Before
  production, confirm FlareSend's supported webhook authentication mechanism
  and add verification if available. The checked-in API reference recommends
  validating webhook requests.
- Use HTTPS for the webhook and restrict access to admin endpoints and LLM
  usage records.
- `ObservedLlmProvider` persists full prompts and responses. Consider retention,
  access control, and redaction requirements before processing real patient
  data.
- The bot is not a clinician. Preserve the no-diagnosis, no-prescription, and
  emergency-handoff rules when tuning prompts or adding modalities.
