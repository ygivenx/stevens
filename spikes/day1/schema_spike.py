import json, os
from openai import OpenAI
client = OpenAI(base_url='https://api.meta.ai/v1', api_key=os.environ['MODEL_API_KEY'])
schema = {
    'type': 'object',
    'properties': {
        'entity': {'type': 'string'},
        'metric': {'type': 'string'},
        'value': {'type': 'string'},
        'quote': {'type': 'string'},
    },
    'required': ['entity', 'metric', 'value', 'quote'],
    'additionalProperties': False,
}
resp = client.responses.create(
    model='muse-spark-1.3',
    reasoning={'effort': 'low'},
    input='Extract the churn claim as JSON. Text: At the Oct 20 talk, Speaker 2 at 14:32 said: mid-market churn in this category runs 6-8%.',
    text={'format': {'type': 'json_schema', 'name': 'claim', 'schema': schema, 'strict': True}},
)
print('responseId:', resp.id)
print('model:', resp.model)
u = resp.usage
print('usage: in=%s out=%s total=%s' % (u.input_tokens, u.output_tokens, u.total_tokens))
print('output_text:')
print(resp.output_text)
parsed = json.loads(resp.output_text)
print('parses as JSON with keys:', sorted(parsed.keys()))
