import { getAllDocs, generateMarkdown } from '../src/index.js';
import path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

test('it should generate some simple types', async () => {
  const docs = await getAllDocs(path.join(__dirname, '__fixtures__/simple.ts'));
  expect(docs.map((doc) => generateMarkdown(doc))).toMatchSnapshot();
});
