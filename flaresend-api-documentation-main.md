# Flaresend WhatsApp Messaging API Documentation

## Overview

**Flaresend API** provides a simple and reliable way to integrate WhatsApp messaging into your applications. From building chatbots, notification systems, to customer support tools, Flaresend makes it easy to send, receive, and manage messages at scale all through secure RESTful endpoints.
Get started by creating an account, setting up a WhatsApp instance, scanning the QR code, and generating your API key.

**Base URL:** `https://api.flaresend.com`

**API Version:** `v1.0.0`

---

## How It Works

### Step 1: Account Creation

1. Visit [https://www.flaresend.com](https://www.flaresend.com)
2. Click **“Get Started”** to log in/sign up
3. Fill in the required signup information.
4. Log in to your dashboard.

---

### Step 2: Creating an Instance

> ⚠️ **Important:** You must have a connected WhatsApp instance before sending any messages or receive any notifications.

**Option A — Dashboard**

1. Navigate to the **“Your WhatsApp Instances”** section in your dashboard.
2. Click **“Create New Instance”** at the top-right corner, a new instance will be generated automatically.
3. Click **Show QR** button to scan the generated QR code.
4. (**If instance(s) is disconnected**) Click the **“Reconnect”** button to link your WhatsApp number.
5. Scan the QR code displayed on the screen following the on-screen instructions.

**Option B — API (server / third-party integrations)**

Create and link instances programmatically via the [Instance Management](#instance-management) endpoints: create an instance, poll the QR code or request a phone pairing code, then use the returned instance API key for messaging.

---

### Step 3: Generate an API Key

1. Go to the **“API Keys”** section in your dashboard.
2. Copy your generated API key linked to the connected whatsapp number, you’ll use it for all authenticated requests to the Flaresend API.

> 🔒 **Security Tip:** Keep your API key secret. It authenticates your application and grants full access to your account.

---

## Authentication

All API requests must be authenticated using a **Bearer token** in the `Authorization` header.

```bash
Authorization: Bearer YOUR_TOKEN
```

| Token type | How to obtain | Typical use |
| ---------- | ------------- | ----------- |
| **Instance API key** | Returned when you create an instance (`POST /instances`), or copied from the dashboard | Messaging and most product APIs |
| **Session JWT** | `POST /login` (response field `apiKey` is the JWT) | Instance lifecycle (create, QR, pairing, reconnect) if you do not yet have an API key |

Instance Management endpoints accept **either** a JWT or an API key belonging to the same account.

Example cURL request:

```bash
curl -X GET https://api.flaresend.com/instances \
     -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Instance Management

Use these endpoints to create a WhatsApp instance, show a QR code for scanning, or link with a phone number (pairing code). Suitable for any server-side or third-party integration that cannot use the Flaresend dashboard UI.

**Base URL:**
`https://api.flaresend.com`

### Recommended integration flow

1. Log in with `POST /login` to obtain a session JWT (or use an existing account API key).
2. Create an instance with `POST /instances` — store `instanceId` and the returned **instance-scoped** `apiKey`.
3. Poll `GET /instances/:id/qr` every **2–3 seconds** until `status` is `awaiting_scan` (QR ready) or `connected`.
4. Either display the QR (`qr` string / `qr-image`) **or** call `POST /instances/:id/pairing-code` with the WhatsApp phone number.
5. Keep polling until `status` is `connected`.
6. Call messaging APIs (e.g. `POST /send-message`) with the **instance** `apiKey` from step 2.

> **Requirements:** Creating an instance requires an **active subscription** and must not exceed your plan’s instance limit. Phone numbers must be international digits without `+` (e.g. `254712345678`).

### Instance status values

| Status | Meaning |
| ------ | ------- |
| `initializing` | WhatsApp session is starting; QR not ready yet |
| `awaiting_scan` | QR / pairing is available — wait for the user to link WhatsApp |
| `connected` | Ready to send and receive messages |
| `disconnected` | Session lost — use reconnect or show a new QR |
| `logged_out` | Logged out of WhatsApp — reset session / new QR required |
| `reinitializing` | Soft restart in progress (e.g. after QR poll on disconnected) |

---

### 1. Login (session JWT)

Obtain a session token for instance lifecycle calls. The response field `apiKey` is a **JWT** (not a long-lived instance API key).

**Endpoint:**
`POST /login`

#### **Headers**

| Header         | Type   | Description                 |
| -------------- | ------ | --------------------------- |
| `Content-Type` | string | Must be `application/json`. |

#### **Request Body**

| Parameter  | Type   | Required | Description        |
| ---------- | ------ | -------- | ------------------ |
| `email`    | string | ✅        | Account email.     |
| `password` | string | ✅        | Account password.  |

#### **Example cURL Request**

```bash
curl --location 'https://api.flaresend.com/login' \
--header 'Content-Type: application/json' \
--data '{
    "email": "integration@example.com",
    "password": "your-password"
}'
```

#### **Example Response**

```json
{
    "success": true,
    "message": "Login successful",
    "apiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "userId": 42,
    "fullname": "Jane Doe",
    "isBetaTester": false,
    "isAdmin": false,
    "needsPhone": false
}
```

Use `apiKey` as `Authorization: Bearer …` for the endpoints below until you have an instance API key.

---

### 2. Create Instance

Creates a new WhatsApp instance and an **instance-scoped API key**. WhatsApp initialization runs in the background; poll QR/status until connected.

**Endpoint:**
`POST /instances`

#### **Headers**

| Header          | Type   | Description                                      |
| --------------- | ------ | ------------------------------------------------ |
| `Authorization` | string | Bearer JWT or API key.                           |
| `Content-Type`  | string | `application/json` (optional; body not required). |

#### **Example cURL Request**

```bash
curl --location --request POST 'https://api.flaresend.com/instances' \
--header 'Authorization: Bearer YOUR_JWT_OR_API_KEY'
```

#### **Example Response (201)**

```json
{
    "success": true,
    "message": "Instance created successfully",
    "instanceId": "20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9",
    "status": "initializing",
    "apiKey": "96ecbab74c68d05bac84b177e4ed0b8717b79788bc220ecaa0fbea11ba34da32"
}
```

| Field        | Description |
| ------------ | ----------- |
| `instanceId` | UUID of the new instance — use in path params below. |
| `apiKey`     | Instance-scoped key for messaging once connected. Store securely. |
| `status`     | Starts as `initializing`. |

#### **Error Responses**

**❌ 401 Unauthorized**

```json
{
    "success": false,
    "error": "Authorization header required"
}
```

**❌ 403 Subscription / limit** (typical when plan has no capacity or subscription inactive)

```json
{
    "success": false,
    "message": "…"
}
```

---

### 3. List Instances

Lists all instances owned by the authenticated user, including live status hints and suggested actions.

**Endpoint:**
`GET /instances`

#### **Headers**

| Header          | Type   | Description            |
| --------------- | ------ | ---------------------- |
| `Authorization` | string | Bearer JWT or API key. |

#### **Example cURL Request**

```bash
curl --location 'https://api.flaresend.com/instances' \
--header 'Authorization: Bearer YOUR_JWT_OR_API_KEY'
```

#### **Example Response**

```json
{
    "success": true,
    "total": 1,
    "instances": [
        {
            "id": "20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9",
            "status": "connected",
            "whatsapp_user_id": "254712345678:…@s.whatsapp.net",
            "actions": ["send_message", "check_status", "reset_session", "delete"]
        }
    ]
}
```

---

### 4. Get Instance Details

Returns status, linked WhatsApp user (if any), and a QR data URL when the instance is awaiting scan.

**Endpoint:**
`GET /instances/:id`

#### **Path Parameters**

| Parameter | Type   | Required | Description     |
| --------- | ------ | -------- | --------------- |
| `id`      | string | ✅        | Instance UUID.  |

#### **Headers**

| Header          | Type   | Description            |
| --------------- | ------ | ---------------------- |
| `Authorization` | string | Bearer JWT or API key. |

#### **Example cURL Request**

```bash
curl --location 'https://api.flaresend.com/instances/20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9' \
--header 'Authorization: Bearer YOUR_JWT_OR_API_KEY'
```

#### **Example Response**

```json
{
    "id": "20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9",
    "status": "awaiting_scan",
    "dbStatus": "awaiting_scan",
    "memoryStatus": "awaiting_scan",
    "isConnected": false,
    "user": null,
    "connectedAt": null,
    "qr": "data:image/png;base64,…"
}
```

When connected, `user` is the WhatsApp number digits and `isConnected` is `true`.

---

### 5. Get / Poll QR Code

Polling-friendly endpoint for client UIs. Call every 2–3 seconds after create or reconnect until the instance is connected.

**Endpoint:**
`GET /instances/:id/qr`

#### **Path Parameters**

| Parameter | Type   | Required | Description    |
| --------- | ------ | -------- | -------------- |
| `id`      | string | ✅        | Instance UUID. |

#### **Headers**

| Header          | Type   | Description            |
| --------------- | ------ | ---------------------- |
| `Authorization` | string | Bearer JWT or API key. |

#### **Example cURL Request**

```bash
curl --location 'https://api.flaresend.com/instances/20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9/qr' \
--header 'Authorization: Bearer YOUR_JWT_OR_API_KEY'
```

#### **Example Responses**

**QR ready (`awaiting_scan`)**

```json
{
    "success": true,
    "status": "awaiting_scan",
    "qr": "2@ABCDEF…",
    "qrImageUrl": "/instances/20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9/qr-image",
    "message": "Scan the QR code to connect"
}
```

- `qr` — raw QR payload (render with a QR library in your UI).
- `qrImageUrl` — relative path to a PNG image (see next endpoint). Prefixed with the base URL: `https://api.flaresend.com` + `qrImageUrl`.

**Still generating**

```json
{
    "success": true,
    "status": "initializing",
    "message": "QR code is being generated"
}
```

**Already connected**

```json
{
    "success": true,
    "status": "connected",
    "user": "254712345678:…@s.whatsapp.net",
    "connectedAt": "2026-09-08T10:00:00.000Z",
    "message": "Instance is already connected"
}
```

**❌ 404 Not found**

```json
{
    "success": false,
    "error": "Instance not found"
}
```

---

### 6. Get QR Code Image (PNG)

Returns the current QR as a **PNG** binary (`Content-Type: image/png`). Only available while `status` is `awaiting_scan` and a QR exists.

**Endpoint:**
`GET /instances/:id/qr-image`

#### **Example cURL Request**

```bash
curl --location 'https://api.flaresend.com/instances/20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9/qr-image' \
--header 'Authorization: Bearer YOUR_JWT_OR_API_KEY' \
--output qr.png
```

#### **Error Responses**

**❌ 400 QR not available**

```json
{
    "error": "QR code not available",
    "status": "initializing"
}
```

**❌ 404 Instance not found**

```json
{
    "success": false,
    "error": "Instance not found",
    "message": "No instance found with the specified ID"
}
```

---

### 7. Link with Phone Number (Pairing Code)

Generates a WhatsApp **pairing code** so the user can link without scanning a QR (WhatsApp → Linked Devices → Link with phone number).

**Endpoint:**
`POST /instances/:id/pairing-code`

#### **Headers**

| Header          | Type   | Description                 |
| --------------- | ------ | --------------------------- |
| `Authorization` | string | Bearer JWT or API key.      |
| `Content-Type`  | string | Must be `application/json`. |

#### **Path Parameters**

| Parameter | Type   | Required | Description    |
| --------- | ------ | -------- | -------------- |
| `id`      | string | ✅        | Instance UUID. |

#### **Request Body**

| Parameter       | Type   | Required | Description |
| --------------- | ------ | -------- | ----------- |
| `phone_number`  | string | ✅        | WhatsApp number in international format **without** `+` (e.g. `254712345678`). |

#### **Example cURL Request**

```bash
curl --location 'https://api.flaresend.com/instances/20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9/pairing-code' \
--header 'Authorization: Bearer YOUR_JWT_OR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "phone_number": "254712345678"
}'
```

#### **Example Response**

```json
{
    "success": true,
    "code": "ABCD-EFGH",
    "message": "Pairing code generated successfully"
}
```

Show `code` to the user. Then poll `GET /instances/:id/qr` or `GET /instances/:id/status` until `connected`.

#### **Error Responses**

**❌ 400 Missing phone**

```json
{
    "success": false,
    "message": "Phone number is required"
}
```

**❌ 400 Already connected**

```json
{
    "success": false,
    "message": "Instance is already connected."
}
```

**❌ 404 Not found**

```json
{
    "success": false,
    "message": "Instance not found"
}
```

**❌ 500 Init failure**

```json
{
    "success": false,
    "message": "Instance failed to initialize."
}
```

---

### 8. Get Instance Status

Live status plus suggested `actions` for your UI (e.g. `get_qr`, `reconnect`, `reset_session`).

**Endpoint:**
`GET /instances/:id/status`

#### **Example cURL Request**

```bash
curl --location 'https://api.flaresend.com/instances/20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9/status' \
--header 'Authorization: Bearer YOUR_JWT_OR_API_KEY'
```

#### **Example Response**

```json
{
    "id": "20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9",
    "status": "awaiting_scan",
    "dbStatus": "awaiting_scan",
    "memoryStatus": "awaiting_scan",
    "isConnected": false,
    "connectedAt": null,
    "whatsappUserId": null,
    "hasQr": true,
    "qrAvailable": true,
    "actions": ["get_qr", "check_status", "reset_session"]
}
```

---

### 9. Instance Health

Live socket check. Prefer `connected: true` here over the database badge alone when deciding if messaging is safe.

**Endpoint:**
`GET /instances/:id/health`

#### **Example cURL Request**

```bash
curl --location 'https://api.flaresend.com/instances/20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9/health' \
--header 'Authorization: Bearer YOUR_JWT_OR_API_KEY'
```

#### **Example Response**

```json
{
    "status": "connected",
    "connected": true,
    "instanceId": "20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9",
    "instanceCreatedAt": "2026-09-01T08:00:00.000Z",
    "user": "254712345678:…@s.whatsapp.net",
    "hasQr": false,
    "lastUpdate": "2026-09-08T12:00:00.000Z",
    "hint": null
}
```

When not connected, `hint` is often `"reconnect"`.

---

### 10. Reconnect Instance

Soft reconnect: reloads existing auth without wiping the session (unless status is `logged_out`). After calling, verify with `GET /instances/:id/health`.

**Endpoint:**
`POST /instances/:id/reconnect`

#### **Example cURL Request**

```bash
curl --location --request POST 'https://api.flaresend.com/instances/20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9/reconnect' \
--header 'Authorization: Bearer YOUR_JWT_OR_API_KEY'
```

#### **Example Response**

```json
{
    "success": true,
    "message": "Instance reconnection initiated",
    "instanceId": "20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9",
    "status": "initializing"
}
```

---

### 11. Reset Session / Relink WhatsApp

Clears Baileys session credentials only. Keeps the instance row, API keys, and webhooks. The user must scan a **new QR** or request a **new pairing code**.

**Endpoint:**
`POST /instances/:id/reset-session`

**Aliases (same behavior):**

- `POST /instances/:id/reset_session`
- `POST /instances/:id/relink`

#### **Example cURL Request**

```bash
curl --location --request POST 'https://api.flaresend.com/instances/20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9/reset-session' \
--header 'Authorization: Bearer YOUR_JWT_OR_API_KEY'
```

#### **Example Response**

```json
{
    "success": true,
    "message": "Session reset. Instance and API key kept — scan a new QR to relink WhatsApp.",
    "instanceId": "20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9",
    "status": "awaiting_scan",
    "next": "get_qr"
}
```

Then poll `GET /instances/:id/qr` again.

---

### 12. Delete Instance

Deletes the instance, its auth session, and associated instance API keys.

**Endpoint:**
`DELETE /instances/:id`

#### **Example cURL Request**

```bash
curl --location --request DELETE 'https://api.flaresend.com/instances/20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9' \
--header 'Authorization: Bearer YOUR_JWT_OR_API_KEY'
```

#### **Example Response**

```json
{
    "success": true,
    "message": "Instance and api key associated deleted successfully",
    "instanceId": "20ebbeb3-b8ad-4bef-a1d9-667ab2a385a9"
}
```

---

## Messaging

**Base URL:**
`https://api.flaresend.com`



### Send Message

This endpoint allows you to send WhatsApp messages through your connected instance.
You can send **text**, **documents**, **media** (image, audio, or video), or **template** messages depending on your integration setup.

> **Note:** The _/check-number_ API endpoint has been implemented to verify the validity of a phone number and confirm whether it’s registered on WhatsApp before a message is sent. Therefore, there is no need of calling the /check-number API again

**Endpoint:**
`POST /send-message`

---

### **Headers**

| Header          | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `Authorization` | string | Bearer token used for authentication. |
| `Content-Type`  | string | Must be `application/json`.           |

---

### **Request Body**

| Parameter    | Type   | Required             | Description                                                                       |
| ------------ | ------ | -------------------- | --------------------------------------------------------------------------------- |
| `recipients` | array  | ✅                    | List of recipient phone numbers in international format (e.g., `"2547XXXXXXXX"`). |
| `type`       | string | ✅                    | Message type , e.g., `text`, `image`, `video`, `document`, etc.                   |
| `text`       | string | ✅ (if `type` = text) | The message content to send.                                                      |

---

### **Example cURL Request**

```bash
curl --location 'https://api.flaresend.com/send-message' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "recipients": ["254712345678"],
    "type": "text",
    "text": "Hello from the APIs!"
}'
```

> **Note:** The _/check-number_ API endpoint has been implemented to verify the validity of a phone number and confirm whether it’s registered on WhatsApp before a message is sent. Therefore, there is no need of calling the /check-number api again
---

### **Example Response**

**Success Response (200)**

```json
{
    "success": true,
    "message": "Message sending completed: 2 successful, 0 failed",
    "sent_at": "2023-12-01T12:01:00Z",
    "total_recipients": 2,
    "successful_recipients": ["254712345678@s.whatsapp.net", "254798765432@s.whatsapp.net"],
    "failed_recipients": [],
    "invalid_recipients": [] //Invalid numbers not registered on whatsapp
}
```

**Error Response (401)**

```json
{
    "success": false,
    "error": "Authorization header required"
}
```

**Error Response (425)**

```json
{
    "success": false,
    "message": "Instance not ready for messaging",
    "status": "initializing",
    "action": "Please ensure the QR code is scanned and the instance is connected"
}
```

**Error Response (400)**

```json
{
    "success": false,
    "message": "Recipients array is required"
}
```

---

## Additional Message Types

Below are examples of how to send different message types using the same `/send-message` endpoint.

---

### **Document Message (File Upload)**

```bash
curl --location 'https://api.flaresend.com/send-message' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--form 'recipients[]="254712345678"' \
--form 'recipients[]="254718841608"' \
--form 'type="document"' \
--form 'file=@"/C:/Users/sosmo/Documents/Sec1L1.pdf"'
```

---

### **Document Message (via URL)**

```json
{
    "recipients": ["254712345678"],
    "type": "document",
    "url": "https://example.com/file.pdf",
    "fileName": "Report.pdf"
}
```

---

### **Image Message (via URL)**

```json
{
    "recipients": ["254712345678"],
    "type": "image",
    "url": "https://example.com/image.jpg",
    "caption": "Check this out!"
}
```

---

### **Image Message (File Upload)**

**Form Data:**

* `recipients[]`: ["254712345678"]
* `type`: `image`
* `caption`: `"Check this out!"`
* `file`: *(select image file)*

---

### **Video Message (via URL)**

```json
{
    "recipients": ["254712345678"],
    "type": "video",
    "url": "https://example.com/video.mp4",
    "caption": "Watch this!"
}
```

---

### **Audio Message (via URL)**

```json
{
    "recipients": ["254712345678"],
    "type": "audio",
    "url": "https://example.com/audio.mp3"
}
```
---

Here is a polished, ready-to-paste **Schedule Messages** section matching the formatting and tone of your existing documentation:

---

## Scheduled Messaging

Flaresend allows you to schedule WhatsApp messages to be delivered at a future date and time. This is useful for reminders, notifications, campaigns, and automated workflows.

---

### Schedule a Message

**Endpoint:** `POST /schedule-message`

### **Headers**

| Header          | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `Authorization` | string | Bearer token used for authentication. |
| `Content-Type`  | string | Must be `application/json`.           |

---

### **Request Body**

| Parameter    | Type   | Required              | Description                                                             |
| ------------ | ------ | --------------------- | ----------------------------------------------------------------------- |
| `recipients` | array  | ✅                     | List of phone numbers in international format (e.g., `"2547XXXXXXXX"`). |
| `type`       | string | ✅                     | Message type — `text`, `image`, `video`, `audio`, `document`, etc.      |
| `text`       | string | Required if type=text | Message content.                                                        |
| `sendAt`     | string | ✅                     | Scheduled time in `YYYY-MM-DD HH:mm:ss` format (24-hour).               |

---

### **Example cURL Request**

```bash
curl --location 'https://api.flaresend.com/schedule-message' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--data '{
    "recipients": ["254708920430"],
    "type": "text",
    "text": "Again!",
    "sendAt": "2025-11-14 13:48:00"
}'
```

---

### **Success Response (200)**

```json
{
  "success": true,
  "message": "Message scheduled successfully",
  "scheduled_for": "2025-11-14 13:48:00",
  "task_id": "SCHED-9128371923"
}
```

---

## View Scheduled Messages

Retrieve all pending or upcoming scheduled messages.

**Endpoint:** `GET /scheduled-messages`

### **Headers**

| Header          | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `Authorization` | string | Bearer token used for authentication. |

---

### **Example cURL Request**

```bash
curl --location 'https://api.flaresend.com/scheduled-messages' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

---

### **Example Response**

```json
{
  "success": true,
  "message": "Scheduled messages fetched successfully",
  "data": [
    {
      "id": "SCHED-9128371923",
      "recipients": ["254708920430"],
      "type": "text",
      "text": "Again!",
      "sendAt": "2025-11-14 13:48:00",
      "status": "pending"
    }
  ]
}
```
---
Here’s your refined version with the **Update endpoint switched to PATCH** (for partial updates) and some small formatting improvements so it’s consistent and ready to copy-paste:

---

## Update a Scheduled Message

Update the message content, recipients, or scheduled time before it is sent.

**Endpoint:** `PATCH /scheduled-messages/:id`

---

### **Headers**

| Header          | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `Authorization` | string | Bearer token used for authentication. |
| `Content-Type`  | string | Must be `application/json`.           |

---

### **Request Body**

| Parameter    | Type   | Required              | Description                                                  |
| ------------ | ------ | --------------------- | ------------------------------------------------------------ |
| `recipients` | array  | Optional              | Updated list of recipient phone numbers.                     |
| `type`       | string | Optional              | Message type — `text`, `image`, `video`, etc.                |
| `text`       | string | Required if type=text | Updated message content.                                     |
| `url`        | string | Optional              | New file/media URL.                                          |
| `caption`    | string | Optional              | Updated caption for media.                                   |
| `sendAt`     | string | Optional              | New schedule time `YYYY-MM-DD HH:mm:ss` (server local time). |

> Only the fields you include will be updated.

---

### **Example cURL Request**

```bash
curl --location --request PATCH 'https://api.flaresend.com/scheduled-messages/123' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "text": "Updated message!",
    "sendAt": "2025-11-16 14:30:00"
}'
```

---

### **Example Success Response**

```json
{
  "success": true,
  "message": "Scheduled message updated successfully",
  "id": "123",
  "updated_fields": ["text", "sendAt"]
}
```

---

### **Error Response (Message already sent or locked)**

```json
{
  "success": false,
  "message": "This scheduled message can no longer be updated"
}
```
### **Error Response (Incorrect Scheduled Message Id)**
```json
{
    "success": false,
    "message": "Scheduled message not found"
}
```
---

## Cancel a Scheduled Message

Cancel a scheduled message before the send time.
Once cancelled, the message will not be delivered.

**Endpoint:** `DELETE /scheduled-messages/:id`

---

### **Headers**

| Header          | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `Authorization` | string | Bearer token used for authentication. |

---

### **Example cURL Request**

```bash
curl --location --request DELETE 'https://api.flaresend.com/scheduled-messages/123' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

---

### **Success Response**

```json
{
  "success": true,
  "message": "Scheduled message cancelled successfully",
  "id": "123"
}
```

---

### **Error Response (Invalid or already processed)**

```json
{
  "success": false,
  "message": "Scheduled message not found or cannot be cancelled"
}
```

---

## Group Management

Manage WhatsApp groups using the Flaresend API.
You can create groups, list existing groups, view details, generate invite links, and send messages to groups.

**Base URL:**
`https://api.flaresend.com`

---

### 1. Create Group

**Endpoint:**
`POST /groups`

Creates a new WhatsApp group with a specified subject and list of participants.

---

#### **Headers**

| Header          | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `Authorization` | string | Bearer token used for authentication. |
| `Content-Type`  | string | Must be `application/json`.           |

---

#### **Request Body**

| Parameter      | Type   | Required | Description                                                |
| -------------- | ------ | -------- | ---------------------------------------------------------- |
| `subject`      | string | ✅        | The name of the group.                                     |
| `participants` | array  | ✅        | List of participant phone numbers in international format. |

---

#### **Example Request**

```bash
curl --location 'https://api.flaresend.com/groups' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--data '{ 
    "subject": "Family Group 4", 
    "participants": ["254712345678","254723456789"] 
}'
```

#### **Example Response**

```json
{
    "success": true,
    "message": "Group created successfully",
    "data": {
        "id": "120363420800326612@g.us",
        "addressingMode": "lid",
        "subject": "Family Group 4",
        "subjectOwner": "163514152964174@lid",
        "subjectTime": 1755072787,
        "size": 2,
        "creation": 1755072787,
        "owner": "163514152964174@lid",
        "restrict": false,
        "announce": false,
        "isCommunity": false,
        "isCommunityAnnounce": false,
        "joinApprovalMode": false,
        "memberAddMode": false,
        "participants": [
            {
                "id": "163514152964174@lid",
                "admin": "superadmin"
            },
            {
                "id": "268813446717676@lid",
                "admin": null
            }
        ]
    }
}
```

---

### 2. List All Groups

**Endpoint:**
`GET /groups`

Fetches all existing groups in your connected WhatsApp instance.

---

#### **Headers**

| Header          | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `Authorization` | string | Bearer token used for authentication. |

---

#### **Optional Query Parameters**

| Parameter | Type    | Description                 |
| --------- | ------- | --------------------------- |
| `page`    | integer | Page number for pagination. |
| `limit`   | integer | Number of results per page. |

---

#### **Example Request**

```bash
curl --location 'https://api.flaresend.com/groups?page=1&limit=10' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

#### **Example Response**

```json
{
    "success": true,
    "message": "Fetched all groups successfully",
    "data": {
        "120363403582097887@g.us": {
            "id": "120363403582097887@g.us",
            "subject": "Again again",
            "size": 2,
            "owner": "268813446717676@lid",
            "participants": [
                {
                    "id": "163514152964174@lid",
                    "admin": null
                },
                {
                    "id": "268813446717676@lid",
                    "admin": "superadmin"
                }
            ]
        },
        "120363420250618357@g.us": {
            "id": "120363420250618357@g.us",
            "subject": "Family Group 4",
            "size": 2,
            "owner": "163514152964174@lid",
            "participants": [
                {
                    "id": "163514152964174@lid",
                    "admin": "superadmin"
                },
                {
                    "id": "268813446717676@lid",
                    "admin": null
                }
            ]
        }
    }
}
```

---

### 3. Get Group Information

**Endpoint:**
`GET /groups/{groupId}`

Retrieves detailed information about a specific group.

---

#### **Headers**

| Header          | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `Authorization` | string | Bearer token used for authentication. |

---

#### **Example Request**

```bash
curl --location 'https://api.flaresend.com/groups/120363420250618357@g.us' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

#### **Example Response**

```json
{
    "success": true,
    "message": "Group info fetched successfully",
    "data": {
        "id": "120363420250618357@g.us",
        "name": "Weekend Hiking Plans",
        "desc": "Plan for our next hike.",
        "createdAt": "Aug 13, 2025, 11:01 PM",
        "owner": "163514152964174@lid",
        "isCommunity": false,
        "participants": [
            {
                "id": "50479304319053@lid",
                "admin": "admin"
            },
            {
                "id": "163514152964174@lid",
                "admin": null
            },
            {
                "id": "268813446717676@lid",
                "admin": "admin"
            }
        ]
    }
}
```

---

### 4. Get Group Invite Link

**Endpoint:**
`GET /groups/{groupId}/invite-link`

Fetches the group’s WhatsApp invite link.

---

#### **Headers**

| Header          | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `Authorization` | string | Bearer token used for authentication. |

---

#### **Example Request**

```bash
curl --location 'https://api.flaresend.com/groups/120363403582097887@g.us/invite-link' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

---

### 5. Send Group Message

**Endpoint:**
`POST /groups/send-message`

Sends a message to one or more WhatsApp groups.

---

#### **Headers**

| Header          | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `Authorization` | string | Bearer token used for authentication. |
| `Content-Type`  | string | Must be `application/json`.           |

---

#### **Request Body**

| Parameter   | Type   | Required             | Description                                |
| ----------- | ------ | -------------------- | ------------------------------------------ |
| `groupJids` | array  | ✅                    | List of WhatsApp group IDs (`@g.us`).      |
| `type`      | string | ✅                    | Message type , e.g., `text`, `image`, etc. |
| `text`      | string | ✅ (if `type` = text) | The message content to send.               |

---

#### **Example Request**

```bash
curl --location 'https://api.flaresend.com/groups/send-message' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--data-raw '{
    "groupJids": ["120363403582097887@g.us"],
    "type": "text",
    "text": "Hello group again!"
}'
```

#### **Example Response**

```json
{
    "success": true,
    "message": "Message sent successfully to 1 group",
    "data": {
        "delivered": ["120363403582097887@g.us"],
        "failed": []
    }
}
```
---
Here’s the refined documentation for your **6th API endpoint** written in the same style and format as your provided template:

---

### 6. Manage Group Participants

**Endpoint:**
`POST /groups/:groupId/participants`

Performs participant management actions in a WhatsApp group, including adding, removing, promoting, or demoting users.

---

#### **Headers**

| Header          | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `Authorization` | string | Bearer token used for authentication. |
| `Content-Type`  | string | Must be `application/json`.           |

---

#### **Request Body**

| Field          | Type   | Required | Description                                                                  |
| -------------- | ------ | -------- | ---------------------------------------------------------------------------- |
| `action`       | string | ✅ Yes    | The operation to perform. Accepts: `add`, `remove`, `promote`, or `demote`.  |
| `participants` | array  | ✅ Yes    | List of participant WhatsApp IDs (`@s.whatsapp.net`) to apply the action to. |

---

#### **Example Request**

```bash
curl --location 'https://api.flaresend.com/groups/120363422712338174@g.us/participants' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--data-raw '{
    "action": "add",
    "participants": [
        "254712345678",
        "254798765432"
    ]
}'
```

---

#### **Success Responses**

**Add Participants**

```json
{
    "success": true,
    "message": "Participants successfully added",
    "groupId": "120363422712330174@g.us",
    "participants": [
        "254712345678",
        "254798765432"
    ]
}
```

**Remove Participants**

```json
{
    "success": true,
    "message": "Participants successfully removed",
    "groupId": "120363422712330174@g.us",
    "participants": [
        "254798765432"
    ]
}
```

**Promote Participants**

```json
{
    "success": true,
    "message": "Participants successfully promoted",
    "groupId": "120363422712330174@g.us",
    "participants": [
        "254798765432"
    ]
}
```

**Demote Participants**

```json
{
    "success": true,
    "message": "Participants successfully demoted",
    "groupId": "120363422712330174@g.us",
    "participants": [
        "254798765432"
    ]
}
```

---

#### **Error Responses**

**Participants already in group**

```json
{
    "success": false,
    "message": "Some participants are already in the group.",
    "invalid": [
        "254798765432"
    ]
}
```

**Participants not found or invalid**

```json
{
    "success": false,
    "message": "Some participants are not in the group.",
    "invalid": [
        "254700000000"
    ]
}
```

**Invalid action**

```json
{
    "success": false,
    "message": "Invalid action. Allowed: add, remove, promote, demote."
}
```

---

## Channel Management

**Base URL:**
`https://api.flaresend.com`

