import { Fragment } from "react";

/** A part's name that a narrow box may break after a slash, never inside a word. */
export function Title({ text }: { text: string }) {
  const pieces = text.split("/");
  return (
    <>
      {pieces.map((piece, index) => (
        <Fragment key={index}>
          {piece}
          {index < pieces.length - 1 && (
            <>
              /<wbr />
            </>
          )}
        </Fragment>
      ))}
    </>
  );
}
