import { app, Command } from 'command-line-application';
import generate, {createMatcher} from '.';

const tsReadme: Command = {
  name: 'ts-readme',
  description: 'Generate docs from typescript + jsdoc and put it in a README',
  examples: [
    {
      example: 'ts-readme',
      desc: 'Generate docs for everything in "src/"'
    },
    {
      example: 'ts-readme "components/**/*.(ts|tsx)"',
      desc: 'Target specific files'
    }
  ],
  options: [
    {
      name: 'pattern',
      type: String,
      defaultOption: true,
      multiple: true,
      description: 'The files to generate docs for'
    },
    {
      name: 'header-depth',
      type: Number,
      description: 'How deep the markdown headers should be'
    },
    {
      name: 'matcher',
      type: String,
      description: 'A string for creating and matching the markdown section to insert docs into'
    }
  ]
};

const args = app(tsReadme);

if (args) {
  const matcher = args.matcher ? createMatcher(args.matcher) : undefined;
  generate({ pattern: args.pattern, headerDepth: args.headerDepth, matcher });
}