Channel Management endpoints allow you to create, manage, and interact with WhatsApp channels (newsletters), including posting messages, updating channel details, and managing subscriptions.

> **Important Notes:**
>
> * To send a message to a channel, first obtain the **channel invite code** from your WhatsApp app (mobile handset).
> * Use the endpoint `/channels/invite/:inviteCode` to retrieve the **channel JID (channel ID)**.
> * Then use the retrieved `channel JID` in `/channels/:newsletterJid/message` to send messages to the channel.
> * The **List Channels** feature is currently a work in progress and not available yet.

---

# 1. Send Message to Channel

This endpoint allows you to send messages to a WhatsApp channel (newsletter).
You can send **text, image, video, audio, or document** messages.

---

### Endpoint

`POST /channels/:newsletterJid/message`

---

### Headers

| Header          | Type   | Description                             |
| --------------- | ------ | --------------------------------------- |
| `Authorization` | string | Bearer token for authentication         |
| `Content-Type`  | string | application/json or multipart/form-data |

---

### Path Parameters

| Parameter     | Type   | Required | Description                       |
| ------------- | ------ | -------- | --------------------------------- |
| newsletterJid | string | ✅        | Channel JID (e.g. 123@newsletter) |

---

### Request Body

| Parameter | Type   | Required           | Description                                                 |
| --------- | ------ | ------------------ | ----------------------------------------------------------- |
| type      | string | ✅                  | Message type: `text`, `image`, `video`, `audio`, `document` |
| text      | string | conditional (text) | Required when type is `text`                                |
| url       | string | optional           | Media URL (if not uploading file)                           |
| caption   | string | optional           | Caption for media                                           |
| mimetype  | string | optional           | File MIME type                                              |
| fileName  | string | optional           | File name                                                   |
| file      | file   | optional           | Uploaded file (multipart)                                   |

