from ..base_agent import BaseAgent
from litellm import completion

class LiteLLMAgent(BaseAgent):
    def __init__(self, name = 'Lite LLM Agent', model_name='', hooks={}, **kwargs):
        super().__init__(name=name, hooks=hooks, **kwargs)
        self.model_name = model_name

    def _call_llm(self, prompt, **kwargs):
        response = completion(
            model=self.model_name,
            messages=[
                {
                    "content": prompt,
                    "role": "user"
                }
            ])
        return response.choices[0].message.content
