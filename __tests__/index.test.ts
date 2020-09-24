import { getAllDocs, generateMarkdown } from '../src';
import path from 'path';

test('it should generate some simple types', async () => {
  const docs = await getAllDocs(path.join(__dirname, '__fixtures__/simple.ts'));
  expect(docs.map(doc => generateMarkdown(doc))).toMatchSnapshot();
});