---

### Example cURL

```bash
curl --location 'https://api.flaresend.com/channels/120363406469149890@newsletter/message' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "type": "text",
    "text": "Hello everyone 👋"
}'
```

---

### Example Response

```json
{
  "success": true,
  "message": "Channel message sent successfully",
  "sent_at": "2026-04-06T17:36:38.092Z"
}
```

---

### Error Responses

**403 - Not Allowed**

```json
{
  "success": false,
  "message": "You are not allowed to post in this channel",
  "role": "SUBSCRIBER"
}
```

**404 - Channel Not Found**

```json
{
  "success": false,
  "message": "Channel not found or inaccessible"
}
```

**400 - Missing Data**

```json
{
  "success": false,
  "message": "Text is required"
}
```

---

# 2. Get Channel Metadata (by JID)

This endpoint retrieves detailed information about a WhatsApp channel.

---

### Endpoint

`GET /channels/:newsletterJid`

---

### Example cURL

```bash
curl --location 'https://api.flaresend.com/channels/120363313617097254@newsletter' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

---

### Example Response

```json
{
  "success": true,
  "channel": {
    "id": "120363313617097254@newsletter",
    "state": {
      "type": "ACTIVE"
    },
    "thread_metadata": {
      "name": {
        "text": "Naivas Supermarket"
      },
      "description": {
        "text": "Saves you money!"
      },
      "subscribers_count": "364628"
    },
    "viewer_metadata": {
      "role": "SUBSCRIBER"
    }
  }
}
```

---

# 3. Get Channel Metadata (by Invite Link)

This endpoint retrieves channel information using an invite code.

---

### Endpoint

`GET /channels/invite/:inviteCode`

---

### Example cURL

```bash
curl --location 'https://api.flaresend.com/channels/invite/0029VanAL05IHphM6gyJ7h02' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

