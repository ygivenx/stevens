import json, os
from openai import OpenAI
client = OpenAI(base_url='https://api.meta.ai/v1', api_key=os.environ['MODEL_API_KEY'])
text = 'At the Oct 20 talk, Speaker 2 at 14:32 said: mid-market churn in this category runs 6-8%.'
for model in ['muse-spark-1.3', 'muse-spark-1.3-contributor']:
    resp = client.responses.create(
        model=model,
        reasoning={'effort': 'low'},
        input='Extract one JSON claim {entity, metric, value, quote} from: ' + text,
        text={'format': {'type': 'json_schema', 'name': 'c', 'schema': {
            'type': 'object',
            'properties': {k: {'type': 'string'} for k in ['entity', 'metric', 'value', 'quote']},
            'required': ['entity', 'metric', 'value', 'quote'],
            'additionalProperties': False}, 'strict': True}},
    )
    u = resp.usage
    print('=== %s ===' % model)
    print('responseId:', resp.id, '| in=%s out=%s' % (u.input_tokens, u.output_tokens))
    print(resp.output_text)
