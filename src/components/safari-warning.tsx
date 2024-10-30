import { ExclamationTriangleIcon } from "@radix-ui/react-icons";

/*
 * i don't love having to show this error, but there's a lot of unexpected
 * behavior with html-to-image (https://github.com/bubkoo/html-to-image)
 * when using safari. i'd rather be clear about the fact that safari isn't
 * really working right now than to just add a 300ms delay onto the button
 * (https://github.com/bubkoo/html-to-image/issues/461#issuecomment-2140720521)
 * and hope that things work.
 */

export function SafariWarning() {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  return (
    isSafari && (
      <div className="flex items-center gap-2 pt-4 text-sm font-medium text-red-500">
        <ExclamationTriangleIcon className="mt-0.5 min-w-max" />
        This browser may not download images properly. Please use a non-Safari
        desktop browser such as Chrome, Firefox, or Edge.
      </div>
    )
  );
}
