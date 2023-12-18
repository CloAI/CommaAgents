from typing import TypedDict, Optional
from comma_agents.agents.base_agent import BaseAgent
from openai import OpenAI

class OpenAIAPIAgent(BaseAgent):
    
    class OpenAIAPIAgentConfig(TypedDict, total=True):
        """Configuration for OpenAI API Model Compatible Agent
        """
        model_name: Optional[str]
        base_url: Optional[str]
        api_key: Optional[str]
        
    def __init__(self, name: str, config: OpenAIAPIAgentConfig, **kwargs):
        super().__init__(name, **kwargs)
        self.openai_api_client = OpenAI(
            api_key=config.get("api_key", None),
            base_url=config.get("base_url", None)
        )
        self.config = config
        
    def _call_llm(self, message: str):
        # Put the system message
        messages = [{
            "role": "system",
            "content": self.prompt_template.parameters["system_message"],
        }]
        
        # Put the historical context messages if there are any
        for historical_context_item in self.prompt_template.historical_context:
            messages.append({
                "role": "user",
                "content": historical_context_item["user_message"],
            })
            messages.append({
                "role": "assistant",
                "content": historical_context_item["assistant_message"],
            })
        
        # Put the user message for the api to return
        messages.append({
            "role": "user",
            "content": message,
        })
        
        model_response = self.openai_api_client.chat.completions.create(messages=messages, model=self.config["model_name"])
        
        return model_response.choices[0].message.content