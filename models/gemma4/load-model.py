import torch
import json
from transformers import AutoProcessor, AutoModelForCausalLM

MODEL_ID = "google/gemma-4-E2B-it"

processor = AutoProcessor.from_pretrained(MODEL_ID)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID, 
    dtype=torch.bfloat16, 
    device_map="auto"
)

schema = {
  "painting visual elements": [
    "color palette",
    "brushwork",
    "composition",
    "light and shadow",
    "texture",
    "line and form",
    "perspective",
    "symbolism"
    ],
    "visual narrative": [
    "storytelling",
    ],
    "emotions portrayed": [
    "emotional impact",
    "mood",
    "atmosphere"
    ],
    "detailed analysis": [
    "description"
    ]
}

# Prompt
messages = [
    {"role": "system", "content": "You are a visual art expert with a deep understanding of art history, styles, and techniques. You analyze paintings in detail, providing insights into the visual elements of the artwork, highlighing the most relevant ones, the visual narrative, and the emotions portrayed. Respond in a structured format, following the schema provided. {json.dumps(schema)}"},
    {"role": "user", "content": "Make me an analysis of the painting 'The Starry Night' by Vincent van Gogh."},
]

# Process input
text = processor.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=True,
    enable_thinking=False
)
inputs = processor(text=text, return_tensors="pt").to(model.device)
input_len = inputs["input_ids"].shape[-1]

# Generate output
outputs = model.generate(**inputs, max_new_tokens=1024)
response = processor.decode(outputs[0][input_len:], skip_special_tokens=False)

# Parse thinking
processor.parse_response(response)

print(response)