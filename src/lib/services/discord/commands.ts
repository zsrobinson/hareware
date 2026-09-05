/*
  Builds `/article` registration data from Notion's current choices.

  discord bakes an option's choices into the *registration* rather than
  resolving them when somebody opens the picker, so the choices notion offers
  have to be folded in here and re-registered when the schema changes —
  `refresh-commands.ts` is what does that, and `register.ts` is what puts the
  payload on the guild.
*/
import { ARTICLE_PROPERTIES } from "~/lib/articles/config";

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

const SUB_COMMAND = 1;
/** discord will not show a 26th choice, in a registration or an autocomplete */
export const MAX_CHOICES = 25;

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
      are whatever notion currently holds */
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

const STRING = 3;
const BOOLEAN = 5;
/**
 * discord's native user picker.
 *
 * ADR 0009 credits people with this rather than a search over Members: the
 * user always exists, the list is always current, and the interaction payload
 * resolves their display name under `data.resolved`, so it costs no request
 */
const USER = 6;

/**
 * the article picker, which every subcommand about one article takes first.
 *
 * autocompleted rather than choice-listed: there are 138 articles and discord
 * caps a choice list at 25, so the suggestions are computed per keystroke from
 * notion. the value that comes back is a notion page id
 */
const articleOption = (): CommandOption => ({
  type: STRING,
  name: "article",
  description: "Choose an article by typing part of its headline.",
  options: [],
  required: true,
  autocomplete: true,
});

const SUBCOMMANDS: Subcommand[] = [
  {
    name: "ping",
    description:
      "Check whether HareWare is online and see your Discord display name.",
    options: () => [],
  },
  {
    name: "show",
    description: "Show an article's current details and open it in Notion.",
    options: () => [articleOption()],
  },
  {
    name: "new",
    description: "Create an approved article in Notion before writing begins.",
    options: (choices) => [
      {
        type: STRING,
        name: "headline",
        description: "The working headline approved by the section editor.",
        options: [],
        required: true,
      },
      {
        type: USER,
        name: "member",
        description:
          "The Discord member writing the article. Creates or links their Members row.",
        options: [],
        required: true,
      },
      chooser(
        choices,
        "section",
        ARTICLE_PROPERTIES.section.name,
        "The section responsible for editing the article.",
        true,
      ),
      {
        type: STRING,
        name: "byline",
        description:
          "Their pseudonym, if the article should publish under one.",
        options: [],
      },
    ],
  },
  {
    name: "headline",
    description: "Change the headline of an existing article.",
    options: () => [
      articleOption(),
      {
        type: STRING,
        name: "headline",
        description: "The article's new working or final headline.",
        options: [],
        required: true,
      },
    ],
  },
  {
    name: "status",
    description: "Update an article's progress through editing and publishing.",
    options: (choices) => [
      articleOption(),
      chooser(
        choices,
        "status",
        ARTICLE_PROPERTIES.status.name,
        "The article's new editorial or publishing status.",
        true,
      ),
    ],
  },
  {
    name: "image-status",
    description: "Update the progress of an article's image.",
    options: (choices) => [
      articleOption(),
      chooser(
        choices,
        "image-status",
        ARTICLE_PROPERTIES.imageStatus.name,
        "The image's new progress status.",
        true,
      ),
    ],
  },
  {
    name: "section",
    description: "Move an article to the section responsible for editing it.",
    options: (choices) => [
      articleOption(),
      chooser(
        choices,
        "section",
        ARTICLE_PROPERTIES.section.name,
        "The section that should take over editing the article.",
        true,
      ),
    ],
  },
  {
    name: "publication-date",
    description: "Set or clear the date an article is scheduled to publish.",
    options: () => [
      articleOption(),
      {
        type: STRING,
        name: "date",
        description:
          "Publication date in YYYY-MM-DD format. Leave blank to clear it.",
        options: [],
      },
    ],
  },
  {
    name: "author",
    description: "Set or add an article's writer and printed author byline.",
    options: () => creditOptions("author"),
  },
  {
    name: "image-crew",
    description: "Set or add the image creator and printed image byline.",
    options: () => creditOptions("image"),
  },
  {
    name: "delete",
    description: "Move an article to Notion's Trash, where it can be restored.",
    options: () => [articleOption()],
  },
];

/**
 * a picker whose options are notion's, never ours.
 *
 * the subcommand's own name is dropped from the option name — `/article status
 * status:` reads badly — but the *choices* are whatever the schema currently
 * holds, which is why this takes them rather than closing over a constant. see
 * ADR 0009: no notion value is typed into this repo
 */
function chooser(
  choices: ChoiceInput[],
  name: string,
  property: string,
  description: string,
  required: boolean,
): CommandOption {
  return {
    type: STRING,
    name,
    description,
    options: [],
    choices: choicesFor(choices, property),
    required,
  };
}

/**
 * the three options both credits take.
 *
 * a credit always names the Discord member behind it. the optional text is
 * only the pseudonym printed instead of that member's name (ADR 0004).
 */
function creditOptions(credit: "author" | "image"): CommandOption[] {
  return [
    articleOption(),
    {
      type: USER,
      name: "member",
      description:
        credit === "author"
          ? "The Discord member who wrote the article. Creates or links their Members row."
          : "The Discord member who made the image. Creates or links their Members row.",
      options: [],
      required: true,
    },
    {
      type: STRING,
      name: "byline",
      description:
        credit === "author"
          ? "Their pseudonym, if the article should publish under one."
          : "Their pseudonym, if the image should be credited under one.",
      options: [],
    },
    {
      /* "also", not "add": the editor is saying somebody else worked on this
         too, and the word has to read that way beside a name */
      type: BOOLEAN,
      name: "also",
      description:
        "Add this person to the existing credit instead of replacing it.",
      options: [],
    },
  ];
}

/** the payload to register: `/article`, with everything notion currently offers */
export function buildCommands(choices: ChoiceInput[]): CommandPayload {
  return [
    {
      name: "article",
      description: "Manage The Hare's articles in Notion from Discord.",
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
