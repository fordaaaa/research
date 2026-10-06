interface FlashcardFaceProps {
  front: string;
  back: string;
  flipped: boolean;
  onFlip: () => void;
  disabled?: boolean;
}

export default function FlashcardFace({ front, back, flipped, onFlip, disabled = false }: FlashcardFaceProps) {
  return (
    <button
      className="w-full text-center"
      onClick={onFlip}
      aria-label={flipped ? "Hide answer" : "Show answer"}
      disabled={disabled}
    >
      <span className="text-[11px] uppercase tracking-wider text-neutral-600">
        {flipped ? "answer — tap to hide" : "question — tap to reveal"}
      </span>
      <span
        key={flipped ? "back" : "front"}
        className="animate-flashcard-face mt-2 block whitespace-pre-wrap text-base leading-relaxed"
      >
        {flipped ? back : front}
      </span>
    </button>
  );
}
