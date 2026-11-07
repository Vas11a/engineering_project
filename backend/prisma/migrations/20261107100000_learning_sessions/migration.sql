ALTER TABLE "StudySession"
ADD COLUMN "queue" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "answeredCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "correctCount" INTEGER NOT NULL DEFAULT 0;

-- Existing sessions predate durable queues; retain history, but do not resume them.
UPDATE "StudySession" SET "status" = 'ABANDONED'
WHERE "status" = 'ACTIVE';

-- Preserve historical answers when a card is deleted. The original question ID
-- is not a foreign key, so retries remain idempotent after deletion.
ALTER TABLE "StudyAnswer" ADD COLUMN "questionCardId" UUID;
-- Leave questionCardId NULL on legacy answers: historical sessions may contain
-- repeated reviews of the same card. PostgreSQL permits multiple NULL unique keys.
ALTER TABLE "StudyAnswer" ADD COLUMN "questionSetId" UUID;
UPDATE "StudyAnswer" a SET "questionSetId" = c."setId"
FROM "Card" c WHERE a."cardId" = c."id";
ALTER TABLE "StudyAnswer" DROP CONSTRAINT "StudyAnswer_cardId_fkey";
ALTER TABLE "StudyAnswer" ALTER COLUMN "cardId" DROP NOT NULL;
ALTER TABLE "StudyAnswer" ADD CONSTRAINT "StudyAnswer_cardId_fkey"
FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "StudyAnswer_sessionId_questionCardId_key" ON "StudyAnswer"("sessionId", "questionCardId");

CREATE INDEX "StudyAnswer_userId_questionSetId_idx" ON "StudyAnswer"("userId", "questionSetId");

CREATE TABLE "BotUpdate" (
  "updateId" BIGINT NOT NULL,
  "processedAt" TIMESTAMP(3),
  "leasedUntil" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BotUpdate_pkey" PRIMARY KEY ("updateId")
);
CREATE TABLE "AiRateLimit" (
  "userId" UUID NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL,
  CONSTRAINT "AiRateLimit_pkey" PRIMARY KEY ("userId")
);
