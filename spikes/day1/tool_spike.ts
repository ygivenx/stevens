import { Type, type Context, type Tool } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';

const models = builtinModels();
const model = models.getModel('meta', 'muse-spark-1.3');
if (!model) { console.error('meta/muse-spark-1.3 not in catalog'); process.exit(2); }
console.log('model found:', model.id);

const tools: Tool[] = [{
  name: 'get_quote',
  description: 'Return the verbatim quote for a claim id',
  parameters: Type.Object({ claimId: Type.String({ description: 'The claim id' }) }),
}];

const context: Context = {
  systemPrompt: 'You answer with citations. Always call get_quote for claim c1 before answering.',
  messages: [{ role: 'user', content: 'What did Speaker 2 say about churn? Use claim c1.', timestamp: Date.now() }],
  tools,
};

const s = models.stream(model, context);
for await (const event of s) {
  if (event.type === 'toolcall_end') console.log('TOOLCALLED:', event.toolCall.name, JSON.stringify(event.toolCall.arguments));
  if (event.type === 'text_delta') process.stdout.write(event.delta);
  if (event.type === 'done') console.log('\nDONE:', event.reason);
  if (event.type === 'error') { console.error('\nERROR:', event.error.errorMessage); process.exit(1); }
}
const final = await s.result();
console.log('final blocks:', final.content.map(b => b.type).join(','));
