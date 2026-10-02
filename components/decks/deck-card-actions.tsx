"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteDeckAction,
  duplicateDeckAction,
  renameDeckAction,
  type DeckActionResult,
} from "@/app/actions/decks";
import {
  Copy02Icon,
  TrashIcon,
  DownloadIcon,
  PencilIcon,
  ExternalLinkIcon,
  Folder01Icon,
  Share01Icon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Deck card actions: Open, Share, Export, Duplicate, Rename, Delete.
 * Every action is a Server Function that re-checks ownership server-side.
 */
export function DeckCardActions({
  deckId,
  deckTitle,
}: {
  deckId: string;
  deckTitle: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(deckTitle ?? "");
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<DeckActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setRenameOpen(false);
      setDeleteOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="xs"
          render={<a href={`/decks/${deckId}/editor`} />}
        >
          <HugeiconsIcon icon={ExternalLinkIcon} aria-hidden />
          Open
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-xs" aria-label="Deck actions" />}
          >
            <HugeiconsIcon icon={Folder01Icon} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<a href={`/decks/${deckId}/share`} />}>
              <HugeiconsIcon icon={Share01Icon} aria-hidden />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<a href={`/api/decks/${deckId}/export?format=pdf`} />}
            >
              <HugeiconsIcon icon={DownloadIcon} aria-hidden />
              Export PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<a href={`/api/decks/${deckId}/export?format=pptx`} />}
            >
              <HugeiconsIcon icon={DownloadIcon} aria-hidden />
              Export PPTX
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setName(deckTitle ?? "");
                setRenameOpen(true);
              }}
            >
              <HugeiconsIcon icon={PencilIcon} aria-hidden />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pending}
              onClick={() => run(() => duplicateDeckAction(deckId))}
            >
              <HugeiconsIcon icon={Copy02Icon} aria-hidden />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <HugeiconsIcon icon={TrashIcon} aria-hidden />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename deck</DialogTitle>
            <DialogDescription>
              Give this deck a name you will recognise.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(() => renameDeckAction(deckId, name));
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deck-name">Deck name</Label>
              <Input
                id="deck-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={200}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" type="button" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this deck?</DialogTitle>
            <DialogDescription>
              This permanently removes the deck, its slides, versions, share
              links and analytics. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => deleteDeckAction(deckId))}
            >
              {pending ? "Deleting…" : "Delete deck"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
