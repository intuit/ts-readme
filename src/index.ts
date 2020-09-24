import ts from 'typescript';
import fs from 'fs';
import prettier from 'prettier';
import glob from 'fast-glob';

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

interface Param {
  /** The name of the param */
  name: string;
  /** A description of the param */
  description?: string;
  /** The type of the param */
  type: string;
}

interface TypeScriptDocument {
  /** The title of the exported thing */
  title: string;
  /** The description of the exported thing */
  description?: string;
  /** Example of usage */
  examples?: string[];
  /** Params if applicable */
  params?: Param[];
  /** Properties if applicable */
  properties?: string[];
  /** Interface members if applicable */
  members?: string[];
  /** The type of the exported member */
  type?: string;
  /** If a function the type of the return */
  returnType?: string;
}

/** Return the jsDoc comment if there is one */
function getJsDocComment(statement: ts.Node) {
  return (statement as any).jsDoc && (statement as any).jsDoc[0]
    ? (statement as any).jsDoc[0].comment
    : '';
}

/** Determine if a constant is a function decl */
function isArrowConst(statement: ts.Node): statement is ts.VariableStatement {
  return Boolean(
    ts.isVariableStatement(statement) &&
      statement.declarationList.declarations[0].initializer &&
      ts.isArrowFunction(statement.declarationList.declarations[0].initializer)
  );
}

/** Get the type of a statement */
function getType(statement: ts.Node) {
  if (isArrowConst(statement) || ts.isFunctionLike(statement)) {
    return 'function';
  }

  if (ts.isTypeAliasDeclaration(statement)) {
    return 'type';
  }

  if (ts.isClassDeclaration(statement)) {
    return 'class';
  }

  if (ts.isInterfaceDeclaration(statement)) {
    return 'interface';
  }

  if (ts.isVariableStatement(statement)) {
    if (statement.declarationList.declarations[0].type) {
      return `variable: ${printer.printNode(
        ts.EmitHint.Unspecified,
        statement.declarationList.declarations[0].type,
        statement.getSourceFile()
      )}`;
    }

    return 'variable';
  }
}

/** Get the type of a param */
function print(param: ts.Node): string {
  return printer.printNode(
    ts.EmitHint.Unspecified,
    param,
    param.getSourceFile()
  );
}

/**
 * Generate the markdown docs a doc returned from `getAllDocs`
 *
 * @param doc - The TypeScript document to generate types for
 */
