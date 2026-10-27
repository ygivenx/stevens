import base64, json, os, sys

def img_data_url(path):
    with open(path, 'rb') as f:
        return 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode()

def run(client, path, label):
    resp = client.responses.create(
        model='muse-spark-1.3',
        reasoning={'effort': 'low'},
        input=[{
            'role': 'user',
            'content': [
                {'type': 'input_text', 'text': 'Transcribe every word visible in this photo verbatim, in reading order. Return only the transcribed text.'},
                {'type': 'input_image', 'image_url': img_data_url(path)},
            ],
        }],
    )
    print('=== ' + label + ' ===')
    print('responseId:', resp.id)
    print('model:', resp.model)
    u = resp.usage
    print('usage: in=%s out=%s total=%s' % (u.input_tokens, u.output_tokens, u.total_tokens))
    print('output_text:')
    print(resp.output_text)
    print()

from openai import OpenAI
client = OpenAI(base_url='https://api.meta.ai/v1', api_key=os.environ['MODEL_API_KEY'])
run(client, 'slide.jpg', 'slide.jpg')
run(client, 'deck.jpg', 'deck.jpg')
