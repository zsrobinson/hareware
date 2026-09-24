/*
  The `/article` registration. Discord bakes choices into the registration, so
  a schema change in Notion needs a re-registration: `refresh-commands.ts`.
*/
import type { ChoiceOption } from "~/lib/articles/choices";
import { ARTICLE_PROPERTIES } from "~/lib/articles/config";

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
  autocomplete?: boolean;
};

export type ApplicationCommand = {
  name: string;
  description: string;
  /**
   * "0" hides it until an admin grants a role. A default only: interactions.ts
   * checks the role.
   */
  default_member_permissions: string;
  options: CommandOption[];
};

export type CommandPayload = ApplicationCommand[];

/** the choices for one notion property, in notion's order */
export function choicesFor(
  choices: ChoiceOption[],
  property: string,
): CommandChoice[] {
  return (
    choices
      .filter((choice) => choice.property === property)
      .sort((a, b) => a.position - b.position)
      /* a 26th choice makes Discord reject every command; refresh-commands
         reports the cut */
      .slice(0, MAX_CHOICES)
      .map((choice) => ({ name: choice.name, value: choice.name }))
  );
}

type Subcommand = {
  name: string;
  description: string;
  options: (choices: ChoiceOption[]) => CommandOption[];
};

const STRING = 3;
const BOOLEAN = 5;
/** Discord's user picker, which ADR 0009 credits people with */
const USER = 6;

/**
 * autocompleted, since there are more Articles than 25 choices. Answers a page
 * id.
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
 * a picker whose options are Notion's; ADR 0009 keeps Notion values out of the
 * repo
 */
function chooser(
  choices: ChoiceOption[],
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

/** the options both credits take; `byline` is a pseudonym (ADR 0004) */
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
      type: BOOLEAN,
      name: "also",
      description:
        "Add this person to the existing credit instead of replacing it.",
      options: [],
    },
  ];
}

/** the payload to register */
export function buildCommands(choices: ChoiceOption[]): CommandPayload {
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