---

### Example Response

```json
{
  "success": true,
  "channel": {
    "id": "120363313617097254@newsletter",
    "state": {
      "type": "ACTIVE"
    }
  }
}
```

---

# 4. Create Channel

This endpoint creates a new WhatsApp channel.

---

### Endpoint

`POST /channels`

---

### Request Body

| Parameter   | Type   | Required | Description         |
| ----------- | ------ | -------- | ------------------- |
| name        | string | ✅        | Channel name        |
| description | string | optional | Channel description |

---

### Example cURL

```bash
curl --location 'https://api.flaresend.com/channels' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "name": "Engineering 55",
    "description": "test description"
}'
```

---

### Example Response

```json
{
  "success": true,
  "message": "Channel created successfully",
  "channel": {
    "id": "120363406469149890@newsletter",
    "name": "Engineering 55",
    "invite": "0029Vb8Bvrt8vd1YTuvt1S14",
    "subscribers": 0
  }
}
```

---

# 5. Update Channel

This endpoint updates channel details such as name, description, or picture.

---

### Endpoint

`PUT /channels/:newsletterJid`

---

### Request Body

| Parameter   | Type   | Required | Description      |
| ----------- | ------ | -------- | ---------------- |
| name        | string | optional | New channel name |
| description | string | optional | New description  |
| picture     | string | optional | Image URL        |

