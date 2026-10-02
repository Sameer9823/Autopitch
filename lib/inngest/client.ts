import { Inngest } from "inngest";

export type InngestEvents = {
  "deck/generate": {
    data: {
      deckId: string;
      userId?: string;
      workspaceId?: string;
    };
  };
};

export const inngest = new Inngest({
  id: "raisevia-ai",
});
