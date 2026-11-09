CREATE TABLE "LlmCallLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "responseFormat" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "userPrompt" TEXT NOT NULL,
    "history" TEXT NOT NULL,
    "response" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCallLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LlmCallLog_createdAt_idx" ON "LlmCallLog"("createdAt");
CREATE INDEX "LlmCallLog_status_createdAt_idx" ON "LlmCallLog"("status", "createdAt");
CREATE INDEX "LlmCallLog_operation_createdAt_idx" ON "LlmCallLog"("operation", "createdAt");