---

### Example cURL

```bash
curl --location --request PUT 'https://api.flaresend.com/channels/120363313617097254@newsletter' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "name": "Updated Channel Name",
    "description": "Updated description"
}'
```

---

### Example Response

```json
{
  "success": true,
  "message": "Channel updated"
}
```

---

# 6. Follow Channel

This endpoint subscribes the authenticated user to a channel.

---

### Endpoint

`POST /channels/:newsletterJid/follow`

---

### Example cURL

```bash
curl --location 'https://api.flaresend.com/channels/120363313617097254@newsletter/follow' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

---

### Example Response

```json
{
  "success": true,
  "message": "Channel followed successfully",
  "alreadyFollowing": false
}
```

---

# 7. Unfollow Channel

This endpoint unsubscribes the user from a channel.

---

### Endpoint

`POST /channels/:newsletterJid/unfollow`

---

### Example cURL

```bash
curl --location 'https://api.flaresend.com/channels/120363313617097254@newsletter/unfollow' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

---

### Example Response

```json
{
  "success": true,
  "message": "Channel unfollowed successfully"
}
```

---
## Webhooks

Flaresend can notify your server in real time when specific events occur, such as receiving new WhatsApp messages. When a webhook is triggered, Flaresend sends a `POST` request with event data to your registered webhook URL.

