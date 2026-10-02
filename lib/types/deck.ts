import type { DeckType, FundraisingStage, ImageStatus } from "@/lib/generated/prisma/client";
import type { SlideBlock, SlideLayout } from "@/lib/schemas/slide";

export type DeckStatus = "PENDING" | "GENERATING" | "COMPLETE" | "FAILED";

export type SlideImageStatus = ImageStatus;

export type Slide = {
  id: string;
  order: number;
  title: string;
  content: string;
  imagePrompt: string;
  imageUrl: string | null;
  subtitle?: string | null;
  layout?: SlideLayout;
  blocks?: SlideBlock[];
  caption?: string | null;
  label?: string | null;
  speakerNotes?: string | null;
  imageStatus?: SlideImageStatus;
  imageError?: string | null;
  userEdited?: boolean;
};

export type DeckDetail = {
  id: string;
  idea: string;
  title: string | null;
  startupName: string | null;
  deckType: DeckType;
  stage: FundraisingStage;
  askAmount: string | null;
  status: DeckStatus;
  errorMessage: string | null;
  pitchScore: number | null;
  completion: number;
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
};

export type DeckListItem = {
  id: string;
  idea: string;
  title: string | null;
  startupName: string | null;
  deckType: DeckType;
  stage: FundraisingStage;
  status: DeckStatus;
  errorMessage: string | null;
  pitchScore: number | null;
  completion: number;
  slideCount: number;
  viewCount?: number;
  createdAt: string;
  updatedAt: string;
};

export function isDeckGenerating(status: DeckStatus) {
  return status === "PENDING" || status === "GENERATING";
}
