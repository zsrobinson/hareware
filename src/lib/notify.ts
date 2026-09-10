/*
  the one way a page says something happened.

  every island imports this and none of them import sonner, so the toast
  library is replaceable without touching a page. the split into two calls
  rather than one with a level is deliberate: a failure that renders as a
  success is the shape of silent failure this repo keeps meeting, and a
  caller choosing between two named functions cannot pass the wrong flag.
*/

import { toast } from "sonner";

export const notify = {
  ok: (text: string) => toast.success(text),
  failed: (text: string) => toast.error(text),
};
