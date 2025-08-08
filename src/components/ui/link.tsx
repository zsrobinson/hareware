// see https://github.com/shadcn-ui/ui/issues/1979#issuecomment-2998073174

import { Button } from "./button";

type BaseButtonProps = Parameters<typeof Button>[0];
type ButtonProps = Omit<BaseButtonProps, "asChild">;

interface LinkProps extends ButtonProps {
  href: string;
  children: React.ReactNode;
}

export function Link({ href, children, ...props }: LinkProps) {
  return (
    <Button asChild {...props}>
      <a href={href}>{children}</a>
    </Button>
  );
}