export function generateMarkdown(doc: TypeScriptDocument, headerDepth = 3) {
  let result = `${Array(headerDepth)
    .fill('#')
    .join('')} \`${doc.title}\` (${doc.type})\n\n`;

  if (doc.description) {
    result += `${doc.description}\n\n`;
  }

  if (doc.params && doc.params.length > 0) {
    result += '**Parameters:**\n\n';

    doc.params.forEach(param => {
      result += `- ${param.name} ${param.type ? `(\`${param.type}\`) ` : ''}${
        param.description ? `- ${param.description}` : ''
      }\n`;
    });

    result += '\n';
  }

  if (doc.properties && doc.properties.length > 0) {
    result += '**Properties:**\n\n';

    doc.properties.forEach(property => {
      result += `- ${property}\n`;
    });

    result += '\n';
  }

  if (doc.members && doc.members.length > 0) {
    result += '**Members:**\n\n';

    doc.members.forEach(member => {
      result += `- ${member}\n`;
    });

    result += '\n';
  }

  if (doc.returnType) {
    result += `**returns:** ${doc.returnType}\n\n`;
  }

  if (doc.examples && doc.examples.length > 0) {
    doc.examples.forEach(example => {
      result += `${
        example.includes('```') ? example : `\`\`\`tsx\n${example}\n\`\`\`\n`
      }\n`;
    });

    result += '\n';
  }

  return result;
}

/** Get the docs for all functions and interfaces exported from the file */
function getDocs(filenames: string[]): TypeScriptDocument[] {
  const program = ts.createProgram({ rootNames: filenames, options: {} });
  const checker = program.getTypeChecker();

  /** Match jsdoc name to function type decl */
  function getParamType(doc: ts.JSDocParameterTag, statement: ts.Node) {
    const name = print(doc.name);
    const fn = isArrowConst(statement)
      ? statement.declarationList.declarations[0].initializer
      : statement;

    if (!fn || !ts.isFunctionLike(fn)) {
      return '';
    }

    const paramType = fn.parameters.find(param => print(param.name) === name);

    return paramType
      ? checker.typeToString(checker.getTypeAtLocation(paramType))
      : '';
  }

  const docs = program
    .getSourceFiles()
    .filter(file => !file.isDeclarationFile)
    .map(file =>
      file.statements
        .filter((s): s is
          | ts.VariableStatement
          | ts.FunctionDeclaration
          | ts.TypeAliasDeclaration
          | ts.ClassDeclaration
          | ts.InterfaceDeclaration =>
          Boolean(
            s.modifiers &&
              // This determines if it is exported
              s.modifiers.find(e => e.kind === ts.SyntaxKind.ExportKeyword) &&
              (ts.isVariableStatement(s) ||
                ts.isFunctionLike(s) ||
                ts.isTypeAliasDeclaration(s) ||
                ts.isClassDeclaration(s) ||
                ts.isInterfaceDeclaration(s))
          )
        )
        .map(statement => {
          const title = ts.isVariableStatement(statement)
            ? print(statement.declarationList.declarations[0].name)
            : (statement.name && print(statement.name)) || '';

          const description = getJsDocComment(statement);
          const jsDocs = ts.getJSDocTags(statement);

          let returnType: string | undefined;

          const params: Param[] = jsDocs
            .filter(ts.isJSDocParameterTag)
            .map((doc: ts.JSDocParameterTag) => ({
              name: print(doc.name),
              description: doc.comment ? doc.comment.replace(/^- /, '') : '',
              type: getParamType(doc, statement)
            }));

          if (ts.isFunctionLike(statement)) {
            statement.parameters.forEach(param => {
              const paramName = print(param.name);

              if (params.find(p => p.name === paramName)) {
                return;
              }

              params.push({
                name: paramName,
                type: checker.typeToString(checker.getTypeAtLocation(param))
              });
            });

            const type = checker.getTypeAtLocation(statement);

            [returnType] = type
              .getCallSignatures()
              .map(sig =>
                checker.typeToString(checker.getReturnTypeOfSignature(sig))
              );
          }

          let members: string[] = [];

          if (ts.isInterfaceDeclaration(statement)) {
            members = statement.members.map(member => {
              const memberDescription = getJsDocComment(member);

              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              return `${print(member.name!).replace(
                /\/\*\*.*\*\/\s+(\S+)/,
                '$1'
              )} (\`${checker.typeToString(
                checker.getTypeAtLocation(member)
              )}\`)${memberDescription ? ` - ${memberDescription}` : ''}`;
            });
          }

          const examples = jsDocs
            .filter(doc => doc.tagName.escapedText === 'example')
            .map(doc => doc.comment)
            .filter((doc): doc is string => Boolean(doc));

          const properties = jsDocs
            .filter(doc => doc.tagName.escapedText === 'property')
            .map(doc => doc.comment)
            .filter((doc): doc is string => Boolean(doc));

          return {
            title,
            description,
            examples,
            params,
            properties,
            returnType,
            members,
            type: getType(statement)
          };
        })
    );

  return docs.reduce((acc, item) => [...acc, ...item], []);
}

/**
 * Get the docs for all some files in the project.
 *
 * @param pattern - A glob pattern or patterns to match files from
 */
export async function getAllDocs(
  pattern: string | string[] = ['./src/**/*.(ts|tsx)', '!**/__tests__']
) {
  const files = await glob(pattern);
  return getDocs(files);
}

/**
 * Create a markdown comment matcher. This matches the section where
 * we will insert docs. Use this to create a custom section.
 *
 * @param name - The name to use in the markdown comment
 */
export function createMatcher(name: string) {
  return new RegExp(
    `(<!-- ${name} START -->\\s*)([\\S\\s]*)(\\s*<!-- ${name} END -->)`
  );
}

export interface GenerateOptions {
  /** A regex to match the part of the readme  */
  matcher?: RegExp;
  /** A glob pattern or patterns to match files from */
  pattern?: string | string[];
  /** How deep the markdown headers should be */
  headerDepth?: number;
}

/**
 * Generate all the docs and put it in the README.
 *
 * @param options - Options for generating the docs
 *
 * @example
 * import generate, { createMatcher } from 'ts-readme';
 *
 * generate({ matcher: createMatcher('TS-README-GENERATED') })
 */
export default async function generate(options: GenerateOptions = {}) {
  const {
    matcher = createMatcher('INSERT GENERATED DOCS'),
    pattern,
    headerDepth = 3
  } = options;
  const docs = await getAllDocs(pattern);
  const markdown = docs.map(doc => generateMarkdown(doc, headerDepth));

  let readme = fs.readFileSync('./README.md', 'utf8');

  if (readme.match(matcher)) {
    readme = readme.replace(matcher, `$1${markdown.join('\n')}$3`);

    fs.writeFileSync(
      './README.md',
      prettier.format(readme, { parser: 'markdown', singleQuote: true })
    );
  }
}
