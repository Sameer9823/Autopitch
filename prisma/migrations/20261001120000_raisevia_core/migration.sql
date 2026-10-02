-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('NONE', 'QUEUED', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "DeckType" AS ENUM ('PITCH_DECK', 'ONE_PAGER', 'DATA_ROOM', 'UPDATE');

-- CreateEnum
CREATE TYPE "FundraisingStage" AS ENUM ('BOOTSTRAP', 'PRE_SEED', 'SEED', 'SERIES_A', 'SERIES_B', 'GROWTH', 'LATER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('VIEW', 'VIEW_DOWNLOAD');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionCategory" AS ENUM ('MARKET', 'PRODUCT', 'COMPETITION', 'TRACTION', 'BUSINESS_MODEL', 'REVENUE', 'GTM', 'FINANCIALS', 'TEAM', 'FUNDRAISING', 'RISKS');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('ONE_PAGER', 'EXECUTIVE_SUMMARY', 'COLD_EMAIL', 'ELEVATOR_PITCH', 'MEETING_SCRIPT', 'LANDING_PAGE');

-- CreateEnum
CREATE TYPE "UsageEventType" AS ENUM ('DECK_GENERATED', 'SLIDE_GENERATED', 'AI_GENERATION', 'IMAGE_GENERATION', 'AI_REVIEW', 'QA_SESSION', 'EXPORT', 'SHARE_VIEW', 'STORAGE');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('PDF', 'PPTX');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "askAmount" TEXT,
ADD COLUMN     "completion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currency" VARCHAR(8),
ADD COLUMN     "deckType" "DeckType" NOT NULL DEFAULT 'PITCH_DECK',
ADD COLUMN     "pitchScore" INTEGER,
ADD COLUMN     "runwayMonths" INTEGER,
ADD COLUMN     "stage" "FundraisingStage" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "startupName" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL,
ADD COLUMN     "workspaceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Slide" ADD COLUMN     "blocks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "caption" TEXT,
ADD COLUMN     "chartData" JSONB,
ADD COLUMN     "chartType" VARCHAR(24),
ADD COLUMN     "generationSource" VARCHAR(32),
ADD COLUMN     "imageError" TEXT,
ADD COLUMN     "imageStatus" "ImageStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "label" TEXT,
ADD COLUMN     "layout" TEXT NOT NULL DEFAULT 'CONTENT',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "speakerNotes" TEXT,
ADD COLUMN     "subtitle" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userEdited" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlideRevision" (
    "id" TEXT NOT NULL,
    "slideId" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlideRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckVersion" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "createdById" TEXT,
    "summary" TEXT,
    "snapshot" JSONB NOT NULL,
    "isRestoredFrom" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckShare" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'VIEW',
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckView" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "shareId" TEXT,
    "visitorHash" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "maxSlideOrder" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DeckView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlideView" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "slideId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "dwellMs" INTEGER NOT NULL DEFAULT 0,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlideView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchReview" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "overallScore" INTEGER,
    "payload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PitchReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestorQuestion" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "category" "QuestionCategory" NOT NULL,
    "rationale" TEXT,
    "slideRef" VARCHAR(160),
    "difficulty" INTEGER NOT NULL DEFAULT 3,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestorQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "clarity" INTEGER,
    "specificity" INTEGER,
    "evidence" INTEGER,
    "relevance" INTEGER,
    "conciseness" INTEGER,
    "overallScore" INTEGER,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" VARCHAR(32),
    "secondaryColor" VARCHAR(32),
    "accentColor" VARCHAR(32),
    "headingFont" VARCHAR(64),
    "bodyFont" VARCHAR(64),
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slideLayout" JSONB NOT NULL DEFAULT '[]',
    "thumbnailUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeckTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundraisingAsset" (
    "id" TEXT NOT NULL,
    "deckId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "hasGaps" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundraisingAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckChatMessage" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "type" "UsageEventType" NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "deckId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "SlideRevision_slideId_idx" ON "SlideRevision"("slideId");

-- CreateIndex
CREATE INDEX "SlideRevision_deckId_createdAt_idx" ON "SlideRevision"("deckId", "createdAt");

-- CreateIndex
CREATE INDEX "DeckVersion_deckId_createdAt_idx" ON "DeckVersion"("deckId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeckVersion_deckId_number_key" ON "DeckVersion"("deckId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "DeckShare_token_key" ON "DeckShare"("token");

-- CreateIndex
CREATE INDEX "DeckShare_deckId_idx" ON "DeckShare"("deckId");

-- CreateIndex
CREATE INDEX "DeckShare_token_idx" ON "DeckShare"("token");

-- CreateIndex
CREATE INDEX "DeckShare_createdAt_idx" ON "DeckShare"("createdAt");

-- CreateIndex
CREATE INDEX "DeckView_deckId_viewedAt_idx" ON "DeckView"("deckId", "viewedAt");

-- CreateIndex
CREATE INDEX "DeckView_deckId_visitorHash_idx" ON "DeckView"("deckId", "visitorHash");

-- CreateIndex
CREATE INDEX "DeckView_shareId_idx" ON "DeckView"("shareId");

-- CreateIndex
CREATE INDEX "SlideView_viewId_idx" ON "SlideView"("viewId");

-- CreateIndex
CREATE INDEX "SlideView_deckId_order_idx" ON "SlideView"("deckId", "order");

-- CreateIndex
CREATE INDEX "SlideView_slideId_idx" ON "SlideView"("slideId");

-- CreateIndex
CREATE INDEX "PitchReview_deckId_createdAt_idx" ON "PitchReview"("deckId", "createdAt");

-- CreateIndex
CREATE INDEX "InvestorQuestion_deckId_createdAt_idx" ON "InvestorQuestion"("deckId", "createdAt");

-- CreateIndex
CREATE INDEX "InvestorQuestion_deckId_category_idx" ON "InvestorQuestion"("deckId", "category");

-- CreateIndex
CREATE INDEX "InvestorQuestion_saved_idx" ON "InvestorQuestion"("saved");

-- CreateIndex
CREATE INDEX "QuestionAttempt_deckId_createdAt_idx" ON "QuestionAttempt"("deckId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionAttempt_questionId_createdAt_idx" ON "QuestionAttempt"("questionId", "createdAt");

-- CreateIndex
CREATE INDEX "BrandKit_userId_idx" ON "BrandKit"("userId");

-- CreateIndex
CREATE INDEX "BrandKit_workspaceId_idx" ON "BrandKit"("workspaceId");

-- CreateIndex
CREATE INDEX "DeckTemplate_workspaceId_idx" ON "DeckTemplate"("workspaceId");

-- CreateIndex
CREATE INDEX "DeckTemplate_isPublic_idx" ON "DeckTemplate"("isPublic");

-- CreateIndex
CREATE INDEX "FundraisingAsset_deckId_type_idx" ON "FundraisingAsset"("deckId", "type");

-- CreateIndex
CREATE INDEX "FundraisingAsset_workspaceId_createdAt_idx" ON "FundraisingAsset"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeckChatMessage_deckId_createdAt_idx" ON "DeckChatMessage"("deckId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_workspaceId_createdAt_idx" ON "UsageEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_deckId_createdAt_idx" ON "UsageEvent"("deckId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_type_createdAt_idx" ON "UsageEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Deck_userId_idx" ON "Deck"("userId");

-- CreateIndex
CREATE INDEX "Deck_workspaceId_idx" ON "Deck"("workspaceId");

-- CreateIndex
CREATE INDEX "Deck_createdAt_idx" ON "Deck"("createdAt");

-- CreateIndex
CREATE INDEX "Deck_updatedAt_idx" ON "Deck"("updatedAt");

-- CreateIndex
CREATE INDEX "Deck_status_idx" ON "Deck"("status");

-- CreateIndex
CREATE INDEX "Slide_deckId_order_idx" ON "Slide"("deckId", "order");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideRevision" ADD CONSTRAINT "SlideRevision_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "Slide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideRevision" ADD CONSTRAINT "SlideRevision_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckVersion" ADD CONSTRAINT "DeckVersion_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckShare" ADD CONSTRAINT "DeckShare_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckView" ADD CONSTRAINT "DeckView_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckView" ADD CONSTRAINT "DeckView_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "DeckShare"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideView" ADD CONSTRAINT "SlideView_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideView" ADD CONSTRAINT "SlideView_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "DeckView"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideView" ADD CONSTRAINT "SlideView_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "Slide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchReview" ADD CONSTRAINT "PitchReview_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorQuestion" ADD CONSTRAINT "InvestorQuestion_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InvestorQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckTemplate" ADD CONSTRAINT "DeckTemplate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckTemplate" ADD CONSTRAINT "DeckTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundraisingAsset" ADD CONSTRAINT "FundraisingAsset_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundraisingAsset" ADD CONSTRAINT "FundraisingAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckChatMessage" ADD CONSTRAINT "DeckChatMessage_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

