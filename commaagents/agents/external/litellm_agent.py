from ..base_agent import BaseAgent
from litellm import completion

# Assuming BaseAgent is defined as per your previous implementation
class LiteLLMAgent(BaseAgent):
    def __init__(self, model_name, **hooks):
        super().__init__(model_name, **hooks)

    def _call_llm(self, messages, **kwargs):
        if not isinstance(messages, list):
            response = completion(model=self.model_name, messages=messages, **kwargs)
        else: 
            # Making the completion call using LiteLLM
            response = completion(self.model_name, messages, **kwargs)
        return response
