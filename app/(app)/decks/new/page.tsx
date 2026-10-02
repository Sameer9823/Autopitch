import { CreateDeckForm } from "@/components/decks/create-deck-form";

export const metadata = { title: "New Deck" };

export default function NewDeckPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 lg:px-6">
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Create a new deck
          </h1>
          <p className="text-sm text-muted-foreground">
            Write a brief or import material you already have. Raisevia AI builds
            the deck, then you refine it slide by slide.
          </p>
        </div>

        <CreateDeckForm />
      </div>
    </div>
  );
}