**Endpoint:** `POST {your_webhook_url}`
**Content-Type:** `application/json`

---

### Setup

1. Go to the **Your WhatsApp Instances** section in your Flaresend dashboard.
2. Click the **Edit Webhook** button.
3. Enter your webhook endpoint URL (must start with `https://`).
4. Save and verify your webhook by sending a message to the connected WhatsApp number or testing via Postman.

> **Note:** During verification, your endpoint may need to respond to a challenge or return a **200 OK** status to confirm successful setup.

---

### Example Event: Message Received

```json
{
  "event": "message_received",
  "instanceId": "9b540e83-e1ca-49b4-8c34-01fd31991d04",
  "data": {
    "from": "254712345678@s.whatsapp.net",
    "message": {
      "conversation": "Hi, how are you",
      "messageContextInfo": {
        "deviceListMetadata": {
          "senderKeyHash": "k0KrwvtTGeJWyg==",
          "senderTimestamp": "1760137298",
          "recipientKeyHash": "fBBUmTapmjlK9w==",
          "recipientTimestamp": "1760704527"
        },
        "deviceListMetadataVersion": 2,
        "messageSecret": "40cV3I0agULcjIrFPsHdaDiA5BuAmFR4CkdpOlUpOHs="
      }
    },
    "timestamp": 1760705280,
    "id": "AC2EB4F50AAAC4C20D27DA8130FC844A"
  },
  "timestamp": "2025-10-17T12:47:59.689Z"
}
```

