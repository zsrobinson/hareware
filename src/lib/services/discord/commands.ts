/*
  the command surface, as data.

  one command — `/article` — with a subcommand per property, per ADR 0009.
  nothing here talks to discord or to notion: this builds the registration
  payload and hashes it, and `register.ts` is what puts it on the guild.

  discord bakes an option's choices into the *registration* rather than
  resolving them when somebody opens the picker, so the choices notion offers
  have to be folded in here and re-registered when the schema changes
*/

/**
 * a select option read out of the notion schema.
 *
 * declared here rather than imported from the notion service on purpose — this
 * module is a payload builder and knows nothing about where the rows came
 * from, so the cron, a webhook and a test can all supply them
 */
export type ChoiceInput = {
  /** the notion property name, verbatim: "Article Status" */
  property: string;
  /** the option name, verbatim: "Not started" — casing included */
  name: string;
  /** notion's own ordering, which is the order the picker shows */
  position: number;
};

/** discord's option types, of which we so far use one */
const SUB_COMMAND = 1;

/** discord refuses a registration carrying a 26th choice on any one option */
const MAX_CHOICES = 25;

export type CommandChoice = { name: string; value: string };

export type CommandOption = {
  type: number;
  name: string;
  description: string;
  options: CommandOption[];
  choices?: CommandChoice[];
  required?: boolean;
  /** discord asks us for suggestions as the editor types, rather than us
      listing them up front. only ever on the article picker, whose options
      are the 138 rows of the index */
  autocomplete?: boolean;
};

export type ApplicationCommand = {
  name: string;
  description: string;
  /**
   * "0" means nobody, until a server admin grants the command to a role under
   * Server Settings → Integrations. that override is editable by any admin, so
   * this is a default and not a security boundary — the role is checked again
   * when the interaction arrives
   */
  default_member_permissions: string;
  options: CommandOption[];
};

/** what a PUT to the guild commands endpoint takes: every command, at once */
export type CommandPayload = ApplicationCommand[];

/**
 * the choices for one notion property, in notion's order.
 *
 * exported and folded in already, though `/article ping` takes no options,
 * because it is the shape every other subcommand needs: adding `/article
 * status` later is an entry in the table below rather than a restructuring of
 * how choices reach the payload
 */
export function choicesFor(
  choices: ChoiceInput[],
  property: string,
): CommandChoice[] {
  return (
    choices
      .filter((choice) => choice.property === property)
      .sort((a, b) => a.position - b.position)
      /*
        a 26th choice makes discord reject the entire registration, which would
        take every command down until somebody deleted a notion option. losing
        the tail of a picker is the better failure
      */
      .slice(0, MAX_CHOICES)
      /*
        the value is the option name verbatim. ADR 0009: no notion value is
        ever typed into this repo, so the casing traps cannot be introduced
      */
      .map((choice) => ({ name: choice.name, value: choice.name }))
  );
}

type Subcommand = {
  name: string;
  description: string;
  /** takes the notion choices, so a picker is data rather than a code change */
  options: (choices: ChoiceInput[]) => CommandOption[];
};

/** discord's option type for a string */
const STRING = 3;

/**
 * the article picker, which every subcommand about one article takes first.
 *
 * autocompleted rather than choice-listed: there are 138 articles and discord
 * caps a choice list at 25, so the suggestions are computed per keystroke from
 * the index. the value that comes back is a notion page id
 */
const articleOption = (): CommandOption => ({
  type: STRING,
  name: "article",
  description: "Which Article. Start typing a headline or a byline.",
  options: [],
  required: true,
  autocomplete: true,
});

const SUBCOMMANDS: Subcommand[] = [
  {
    name: "ping",
    description:
      "Check that HareWare is listening, and see who Discord says you are.",
    options: () => [],
  },
  {
    name: "find",
    description: "Search the Articles tracker.",
    options: () => [
      {
        type: STRING,
        name: "query",
        description: "Part of a headline or a byline.",
        options: [],
        required: true,
      },
    ],
  },
  {
    name: "show",
    description: "Everything Notion holds about one Article.",
    options: () => [articleOption()],
  },
];

/** the payload to register: `/article`, with everything notion currently offers */
export function buildCommands(choices: ChoiceInput[]): CommandPayload {
  return [
    {
      name: "article",
      description: "Edit an Article in the tracker without leaving Discord.",
      default_member_permissions: "0",
      options: SUBCOMMANDS.map((subcommand) => ({
        type: SUB_COMMAND,
        name: subcommand.name,
        description: subcommand.description,
        options: subcommand.options(choices),
      })),
    },
  ];
}

/**
 * a stable digest of the payload, so an unchanged schema registers nothing.
 *
 * discord allows 200 guild command registrations a day and the hourly cron
 * re-registers regardless of whether anything changed, so this is what keeps a
 * quiet week from spending the budget. key order is normalised because
 * `JSON.stringify` preserves insertion order — a payload rebuilt with two
 * fields swapped is the same command surface and must hash the same.
 *
 * web crypto rather than node's `crypto`: this runs on workers
 */
export async function hashCommands(payload: CommandPayload): Promise<string> {
  const bytes = new TextEncoder().encode(stable(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** json with every object's keys sorted, arrays left in their order */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`);

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}
