from typing import TypedDict
from comma_agents.agents.base_agent import BaseAgent
from openai import OpenAI

class OpenAIAPIAgent(BaseAgent):
    
    class OpenAIAPIAgentConfig(TypedDict, total=True):
        """Configuration for OpenAI API Model Compatible Agent
        """
        model_name: str
        base_url: str
        api_key: str
        
        
    def __init__(self, name: str, config: OpenAIAPIAgentConfig):
        
        # Crate the OpenAI API Model Compatible Agent Config and set the defaults
        self.config: OpenAIAPIAgent.OpenAIAPIAgentConfig = {
            "base_url": config.get("base_url", OpenAI.base_url),   
            "api_key": config.get("api_key", OpenAI.api_key),
            "model_name": config.get("model_name", "gpt-3.5-turbo"),
        }
        self.openai_api_client = OpenAI()
        
    def _call_llm(self, prompt='', *args, **kwargs):
        # 
        return self.openai_api_client.chat.completions.create(messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
        model="gpt-3.5-turbo",
        )