---

### Event Fields

| Field                             | Type    | Description                                                      |
| --------------------------------- | ------- | ---------------------------------------------------------------- |
| `event`                           | string  | Type of event. Example: `message_received`.                      |
| `instanceId`                      | string  | Unique identifier of the connected WhatsApp instance.            |
| `data.from`                       | string  | WhatsApp ID of the sender (JID format).                          |
| `data.message.conversation`       | string  | The actual text content of the message.                          |
| `data.message.messageContextInfo` | object  | Metadata about the message and device keys (encryption-related). |
| `data.id`                         | string  | Internal message identifier.                                     |
| `data.timestamp`                  | integer | Unix timestamp (seconds) when the message was received.          |
| `timestamp`                       | string  | ISO-formatted timestamp when the webhook was delivered.          |

---

### Responding to Webhooks

Your webhook endpoint should return a **200 OK** response to acknowledge successful receipt. If Flaresend receives anything other than a 200 response repeatedly, delivery may be paused or retried according to the dashboard settings.

**Example acknowledgement response:**

```json
{
  "status": "received"
}
```

---

### Tips & Best Practices

* Use HTTPS endpoints and validate incoming requests (HMAC signature or token) to ensure the payload is from Flaresend.
* Retry logic: design your endpoint to handle duplicate events (idempotency).
* Log webhook payloads and response status codes for debugging.
* Filter events you don't need in the dashboard to reduce traffic.

