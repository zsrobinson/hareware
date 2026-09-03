import { Button } from "./button";

type ButtonProps = Omit<Parameters<typeof Button>[0], "render">;

interface LinkProps extends ButtonProps {
  href: string;
  children: React.ReactNode;
}

/* base ui composes through `render` rather than radix's `asChild`, so a button
   that is really a link hands it the anchor to render as */
export function Link({ href, children, ...props }: LinkProps) {
  return (
    <Button render={<a href={href} />} {...props}>
      {children}
    </Button>
  );
}
