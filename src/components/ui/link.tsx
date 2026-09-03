import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Button } from "./button";

type ButtonProps = Omit<Parameters<typeof Button>[0], "render">;
type AnchorProps = Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "target" | "rel" | "download"
>;

interface LinkProps extends ButtonProps, AnchorProps {
  href: string;
  children: ReactNode;
}

/* base ui composes through `render` rather than radix's `asChild`, so a button
   that is really a link hands it the anchor to render as */
export function Link({
  href,
  target,
  rel,
  download,
  children,
  ...props
}: LinkProps) {
  return (
    <Button
      render={<a href={href} target={target} rel={rel} download={download} />}
      {...props}
    >
      {children}
    </Button>
  );
}