---

## Check WhatsApp Number

This endpoint allows you to verify whether a given phone number is registered on WhatsApp.
It’s useful before attempting to send messages or add participants to groups.

**Endpoint:** `POST /check-number`
**Base URL:** `https://api.flaresend.com`

---

### **Headers**

| Header          | Type   | Description                           |
| --------------- | ------ | ------------------------------------- |
| `Content-Type`  | string | Must be `application/json`.           |
| `Authorization` | string | Bearer token used for authentication. |

---

### **Request Body**

| Parameter | Type   | Required | Description                                                               |
| --------- | ------ | -------- | ------------------------------------------------------------------------- |
| `number`  | string | ✅        | The phone number to check, in international format (e.g. `254712345678`). |

---

### **Example cURL Request**

```bash
curl --location 'https://api.flaresend.com/check-number' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "number": "254798765432"
}'
```

---

### **Example Responses**

**✅ Success (200)**

```json
{
    "success": true,
    "number": "254798765432",
    "exists": true
}
```

**❌ Error (400)**

```json
{
    "success": false,
    "message": "Invalid number format or missing field"
}
```

**❌ Error (401)**

```json
{
    "success": false,
    "error": "Authorization header required"
}
```
---
### **Support**

Need assistance or have questions about the API?
Reach out to our support team via:

* 📧 **Email:** [support@flaresend.com](mailto:support@flaresend.com)
* 💬 **WhatsApp:** [Chat with Support](https://wa.me/254708920430?text=Hi%20Flaresend%20team%2C%20I%20need%20help%20with%20the%20API)